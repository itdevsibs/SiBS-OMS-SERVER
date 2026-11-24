# SiBS OMS server

Node 24, Express, MySQL, and Kronos cookie authentication. This server uses no Ticketing tables or Ticketing role rules.

## Local development

1. Run `npm ci`.
2. Copy `.env.example` to `.env` for a new installation and fill in the OMS database, read-only Kronos DB3 credentials, and existing HRIS encryption settings. Preserve an already configured `.env`.
3. Generate an independent secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and save it as `OMS_JWT_SECRET`.
4. Set `ALLOWED_ORIGINS` to the browser's exact client origins, separated by commas. `OMS_ALLOWED_ORIGINS` overrides it when supplied. Include the actual local Vite port and deployed client origin. Cookie requests from React must use Axios `withCredentials: true` or fetch `credentials: 'include'`.
5. Run `npm run dev` or `npm start`. OMS defaults to port **6103**. Change `PORT` if needed; an inherited process environment variable takes precedence over `.env`.

The env file is resolved relative to this server directory, even when starting Node from another directory. A port conflict produces an actionable startup error; the server does not terminate unrelated processes or silently select another port.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/test` | Public liveness; no database query |
| `GET /api/health` | Public readiness; read-only connection checks against OMS and Kronos |
| `GET /api/sample` | Read-only OMS database sample |
| `GET /api/sample/protected` | Cookie-authenticated sample |
| `POST /api/auth/login` | Validate `{ username, password }` against active Kronos users; issue OMS cookie |
| `GET /api/auth/session` | Discover current session; clear invalid cookies |
| `GET /api/auth/me` | Fetch the authenticated identity |
| `POST /api/auth/refresh` | Recheck the active user and renew the timed session |
| `POST /api/auth/logout` | Clear the browser cookie |

JWTs use HS256, issuer `sibs-oms`, audience `sibs-oms-client`, and the `sibs_oms_session` HttpOnly cookie. Production cookies require HTTPS and use `SameSite=Lax`; deploy browser and API on the same site. `OMS_JWT_EXPIRES_IN` defaults to `1h`. Every protected request rechecks the active Kronos user. Logout clears the cookie; a copied token remains valid until expiry. OMS has no Ticketing staff permissions or non-expiring staff sessions.

Helmet security headers, credentialed CORS with an explicit allowlist, origin checks for cookie writes, a 50 KB JSON limit, login rate limiting, JSON errors, request timeouts, and SIGTERM/SIGINT cleanup are configured. Set `TRUST_PROXY=1` only behind one trusted reverse proxy; local development defaults to `0`.

## Docker and Jenkins

Run `docker compose config --quiet`, then `docker compose up --build -d --wait`. Compose loads `.env` by default; `SERVER_ENV_FILE` selects a different runtime env file. The host port is `OMS_SERVER_PORT` (default `6103`); the container always listens on `6103`.

Jenkins expects this server directory as its SCM checkout root and `/var/jenkins_home/env-files/sibs-oms-server.env` on its agent. Use `.env.example` as the variable list and supply real production values. The agent needs Node 24, npm, Docker, Compose v2, and access to both databases. The pipeline tests, validates Compose, builds, deploys, checks health, and removes its temporary env file. Runtime env values are excluded from the Docker image and Git.

Use a reachable database hostname in containers; `127.0.0.1` refers to the container itself. `host.docker.internal` is mapped to the Docker host for host-based MySQL. Compose enables an init process and allows 20 seconds for graceful shutdown. Database failure makes readiness return `503` without revealing credentials.

Run `npm run check` and `npm test` before deployment. Tests use controlled database adapters; they do not validate production credentials or modify database records.
