# Copilot / Agent Instructions — The Lighthouse

## Quick summary (big picture)
- This is a small Express.js application serving a static HTML front-end under `views/` and a minimal JSON/API backend under `routes/`.
- Authentication uses JWTs; the project contains both cookie-based and Authorization header approaches (some files assume cookie-based JWTs; `server.js` exposes a verifyToken middleware that expects an Authorization header).
- The app uses SQLite databases; there are several files that interact with DBs: `config/db.js` (async open with `sqlite`), `server.js` (direct `sqlite3.Database`), and scripts that use `Users.db`, `lighthouse.db`, or `database.sqlite`. Expect multiple DB files and some overlapping responsibilities.

## Key files & patterns to read first
- `server.js` — main app: sets up Express, static files under `public/`, mounts routes, initializes `Users.db` and `lighthouse.db`, and defines JWT middleware.
- `routes/auth.js` — handles login, /auth/current and logout; sets cookie when logging in.
- `middleware/jwtAuth.js` — provides `ensureAuthenticated`, cookie-based JWT verification helpers and `role` ordering (`ROLE_ORDER`). Use these for protecting pages or API endpoints.
-- `routes/users.js` — contains user CRUD and `GET /users/current`. `/users/current` uses cookie-based JWT via `ensureAuthenticated` and returns `req.user` (id, username, role); do not rely on `req.session` unless explicitly enabling sessions.
- `routes/dashboard.js` — returns dashboard HTML (protected route) and API `GET /dashboard/data`; mimics role-based behavior using `req.user` injected by `ensureAuthenticated`.
- `config/db.js` / `initDB.js` — they contain DB initialization logic; `config/db.js` exposes `initDB()` used across the repo.
- `seedUsers.js`, `createDevUser.js`, `deleteDevUser.js`, `hash.js` — developer utilities (seeding, creating/removing dev user, hashing password).
 - `seedUsers.js`, `createDevUser.js`, `deleteDevUser.js`, `hash.js` — developer utilities (seeding, creating/removing dev user, hashing password). Note: `createDevUser.js` now inserts a role ('dev').

## Common patterns & gotchas for agents
  - `routes/auth.js` sets an HttpOnly cookie on successful login and returns `user` info in JSON. Client-side fetches must use `credentials: 'include'` to ensure cookies are sent and accepted (example: `fetch('/auth/login', { credentials: 'include' })`).
  - `middleware/jwtAuth.js` expects tokens in cookies (`verifyTokenFromCookie()`), and `ensureAuthenticated` should be used to protect page routes. `server.js` exposes a legacy `verifyToken` middleware to support Authorization header-based API clients if needed.
 `routes/users.js` — contains user CRUD endpoints:
  - GET `/users` (admin/dev only) — returns all users (id, username, role, passwordHash, passwordPlain). Note: `passwordHash` is the hashed password stored in the DB; `passwordPlain` is the plaintext password field stored in the DB, visible to admin/dev. Storing plaintext is insecure — the repo now supports this behavior only because the owner requested it. Prefer generating temporary passwords using POST `/users/:id/reset` or `/users/reset-all` instead of keeping plaintext in production.
    - POST `/users/:id/reset` (admin/dev only) — securely generate a temporary password, update the user's stored password hash, and return the temporary plaintext password in the response (one-time only). Note: This is the safe alternative to storing plaintext passwords and is the recommended approach.
      - POST `/users/reset-all` (admin/dev only) — reset all users' passwords to generated temporary passwords and return a list of `username` / `tempPassword` in the response. **Warning**: This will change the users' passwords permanently; old passwords will no longer work.
      - Base64 storage & file logging
        - For admin convenience this repo stores a Base64-encoded password value in DB column `password_base64` and additionally appends log lines to `backups/passwords_base64.txt` for each create/reset/reset-all operation. Example log line:
          ```text
          2025-11-30T12:34:56.789Z	reset	3	digenis	YXNkZmdo...  # ISO timestamp, action, user id, username, base64
          ```
        - This is an insecure pattern (plaintext-equivalent); it exists in repo because the owner requested it. Avoid using it in production; prefer temporary password flows or encrypted storage for recoverable secrets.
   - POST `/users/create` (admin only) — create a user with { username, password, role }.
   - DELETE `/users/:id` (admin only) — delete by id.
   - GET `/users/current` — cookie-based endpoint to return the current user's `id, username, role`.
- Roles are defined using `ROLE_ORDER` in `middleware/jwtAuth.js`: ["user","podcaster","publisher","admin","dev"]. Use `requireAtLeast('publisher')` etc., to protect endpoints.

