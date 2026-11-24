# Express auth API

Plain JavaScript (ES modules) REST API. Express 5 serves JSON. Sequelize stores users, refresh tokens, posts, and support conversations in a SQLite file. Auth uses a short-lived JWT plus a rotating refresh cookie. An authenticated support route classifies a customer message and drafts a reply.

The server listens on `PORT` (default `3000`).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file if you do not already have one:

```bash
cp .env.example .env
```

Fill in `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` before starting the server. The process refuses to boot when either value is missing and prints the missing names. `.env` stays untracked.

3. Start the server:

```bash
npm run dev
```

4. Optional: create the first admin. This does not run on server boot.

```bash
npm run seed
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are read only by the seed script. If that email already exists, the row is left unchanged. The seed password is stored as given. The register route's password rules are not applied here.

The SQLite file path comes from `DATABASE_PATH` (default `./data/app.db`). Sequelize creates the directory and the tables on startup. The only raw SQL in the app is `PRAGMA foreign_keys = ON` after connect, so `ON DELETE CASCADE` is enforced.

## Environment

| Variable | Required to boot | Default | Purpose |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | yes |  | Signs and verifies the access JWT |
| `JWT_REFRESH_SECRET` | yes |  | Required at boot alongside the access secret. Refresh tokens are opaque hashes, so this value is not used to sign them. |
| `PORT` |  | `3000` | HTTP port |
| `ACCESS_TOKEN_TTL` |  | `15m` | Access JWT and `access_token` cookie lifetime. A number plus `s`, `m`, `h`, or `d`, such as `15m` or `7d`. |
| `REFRESH_TOKEN_TTL` |  | `7d` | Refresh cookie and stored refresh-row lifetime. Same units as `ACCESS_TOKEN_TTL`. |
| `BCRYPT_COST` |  | `12` | bcrypt cost for new passwords |
| `CORS_ORIGIN` |  | `http://localhost:3000` | Allowed browser origin. Credentials are enabled. |
| `DATABASE_PATH` |  | `./data/app.db` | SQLite file |
| `ADMIN_EMAIL` | seed only |  | Admin email created by `npm run seed` |
| `ADMIN_PASSWORD` | seed only |  | Password stored for that admin |
| `AI_PROVIDER` |  | `openai` | `openai`, `gemini`, `ollama`, or `mock`. An empty value uses `mock` when `NODE_ENV=test` and `openai` otherwise. |
| `AI_API_KEY` |  |  | Key for `openai` and `gemini`. A missing or rejected key does not stop boot. The analyze route returns the fallback body. |
| `AI_BASE_URL` |  | provider default | Overrides the base URL for `openai` and `ollama` |
| `AI_MODEL` |  | provider default | Model name sent to the selected provider |
| `AI_TIMEOUT_MS` |  | `5000` | Abort a model call after this many milliseconds |
| `SUPPORT_RATE_LIMIT` |  | `10` | Analyze requests allowed per minute for one IP and one logged-in user. `npm test` uses `10000` when this is unset. |

## Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `npm run dev` | Run `src/server.js` with `node --watch` |
| `start` | `npm start` | Run the server |
| `seed` | `npm run seed` | Create the admin user from env |
| `test` | `npm test` | Run `node --test` with Supertest against `src/app.js` |

Each test file points `DATABASE_PATH` at its own temp SQLite file and calls `syncDatabase()`. Tests do not open a port.

## Errors

Every client error is JSON. Stack traces are omitted.

```json
{
  "error": {
    "message": "Unauthorized",
    "code": "UNAUTHORIZED"
  }
}
```

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid JSON, invalid body, invalid paging, demoting the last admin, or deleting your own account |
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired access token; failed login; failed or reused refresh |
| `FORBIDDEN` | 403 | Authenticated, but the role or ownership check failed |
| `NOT_FOUND` | 404 | Unknown route, or a missing post or user |
| `CONFLICT` | 409 | Email already registered |
| `RATE_LIMITED` | 429 | More than 10 requests per minute to `/api/auth/*` from one IP, or the support limit on `/api/support/analyze` |
| `INTERNAL_ERROR` | 500 | Unexpected server failure. The message is `Internal server error`. |

Unknown routes use the same shape:

```json
{
  "error": {
    "message": "Not found",
    "code": "NOT_FOUND"
  }
}
```

A body that fails validation lists the Zod messages, joined with `; `:

