# Express auth API

Plain JavaScript (ES modules) REST API. Express 5 serves JSON, Sequelize stores users, refresh tokens, and posts in a SQLite file, and auth uses a short-lived JWT plus a rotating refresh cookie.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file if you do not already have one:

```bash
cp .env.example .env
```

Fill in `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` before starting the server. The process refuses to boot when either value is missing. `.env` stays untracked.

3. Optional: create the first admin (this does not run on server boot):

```bash
npm run seed
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are read only by the seed script. If that email already exists, the row is left unchanged. The seed password is stored as given; the register route's complexity rules are not applied here.

The SQLite file path comes from `DATABASE_PATH` (default `./data/app.db`). Sequelize creates the directory and tables on startup. The only raw SQL in the app is `PRAGMA foreign_keys = ON` after connect so `ON DELETE CASCADE` is enforced.

## Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `npm run dev` | Run `src/server.js` with `node --watch` |
| `start` | `npm start` | Run the server |
| `seed` | `npm run seed` | Create the admin user from env |
| `test` | `npm test` | Run `node --test` against a temporary SQLite file |

The server listens on `PORT` (default `3000`).

## API

Errors use `{ "error": { "message": "...", "code": "..." } }`.

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid body, invalid paging, demoting the last admin, or deleting your own account |
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired access token; failed login; failed or reused refresh |
| `FORBIDDEN` | 403 | Authenticated, but the role or ownership check failed |
| `NOT_FOUND` | 404 | Unknown route or missing post or user |
| `CONFLICT` | 409 | Email already registered |
| `RATE_LIMITED` | 429 | More than 10 requests per minute to `/api/auth/*` from one IP |

Unknown routes return 404 with the same error shape.

### Auth

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | 201 `{ user: { id, email, role }, accessToken }` |
| `POST` | `/api/auth/login` | Public | 200, same body |
| `POST` | `/api/auth/refresh` | Refresh cookie | 200, rotated pair |
| `POST` | `/api/auth/logout` | Optional refresh cookie | 204 |

Register body: `email`, `password` (at least 8 characters, one uppercase letter, one lowercase letter, one digit), optional `name`. `name` is validated and discarded. There is no name column. New accounts get role `user`.

Login and refresh failures share one message: `Unauthorized`. Register returns 409 `CONFLICT` for a duplicate email.

### Posts

All post routes require authentication.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/posts?limit&offset` | 200 array. `limit` defaults to 20 and is capped at 100. `offset` defaults to 0. Newest first. |
| `GET` | `/api/posts/:id` | 200 or 404 |
| `POST` | `/api/posts` | 201 `{ title, body }` |
| `PUT` | `/api/posts/:id` | 200. Owner or admin. 404 if missing, 403 otherwise. |
| `DELETE` | `/api/posts/:id` | 204. Owner or admin. Same 404 and 403 rules. |

Post JSON includes `author.email` and never includes a password hash.

### Admin

`authenticate` plus role `admin`.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/admin/users` | 200 array of `id`, `email`, `role`, `created_at` |
| `PATCH` | `/api/admin/users/:id/role` | 200 `{ role: "user" \| "admin" }`. 400 if this would demote the last admin. |
| `DELETE` | `/api/admin/users/:id` | 204. Cascades posts and refresh tokens. 400 if the caller deletes themselves. |

## Auth flow

1. Register or login returns an access JWT in `accessToken` and sets two cookies:
   - `access_token` — httpOnly, Secure, SameSite=Strict, path `/`
   - `refresh_token` — httpOnly, Secure, SameSite=Strict, path `/api/auth` only
2. The access JWT payload is `sub` (user id), `email`, and `role`. Send it as `Authorization: Bearer <token>` or let the browser send the access cookie. Default lifetime is `ACCESS_TOKEN_TTL` (`15m`).
3. The refresh token is opaque. Only its SHA-256 hash is stored. It is never returned in JSON. Default lifetime is `REFRESH_TOKEN_TTL` (`7d`).
4. `POST /api/auth/refresh` reads the refresh cookie, marks that row revoked, stores the new token's hash in `replaced_by_token_hash`, inserts the new hash, and sets both cookies again.
5. Presenting a refresh token that was already rotated revokes every refresh row for that user and returns 401.
6. Logout deletes the presented refresh row and clears both cookies.

Protected routes accept the bearer token or the `access_token` cookie.

## curl examples

Cookie jars (`-c` writes cookies, `-b` sends them) are required for the refresh cookie. The access token is also in the JSON body.

Register:

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Password1","name":"Ada"}' \
  http://localhost:3000/api/auth/register
```

Login:

```bash
curl -c cookies.txt -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Password1"}' \
  http://localhost:3000/api/auth/login
```

Create a post with the access token from that JSON:

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"title":"Hello","body":"First post"}' \
  http://localhost:3000/api/posts
```

Change a user's role after `npm run seed` and an admin login. `$ACCESS_TOKEN` is the `accessToken` field from the admin login response:

```bash
curl -c admin.txt -b admin.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"your-admin-password"}' \
  http://localhost:3000/api/auth/login

curl -b admin.txt -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"admin"}' \
  http://localhost:3000/api/admin/users/2/role
```
