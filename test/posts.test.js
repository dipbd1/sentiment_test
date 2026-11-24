import '../test-support/posts-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app } from '../src/app.js';
import { User, closeDatabase, syncDatabase } from '../src/db/index.js';
import { hashPassword } from '../src/lib/passwords.js';
import { readSetCookies } from '../test-support/cookies.js';

const PASSWORD = 'Password1';

function email() {
  return `user-${randomUUID()}@example.com`;
}

async function register() {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email: email(), password: PASSWORD, name: 'Ada' });
  assert.equal(response.status, 201);
  return response.body;
}

async function createAdmin() {
  const address = email();
  const passwordHash = await hashPassword(PASSWORD);
  await User.create({
    email: address,
    passwordHash,
    role: 'admin',
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: address, password: PASSWORD });
  assert.equal(login.status, 200);
  return login.body;
}

describe('posts', { concurrency: false }, () => {
  before(async () => {
    await syncDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  it('returns 401 for a protected route with no token', async () => {
    const response = await request(app).get('/api/posts');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
    assert.equal(response.body.stack, undefined);
  });

  it('returns 403 when a user deletes another user post', async () => {
    const owner = await register();
    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Owner note', body: 'Keep this' });
    assert.equal(created.status, 201);
    assert.equal(created.body.author.email, owner.user.email);
    assert.equal(JSON.stringify(created.body).includes('password'), false);
    assert.match(created.body.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const other = await register();
    const forbidden = await request(app)
      .delete(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');

    const stillThere = await request(app)
      .get(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    assert.equal(stillThere.status, 200);
    assert.equal(stillThere.body.title, 'Owner note');
  });

  it('lets an admin delete any post', async () => {
    const owner = await register();
    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Remove me', body: 'Admin can delete' });
    assert.equal(created.status, 201);

    const admin = await createAdmin();
    const deleted = await request(app)
      .delete(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    assert.equal(deleted.status, 204);
    assert.equal(deleted.text, '');

    const missing = await request(app)
      .get(`/api/posts/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
  });

  it('lists posts newest first without a password hash', async () => {
    const owner = await register();
    const first = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'First', body: 'One' });
    const second = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Second', body: 'Two' });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const listed = await request(app)
      .get('/api/posts?limit=10&offset=0')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body[0].id, second.body.id);
    assert.equal(listed.body[1].id, first.body.id);
    assert.equal(JSON.stringify(listed.body).includes('password'), false);

    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: email(), password: PASSWORD });
    const { cookies } = readSetCookies(registered);
    const byCookie = await request(app)
      .get('/api/posts')
      .set('Cookie', `access_token=${cookies.access_token}`);
    assert.equal(byCookie.status, 200);
  });
});
