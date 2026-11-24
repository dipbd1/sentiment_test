import '../test-support/support-rate-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { app } from '../src/app.js';
import { closeDatabase, syncDatabase } from '../src/db/index.js';

const PASSWORD = 'Password1';

describe('support rate limit', { concurrency: false }, () => {
  before(async () => {
    await syncDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  it('returns 429 after the configured support rate limit', async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: `user-${randomUUID()}@example.com`, password: PASSWORD, name: 'Ada' });
    assert.equal(registered.status, 201);

    const send = () => request(app)
      .post('/api/support/analyze')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .send({
        userId: 'rahul-001',
        message: 'My withdrawal has been pending for 3 hours. Nobody is helping me. I want my money back.',
      });

    const first = await send();
    const second = await send();
    const third = await send();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(third.body.error.code, 'RATE_LIMITED');
    assert.equal(third.body.stack, undefined);
  });
});