```json
{
  "error": {
    "message": "Password must be at least 8 characters; Password must include an uppercase letter",
    "code": "VALIDATION_ERROR"
  }
}
```

Login and refresh share one message, `Unauthorized`, for an unknown email, a bad password, a missing cookie, an expired refresh token, and refresh reuse. Protected routes that lack a usable access token use `Authentication required` with the same `UNAUTHORIZED` code.

## Auth

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | 201 `{ user, accessToken }` and both cookies |
| `POST` | `/api/auth/login` | Public | 200, same body and cookies |
| `POST` | `/api/auth/refresh` | Refresh cookie | 200, rotated pair |
| `POST` | `/api/auth/logout` | Optional refresh cookie | 204, empty body |

Register body: `email`, `password`, and an optional `name`. `name` must be a string when it is sent, and it is then discarded. There is no name column. New accounts get role `user`. Email is trimmed and lowercased.

A password needs at least 8 characters, one uppercase letter, one lowercase letter, and one digit. Login only requires a non-empty password; a wrong password is `401`, not a validation error.

Register and login set two cookies and also return the access JWT in JSON:

- `access_token` — httpOnly, Secure, SameSite=Strict, path `/`
- `refresh_token` — httpOnly, Secure, SameSite=Strict, path `/api/auth` only

The access JWT payload is `sub` (user id), `email`, and `role`. Send it as `Authorization: Bearer <token>`, or let the browser send the `access_token` cookie. If an `Authorization` header is present it must be a Bearer token; the cookie is used only when that header is absent.

The refresh token is opaque. Only its SHA-256 hash is stored. It is never placed in the JSON body.

`POST /api/auth/refresh` reads the refresh cookie, marks that row revoked, stores the new token's hash in `replaced_by_token_hash`, inserts the new hash, and sets both cookies again. Presenting a refresh token that was already rotated deletes every refresh row for that user and returns 401. Logout deletes the presented refresh row when the cookie is present, clears both cookies, and returns 204.

Cookie jars (`-c` writes cookies, `-b` sends them) carry the refresh cookie. Copy `accessToken` from the JSON when you call other routes with a bearer token.

### Register

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Password1","name":"Ada"}' \
  http://localhost:3000/api/auth/register
```

`201`:

```json
{
  "user": {
    "id": 1,
    "email": "ada@example.com",
    "role": "user"
  },
  "accessToken": "<jwt>"
}
```

The response also sets the cookies. With the default TTLs the headers look like this (`<jwt>` and `<opaque>` stand in for the real values):

```text
Set-Cookie: access_token=<jwt>; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Strict
Set-Cookie: refresh_token=<opaque>; Max-Age=604800; Path=/api/auth; HttpOnly; Secure; SameSite=Strict
```

Registering the same email again returns `409`:

```json
{
  "error": {
    "message": "Email already registered",
    "code": "CONFLICT"
  }
}
```

### Login

```bash
curl -c cookies.txt -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Password1"}' \
  http://localhost:3000/api/auth/login
```

`200` uses the same `{ user, accessToken }` body as register. An unknown email or a wrong password:

```json
{
  "error": {
    "message": "Unauthorized",
    "code": "UNAUTHORIZED"
  }
}
```

### Refresh

Send the cookie jar from register or login. There is no JSON body.

```bash
curl -c cookies.txt -b cookies.txt -X POST \
  http://localhost:3000/api/auth/refresh
```

`200`:

```json
{
  "user": {
    "id": 1,
    "email": "ada@example.com",
    "role": "user"
  },
  "accessToken": "<jwt>"
}
```

Both cookies are replaced. Calling refresh again with the previous `refresh_token` returns `401` `Unauthorized` and deletes that user's refresh rows, so the newer cookie stops working too.

### Logout

```bash
curl -c cookies.txt -b cookies.txt -X POST \
  http://localhost:3000/api/auth/logout
```

`204` with an empty body. Both cookies are cleared. Logout still returns `204` when the refresh cookie is missing.

## Posts

Every post route requires authentication. Send the access JWT:

```bash
-H "Authorization: Bearer $ACCESS_TOKEN"
```

`$ACCESS_TOKEN` is the `accessToken` field from register, login, or refresh.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/posts?limit&offset` | 200 array. `limit` defaults to 20 and is capped at 100. `offset` defaults to 0. Newest first. |
| `GET` | `/api/posts/:id` | 200 post, or 404 |
| `POST` | `/api/posts` | 201 created post |
| `PUT` | `/api/posts/:id` | 200. Author or admin. 404 if missing, 403 for anyone else. |
| `DELETE` | `/api/posts/:id` | 204. Author or admin. Same 404 and 403 rules. |

