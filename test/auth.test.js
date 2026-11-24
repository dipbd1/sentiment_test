import '../test-support/auth-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app } from '../src/app.js';
import { RefreshToken, closeDatabase, syncDatabase } from '../src/db/index.js';
import { GENERIC_AUTH_MESSAGE } from '../src/lib/httpError.js';
import { readSetCookies } from '../test-support/cookies.js';

const PASSWORD = 'Password1';

function email() {
  return `user-${randomUUID()}@example.com`;
}

function assertSession(response, status) {
  assert.equal(response.status, status);
  assert.equal(typeof response.body.accessToken, 'string');
  assert.ok(response.body.accessToken.length > 0);
  assert.deepEqual(Object.keys(response.body.user).sort(), ['email', 'id', 'role']);
  assert.equal(response.body.user.role, 'user');
  assert.equal(response.body.refreshToken, undefined);
  assert.equal(response.body.user.name, undefined);

  const { cookies, lines } = readSetCookies(response);
  assert.equal(cookies.access_token, response.body.accessToken);
  assert.equal(typeof cookies.refresh_token, 'string');
  assert.ok(cookies.refresh_token.length > 0);

  const accessLine = lines.find((line) => line.startsWith('access_token='));
  const refreshLine = lines.find((line) => line.startsWith('refresh_token='));
  assert.ok(accessLine);
  assert.ok(refreshLine);
  assert.match(accessLine, /HttpOnly/i);
  assert.match(accessLine, /Secure/);
  assert.match(accessLine, /SameSite=Strict/i);
  assert.match(accessLine, /Path=\/(;|$)/);
  assert.match(refreshLine, /HttpOnly/i);
  assert.match(refreshLine, /Secure/);
  assert.match(refreshLine, /SameSite=Strict/i);
  assert.match(refreshLine, /Path=\/api\/auth/);
  return cookies;
}

describe('auth', { concurrency: false }, () => {
  before(async () => {
    await syncDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  it('registers and logs in with an access token and both cookies', async () => {
    const address = email();
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: address, password: PASSWORD, name: 'Ada' });
    const registeredCookies = assertSession(registered, 201);
    assert.equal(registered.body.user.email, address);

    const loggedIn = await request(app)
      .post('/api/auth/login')
      .send({ email: address, password: PASSWORD });
    const loggedInCookies = assertSession(loggedIn, 200);
    assert.equal(loggedIn.body.user.id, registered.body.user.id);
    assert.notEqual(loggedInCookies.refresh_token, registeredCookies.refresh_token);

    const listed = await request(app)
      .get('/api/posts')
      .set('Cookie', `access_token=${loggedInCookies.access_token}`);
    assert.equal(listed.status, 200);
  });

  it('uses one generic 401 for a wrong password and an unknown email', async () => {
    const address = email();
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: address, password: PASSWORD });
    assert.equal(registered.status, 201);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: address, password: 'Wrongpass1' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: email(), password: PASSWORD });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.body.error.code, 'UNAUTHORIZED');
    assert.equal(unknownEmail.body.error.code, 'UNAUTHORIZED');
    assert.equal(wrongPassword.body.error.message, GENERIC_AUTH_MESSAGE);
    assert.equal(unknownEmail.body.error.message, wrongPassword.body.error.message);
    assert.equal(wrongPassword.body.stack, undefined);
    assert.equal(wrongPassword.body.error.stack, undefined);
  });

  it('returns 409 when the email is already registered', async () => {
    const address = email();
    const first = await request(app)
      .post('/api/auth/register')
      .send({ email: address, password: PASSWORD, name: 'Ada' });
    assert.equal(first.status, 201);

    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ email: address.toUpperCase(), password: PASSWORD, name: 'Ada' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'CONFLICT');
    assert.equal(duplicate.body.stack, undefined);
  });

  it('rejects a weak password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: email(), password: 'lowercaseonly' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  it('rotates the refresh cookie and revokes the family on reuse', async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: email(), password: PASSWORD });
    const original = assertSession(registered, 201);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${original.refresh_token}`);
    const rotated = assertSession(refreshed, 200);
    assert.notEqual(rotated.refresh_token, original.refresh_token);
    assert.equal(refreshed.body.user.id, registered.body.user.id);

    const reused = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${original.refresh_token}`);
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'UNAUTHORIZED');
    assert.equal(reused.body.error.message, GENERIC_AUTH_MESSAGE);

    const remaining = await RefreshToken.count({
      where: { userId: registered.body.user.id },
    });
    assert.equal(remaining, 0);

    const replacement = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${rotated.refresh_token}`);
    assert.equal(replacement.status, 401);
    assert.equal(replacement.body.error.message, GENERIC_AUTH_MESSAGE);
  });

  it('returns the same 401 when the refresh cookie is missing', async () => {
    const response = await request(app).post('/api/auth/refresh');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
    assert.equal(response.body.error.message, GENERIC_AUTH_MESSAGE);
  });

  it('clears cookies and deletes the presented refresh row on logout', async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: email(), password: PASSWORD });
    const cookies = assertSession(registered, 201);

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `refresh_token=${cookies.refresh_token}`);
    assert.equal(response.status, 204);
    assert.equal(response.text, '');

    const { lines } = readSetCookies(response);
    assert.ok(lines.some((line) => line.startsWith('access_token=')));
    assert.ok(lines.some((line) => line.startsWith('refresh_token=')));

    const remaining = await RefreshToken.count({
      where: { userId: registered.body.user.id },
    });
    assert.equal(remaining, 0);
  });
});
