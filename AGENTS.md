# Agent brief

Express 5 API in plain JavaScript modules. Sequelize is the only data access layer. SQLite file path is `DATABASE_PATH` (default `./data/app.db`).

## Commands

- `npm run dev` — `node --watch src/server.js`
- `npm start` — boot the server
- `npm run seed` — create the admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if that email is missing
- `npm test` — `node --test`

Boot `src/server.js` only when `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are set. Do not commit `.env`.

## File map

- `src/server.js` — env, boot check, sync, listen
- `src/app.js` — middleware and routes, no listen
- `src/config.js` — required boot env
- `src/db/index.js` — Sequelize, associations, `syncDatabase()`
- `src/db/models/` — `User`, `RefreshToken`, `Post`
- `src/lib/tokens.js` — access JWT and hashed refresh rows
- `src/lib/passwords.js` — bcrypt using `BCRYPT_COST`
- `src/lib/cookies.js` — set, clear, and read cookies
- `src/middleware/` — `authenticate`, `requireRole`, `validate`, `errorHandler`
- `src/routes/` — `auth`, `posts`, `admin`
- `scripts/seed.js` — admin seed, not run on boot
- `test/` — `node:test` and Supertest

## Env

Required to boot: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.

Also used: `PORT`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `BCRYPT_COST`, `CORS_ORIGIN`, `DATABASE_PATH`. Seed only: `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Data access

Use the Sequelize models. Do not call `sequelize.query` or put SQL in routes. The one exception is `PRAGMA foreign_keys = ON` in `syncDatabase()` after connect. Models use `underscored: true` and explicit table names. `sequelize.sync()` creates tables. There is no migration CLI.

`User` default scope hides `passwordHash`. Login and any password check uses `User.scope('withPassword')`. Register accepts an optional `name` and does not store or return it.

## Tokens and cookies

- Access JWT claims: `sub`, `email`, `role`. Returned as `accessToken` and set as httpOnly Secure SameSite=Strict cookie `access_token` on path `/`.
- Refresh token is opaque. Persist only the SHA-256 hash via `RefreshToken`. Cookie `refresh_token` is httpOnly Secure SameSite=Strict on path `/api/auth`. Never put it in JSON.
- Refresh rotates: set `revokedAt` and `replacedByTokenHash` on the old row, insert the new hash, set both cookies.
- If a presented hash already has `revokedAt` and `replacedByTokenHash`, delete that user's refresh rows and return 401.
- Login and refresh share the message `Unauthorized` for unknown email, bad password, missing cookie, expired token, and reuse.
- Logout deletes the current refresh row when the cookie is present, clears both cookies, and returns 204.

## Authorization

- Posts: reads and creates require `authenticate`. Update and delete require the author or an admin. Missing post is 404. Anyone else is 403.
- Admin routes require `authenticate` and `requireRole('admin')`.
- Demoting the last admin is 400 `VALIDATION_ERROR`.
- Deleting your own account is 400 `VALIDATION_ERROR`.
- Deleting another user cascades posts and refresh tokens.

## Errors

Client JSON only: `{ "error": { "message", "code" } }`. No stack traces. Codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409. Duplicate email is 409.

## Tests

`npm test` uses Supertest against `src/app.js`. Each test file points `DATABASE_PATH` at its own temp SQLite file and calls `syncDatabase()`. Do not open a port. Close Sequelize when the file ends.
