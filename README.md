# WCE Prof-Insights

Prof-Insights is a faculty-only activity evidence and reporting portal for Walchand College of Engineering, Sangli. Faculty members maintain one structured record for each academic contribution; HOD and administrator roles review submissions; approved records feed chronological PDF, DOCX, and CSV reports.

## What the portal covers

- Faculty activities across development, events, research, innovation, consultancy, outreach, courses, professional service, and MoUs
- Separate activity type and faculty involvement (for example, `Webinar` + `Speaker / Resource Person`)
- Draft, submission, correction, approval, and archival workflow
- Conditional fields instead of a universal certificate requirement
- Multiple event images, evidence documents, reports, and restricted attendance files
- Structured guest/resource-person details for relevant activities; guests are not login users
- Faculty, academic-year, activity, status, scope, and date filters
- Annual or combined-period reports in PDF, DOCX, and CSV
- Department-scoped HOD review and cross-department administrator access

The detailed operating rules are in [docs/FACULTY-WORKFLOW.md](docs/FACULTY-WORKFLOW.md).

## Architecture

- React 19 and Vite frontend
- Node.js and Express REST API
- PostgreSQL persistence
- JWT authentication, bcrypt password hashing, role checks, rate limiting, Helmet, and a restrictive content-security policy
- A multi-stage production image that serves the built frontend and API from the same origin
- Docker Compose with a persistent PostgreSQL volume and health checks

## Configuration

Copy `.env.example` to `.env`, then replace every placeholder. Never commit `.env`.

Generate a JWT secret with Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

For public deployment, set `CORS_ORIGINS` to the exact HTTPS origin, such as `https://profinsights.example.edu`. Put TLS in front of the app with the institute's reverse proxy or load balancer. Do not expose PostgreSQL to the public network.

## Run with Docker Compose

Requirements: Docker Engine with the Compose plugin.

```powershell
Copy-Item .env.example .env
# Edit .env before continuing.
docker compose config
docker compose up --build -d
docker compose ps
```

Open `http://localhost:3000` (or `APP_PORT`). The application health endpoint is `/api/health`.

On the first start of a new volume, PostgreSQL applies `tables.sql`, then the app runs all versioned files in `migrations/`. On later starts, the persistent `pgdata` volume is reused and only unapplied migrations run. Do not run `tables.sql` against an existing database.

### Bootstrap the first administrator

There is intentionally no public registration. After the services are healthy, create or promote the account named by `ADMIN_EMAIL` once. Supply the password transiently rather than saving it in `.env`:

```powershell
$adminSecret = Read-Host 'Initial admin password' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
docker compose exec -e ADMIN_PASSWORD app npm run bootstrap-admin
Remove-Item Env:ADMIN_PASSWORD
```

The bootstrap refuses a password shorter than 12 characters or one without lowercase, uppercase, number, and symbol characters. It never prints the password. Sign in, verify the account, then create the required faculty/HOD accounts through the protected administration workflow and change the bootstrap password.

## Run locally without Docker

Requirements: Node.js 20+, npm, and PostgreSQL 15+.

For a brand-new empty database, apply the base schema once. For an existing project database, skip this command.

```powershell
psql -U profinsights -d profinsights -f tables.sql
npm.cmd install
npm.cmd --prefix client install
npm.cmd run migrate
npm.cmd run build
npm.cmd start
```

For frontend development, run `npm.cmd --prefix client run dev`; Vite proxies `/api` to port 3000.

## Verification commands

```powershell
npm.cmd test
npm.cmd --prefix client run lint
npm.cmd --prefix client run build
docker compose config
```

Before release, also verify sign-in/sign-out, role access, draft-to-approval transitions, attachment download permissions, report downloads, database backup restoration, mobile layout, keyboard navigation, and `/api/health` behind the production proxy.

## Data and backup policy

Activity evidence and attendance files may contain personal or confidential information. Restrict administrator access, use encrypted transport and encrypted backups, define a retention period, and test recovery. Back up PostgreSQL before applying new migrations.

The pre-improvement recovery artifacts and safe restoration procedure are documented in [docs/ROLLBACK.md](docs/ROLLBACK.md). The supplied synopsis should be revised with [docs/SYNOPSIS-REVISION-GUIDE.md](docs/SYNOPSIS-REVISION-GUIDE.md) before academic submission.