A post object always includes `author.email` and never includes a password hash. Timestamps are UTC `YYYY-MM-DD HH:MM:SS`.

```json
{
  "id": 1,
  "title": "Hello",
  "body": "First post",
  "author_id": 1,
  "created_at": "2026-11-24 12:00:00",
  "updated_at": "2026-11-24 12:00:00",
  "author": {
    "email": "ada@example.com"
  }
}
```

### Create

`title` and `body` are required, trimmed, and must be non-empty.

```bash
curl -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"title":"Hello","body":"First post"}' \
  http://localhost:3000/api/posts
```

`201` is the post object above.

### List and read

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  'http://localhost:3000/api/posts?limit=20&offset=0'
```

`200` is an array of post objects, newest first. `limit=0`, a negative `offset`, or a non-integer is `400` `VALIDATION_ERROR`.

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:3000/api/posts/1
```

A missing id:

```json
{
  "error": {
    "message": "Post not found",
    "code": "NOT_FOUND"
  }
}
```

### Update and delete

`PUT` replaces `title` and `body`. The caller must be the author or an admin.

```bash
curl -X PUT -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"title":"Hello again","body":"Edited"}' \
  http://localhost:3000/api/posts/1
```

`200` returns the updated post. Another user's post returns:

```json
{
  "error": {
    "message": "Forbidden",
    "code": "FORBIDDEN"
  }
}
```

```bash
curl -X DELETE -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:3000/api/posts/1
```

`204` with an empty body.

## Admin

These routes require `authenticate` and role `admin`. Seed an admin, log in as that user, and use that `accessToken`.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/admin/users` | 200 array of `id`, `email`, `role`, `created_at` |
| `PATCH` | `/api/admin/users/:id/role` | 200 user. Body is `{ "role": "user" }` or `{ "role": "admin" }`. |
| `DELETE` | `/api/admin/users/:id` | 204. Cascades that user's posts and refresh tokens. |

A signed-in user who is not an admin receives `403`:

```json
{
  "error": {
    "message": "Forbidden",
    "code": "FORBIDDEN"
  }
}
```

### List users

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:3000/api/admin/users
```

`200`:

```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "role": "admin",
    "created_at": "2026-11-24 12:00:00"
  },
  {
    "id": 2,
    "email": "ada@example.com",
    "role": "user",
    "created_at": "2026-11-24 12:05:00"
  }
]
```

### Change a role

```bash
curl -X PATCH -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"role":"admin"}' \
  http://localhost:3000/api/admin/users/2/role
```

`200` is that user object with the new role. Demoting the only remaining admin returns `400`:

```json
{
  "error": {
    "message": "Cannot demote the last admin",
    "code": "VALIDATION_ERROR"
  }
}
```

A missing user is `404` with message `User not found`.

### Delete a user

```bash
curl -X DELETE -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:3000/api/admin/users/2
```

`204` with an empty body. Posts and refresh tokens for that user are removed. Deleting the account you are logged in as returns `400`:

```json
{
  "error": {
    "message": "Cannot delete your own account",
    "code": "VALIDATION_ERROR"
  }
}
```

## Support analysis

`POST /api/support/analyze` requires a logged-in user. The body identifies a customer and the message to classify. `userId` is that customer's id string (1 to 64 characters). It is not the id of the account in the access token. `message` is 1 to 4000 characters.

The route loads the last 10 stored messages for that `userId`, asks the configured model to classify the new message, stores the customer message and the reply, and returns five fields only.

| Field | Values |
| --- | --- |
| `intent` | `deposit_issue`, `withdrawal_issue`, `account_access`, `bonus_query`, `other` |
| `sentiment` | `positive`, `neutral`, `negative` |
| `priority` | `low`, `medium`, `high` |
| `language` | Detected language name, non-empty |
| `response` | Short reply drafted for the customer |

```bash
curl -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"userId":"rahul-001","message":"My withdrawal has been pending for 3 hours. Nobody is helping me. I want my money back."}' \
  http://localhost:3000/api/support/analyze
```