## How to run & test locally (developer quick commands)
- Install dependencies:

```powershell
npm ci
```

- Run the server with Node (ES modules):

```powershell
node server.js
```

- Seed or manage users:

```powershell
node seedUsers.js
node createDevUser.js
node deleteDevUser.js
node hash.js  # prints a hash for ad-hoc passwords
```

- Environment variables
  ## Quick test checklist (login & dashboard cookie-based auth)
  1. Start the server:

  ```powershell
  node server.js
  ```
  2. Create a dev user (OPTIONAL):
  ```powershell
  node createDevUser.js
  ```
  3. Open http://localhost:5000/login in your browser. Use the dev user credentials.
  4. In browser devtools, confirm the server sets a `token` cookie (HttpOnly) after login and `user` is returned in JSON.
  5. Visiting `/dashboard` should show content only if the cookie is present; use `fetch('/users/current', { credentials: 'include' })` for console checks.
  6. Click logout or POST `/auth/logout` — this should clear cookie and redirect you to `/login`.
  7. Reset a user's password (admin/dev):

  ```powershell
  curl -b cookiejar -X POST http://localhost:5000/users/3/reset
  ```

  The response contains a one-time `tempPassword` field (plaintext) that you must copy securely and communicate to the user; it is not stored or retrievable afterwards.

  - Server reads `JWT_SECRET` from an `.env` file (via `dotenv`). Create a small `.env` containing `JWT_SECRET` and optionally `PORT`.

## Windows dev notes (sqlite3 native binary)
If you see an error about `node_sqlite3.node` (invalid Win32 application), you'll likely need to match your Node.js architecture and/or rebuild the `sqlite3` native binary:

```powershell
npm ci
npm rebuild sqlite3 --update-binary
```

If that doesn't work, ensure you have a 64-bit Node version and that Windows build tools are installed. For local testing you may also change `sqlite3` to the pure JS `better-sqlite3` or run Linux-based dev environments via WSL.

## When writing code: concrete guidance
- Minimal changes to routing:
  - To add a new route, create `routes/yourFeature.js` and export `router`. Add `app.use('/yourFeature', yourFeatureRoutes)` to `server.js`.
- For middleware:
  - Use `requireAtLeast()` from `middleware/jwtAuth.js` for role-based protection. Add `ensureAuthenticated` to page endpoints.
- When modifying auth behavior:
  - Carefully read both `auth.js` and `login.html`. The canonical flow uses an HttpOnly cookie for the JWT; the server returns `user` in JSON while the cookie is set by `res.cookie()` on login. When editing client code, ensure `fetch(..., { credentials: 'include' })` is used to accept cookie-based authentication.
- Database changes:
  - A single `initDB()` exists in `config/db.js`—prefer calling it for higher-level DB tasks. If you must interact directly, ensure consistent file names (`Users.db` vs `lighthouse.db` vs `database.sqlite`) and be explicit about which DB you intend to change.
- Static views & client-side JS
  - Frontend pages live in `views/` and use static assets from `public/`. If adding new scripts, put them in `public/js/` and reference them in the HTML file.

## Integration points & external dependencies
-- External NPM packages used in the repo:
  - `express`, `jsonwebtoken`, `sqlite`/`sqlite3`, `bcrypt`/`bcryptjs`, `cookie-parser`, `dotenv`, `cors`, `ejs`.
- DB files on disk: multiple files may be present in repo root or `mnt/data/`. The server expects `Users.db` and `lighthouse.db` in repo root.
- `views/` files are static HTML with embedded client-side fetches and must be updated to match any server-side changes (token storage, API path expectations).

## Suggested first tasks for contributor agents
- Fix inconsistencies in cookie/token flow or document the intended approach clearly; prefer one canonical flow (cookie + `ensureAuthenticated`) for pages and Authorization header for API clients.
- Consolidate DB usage: favor `config/db.js` `initDB()` for all server-side DB operations, or make the `server.js` explicit about separate user DB if required.
- Add an `.env.example` showing `JWT_SECRET` to help local setups.

- NOTE: I removed `express-session` and `connect-sqlite3` from `package.json` to avoid mixed auth patterns. If you still want sessions for some endpoints, reintroduce them and add session middleware to `server.js` intentionally.

---
If anything here is unclear or you want me to produce a follow-up PR (for example, consolidating DB access or normalizing the token flow), tell me the preferred behavior and I'll implement it and produce tests / migration steps.