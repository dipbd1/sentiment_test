import '../test-support/admin-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app } from '../src/app.js';
import { Post, RefreshToken, User, closeDatabase, syncDatabase } from '../src/db/index.js';
import { hashPassword } from '../src/lib/passwords.js';

const PASSWORD = 'Password1';

function email() {
  return `user-${randomUUID()}@example.com`;
}

async function register() {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email: email(), password: PASSWORD });
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

describe('admin', { concurrency: false }, () => {
  before(async () => {
    await syncDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  it('returns 403 when a normal user changes a role', async () => {
    const user = await register();
    const response = await request(app)
      .patch('/api/admin/users/1/role')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ role: 'admin' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
    assert.equal(response.body.stack, undefined);
  });

  it('lists users and updates a role for an admin', async () => {
    const admin = await createAdmin();
    const member = await register();
    const updated = await request(app)
      .patch(`/api/admin/users/${member.user.id}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'admin' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.role, 'admin');
    assert.equal(updated.body.email, member.user.email);
    assert.match(updated.body.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(updated.body.passwordHash, undefined);
    assert.equal(updated.body.password_hash, undefined);

    const listed = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    assert.equal(listed.status, 200);
    const found = listed.body.find((row) => row.id === member.user.id);
    assert.equal(found.role, 'admin');
    assert.equal(found.created_at, updated.body.created_at);
    assert.equal(JSON.stringify(listed.body).includes('password'), false);
  });

  it('refuses to demote the last admin', async () => {
    const admin = await createAdmin();
    const admins = await User.findAll({ where: { role: 'admin' } });
    for (const row of admins) {
      if (row.id !== admin.user.id) {
        await row.update({ role: 'user' });
      }
    }

    const response = await request(app)
      .patch(`/api/admin/users/${admin.user.id}/role`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'user' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');

    const stillAdmin = await User.findByPk(admin.user.id);
    assert.equal(stillAdmin.role, 'admin');
  });

  it('refuses a self-delete and cascades another user', async () => {
    const admin = await createAdmin();
    const selfDelete = await request(app)
      .delete(`/api/admin/users/${admin.user.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    assert.equal(selfDelete.status, 400);
    assert.equal(selfDelete.body.error.code, 'VALIDATION_ERROR');

    const member = await register();
    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ title: 'Temp', body: 'Gone soon' });
    assert.equal(created.status, 201);

    const deleted = await request(app)
      .delete(`/api/admin/users/${member.user.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    assert.equal(deleted.status, 204);

    assert.equal(await Post.findByPk(created.body.id), null);
    assert.equal(await RefreshToken.count({ where: { userId: member.user.id } }), 0);
    assert.equal(await User.findByPk(member.user.id), null);
  });
});