`200` with `AI_PROVIDER=mock` (this is also what the tests expect for that message):

```json
{
  "intent": "withdrawal_issue",
  "sentiment": "negative",
  "priority": "high",
  "language": "English",
  "response": "We understand your concern. Let us check your withdrawal status."
}
```

A live provider returns the same five keys. The `response` text depends on the model.

The same customer id on a later call includes the earlier exchange as history. Customer text is wrapped as untrusted data. Instructions inside the message are not treated as system instructions.

If the model claims a withdrawal, deposit, bonus, or account change was approved or completed, the other four fields are kept and `response` is replaced with:

```text
No account action was taken.
```

A negated claim, such as "your withdrawal was not approved", is left as the model wrote it.

When the provider is down, the call exceeds `AI_TIMEOUT_MS`, or the model returns invalid JSON twice, the route still responds `200` with this fixed body:

```json
{
  "intent": "other",
  "sentiment": "neutral",
  "priority": "medium",
  "language": "English",
  "response": "We could not review this message automatically. A specialist will follow up. No action has been taken on your account."
}
```

The reason is written to the server log. The fallback exchange is stored like any other reply.

Missing auth, an empty message, and the rate limit:

```json
{ "error": { "message": "Authentication required", "code": "UNAUTHORIZED" } }
```

```json
{ "error": { "message": "String must contain at least 1 character(s)", "code": "VALIDATION_ERROR" } }
```

```json
{ "error": { "message": "Too many requests", "code": "RATE_LIMITED" } }
```

The analyze limit is `SUPPORT_RATE_LIMIT` requests per minute (default 10) for the pair of client IP and logged-in user id. `/api/auth/*` has a separate limit of 10 requests per minute per IP.

## AI providers

Set `AI_PROVIDER` in `.env`. Hosted calls need `AI_API_KEY`. Boot succeeds without it; analyze then returns the fallback body above.

| `AI_PROVIDER` | Default model | Default base URL |
| --- | --- | --- |
| `openai` | `gpt-4o-mini` | `https://api.openai.com/v1` |
| `gemini` | `gemini-3.5-flash-lite` | Gemini API (uses `AI_API_KEY` and `AI_MODEL`) |
| `ollama` | `llama3.2` | `http://127.0.0.1:11434/v1` |
| `mock` |  | No network call. Returns the sample withdrawal classification in the support section. |

`AI_BASE_URL` replaces the base URL for `openai` and `ollama`. `AI_MODEL` replaces the model name. An empty `AI_BASE_URL` keeps the default.

Example for a local Ollama server:

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
AI_BASE_URL=http://127.0.0.1:11434/v1
```

Example for OpenAI:

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

Support tests set `AI_PROVIDER=mock`. The auth, posts, and admin tests do not call the model.

## Walkthrough

Start the server with `npm run dev`, then register, create a post, and classify a withdrawal message. Replace `<jwt>` with the `accessToken` from the register response.

Register:

```bash
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"Password1","name":"Ada"}' \
  http://localhost:3000/api/auth/register
```

```json
{
  "user": { "id": 1, "email": "ada@example.com", "role": "user" },
  "accessToken": "<jwt>"
}
```

```bash
export ACCESS_TOKEN='<jwt>'
```

Create a post:

```bash
curl -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"title":"Hello","body":"First post"}' \
  http://localhost:3000/api/posts
```

```json
{
  "id": 1,
  "title": "Hello",
  "body": "First post",
  "author_id": 1,
  "created_at": "2026-11-24 12:00:00",
  "updated_at": "2026-11-24 12:00:00",
  "author": { "email": "ada@example.com" }
}
```

Classify a customer message with the same access token:

```bash
curl -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"userId":"rahul-001","message":"My withdrawal has been pending for 3 hours. Nobody is helping me. I want my money back."}' \
  http://localhost:3000/api/support/analyze
```

```json
{
  "intent": "withdrawal_issue",
  "sentiment": "negative",
  "priority": "high",
  "language": "English",
  "response": "We understand your concern. Let us check your withdrawal status."
}
```

That classification is what `AI_PROVIDER=mock` returns for this message. A live model returns the same keys with its own `response`. To rotate the session afterwards, `POST /api/auth/refresh` with `-b cookies.txt -c cookies.txt`, then replace `ACCESS_TOKEN` with the new `accessToken`.
