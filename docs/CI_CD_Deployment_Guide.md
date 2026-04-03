# CI/CD and Deployment Guide (Reporting)

## Overview

This document reflects the actual deployment behavior configured in this repository.

Deployment stack:

- GitHub Actions workflows
- SSH-based remote execution (appleboy/ssh-action)
- PM2 process manager
- NVM for switching Node versions on server

Environments:

- Development: automatic deployment on push to main
- Production: manual deployment via workflow dispatch

## Application Deployment Model

The application is deployed as a single backend Node process that serves:

- API routes from backend/server.js
- frontend static build from backend/dist

Build output flow:

- frontend build created in frontend/dist
- moved to backend/dist
- backend process restarted/reloaded with PM2

Database/runtime notes:

- Prisma client is generated during deploy
- no migration command is run in CI workflows
- backend process name in PM2 is hc-development

## Repository Paths Used by CI/CD

- Dev workflow: .github/workflows/dev-deploy.yml
- Prod workflow: .github/workflows/prod-deploy.yml

Remote directories used by workflows:

- Dev server path: ~/htdocs/<dev-server-name>/Reporting
- Prod server path: ~/htdocs/<prod-server-name>/Reporting

## Deployment Flow

Developer push to main
-> Dev workflow runs automatically
-> Deploy to dev server
-> Validate on dev
-> Trigger production workflow manually
-> Deploy to production server

## Development Deployment (Automatic)

Trigger:

- push to main branch

Workflow file:

- .github/workflows/dev-deploy.yml

Server-side steps performed:

1. Change directory to ~/htdocs/<dev-server-name>/Reporting
2. Pull latest source
   - git fetch origin
   - git reset --hard origin/main
3. Load NVM
4. Backend build/setup using Node 18
   - cd backend
   - nvm use 18 || nvm install 18
   - npm ci
   - npx prisma generate
5. Frontend build using Node 20
   - cd ../frontend
   - nvm use 20 || nvm install 20
   - npm ci
   - npm run build
6. Replace backend static bundle
   - rm -rf ../backend/dist
   - mv dist ../backend/dist
7. Restart or start PM2 app
   - cd ../backend
   - nvm use 18
   - install PM2 if missing
   - if process exists: pm2 reload ecosystem.config.cjs
   - else: pm2 start ecosystem.config.cjs
   - pm2 save

## Production Deployment (Manual)

Trigger:

- workflow_dispatch (manual run from Actions tab)

Workflow file:

- .github/workflows/prod-deploy.yml

How to run:

1. Open GitHub repository
2. Go to Actions
3. Select Deploy to VPS (Production - Reporting App)
4. Click Run workflow
5. Choose branch (usually main)
6. Start workflow

Production steps are the same as dev, with different server path and secrets.

## GitHub Secrets Required

Configure in GitHub repository settings under Secrets and variables -> Actions.

Development workflow secrets:

- VPS_HOST
- VPS_USER
- VPS_PASSWORD

Production workflow secrets:

- PROD_HOST
- PROD_USER
- PROD_PASSWORD

## PM2 Runtime Details

PM2 ecosystem file:

- backend/ecosystem.config.cjs

Important defaults:

- app name: hc-development
- script: ./server.js
- cwd: backend directory (required for Prisma and .env loading)
- log files in backend/logs
- max memory restart: 3G

Useful checks:

- pm2 list
- pm2 describe hc-development
- pm2 logs hc-development --lines 200

## Post-Deployment Verification Checklist

After each deployment, verify:

1. PM2 process is online
2. API health endpoint responds
   - GET /api/health
3. Login page loads correctly
4. A core authenticated API endpoint responds for a valid user session
5. No critical errors in PM2 logs

## Important Behavior and Constraints

- Dev deploy is auto on every push to main
- Prod deploy is manual only
- CI deploy currently runs prisma generate, but does not run prisma migrate deploy
- CI deploy force-syncs code using git reset --hard origin/main on target servers
- Node versions in CI are split by tier:
  - Backend: Node 18
  - Frontend build: Node 20

## Local Deployment Scripts in This Repository

This project also includes local scripts for non-CI usage:

- deploy.sh
  - Interactive or quick server setup
  - Supports MySQL/PostgreSQL schema switching
  - Generates/validates environment values
  - Builds frontend and starts backend with PM2

- dev.sh
  - Starts local MySQL via docker-compose.dev.yml
  - installs backend/frontend dependencies
  - runs Prisma migrate deploy and generate
  - starts backend and frontend development servers

Use CI/CD workflows for remote server deployment, and these scripts for local/bootstrap scenarios.

## Manual Fallback Deployment (If GitHub Actions Fails)

Development server fallback:

1. ssh to server
2. cd ~/htdocs/<dev-server-name>/Reporting
3. git fetch origin
4. git reset --hard origin/main
5. Load NVM:
   - export NVM_DIR="$HOME/.nvm"
   - . "$NVM_DIR/nvm.sh"
6. Backend:
   - cd backend
   - nvm use 18 || nvm install 18
   - npm ci
   - npx prisma generate
7. Frontend:
   - cd ../frontend
   - nvm use 20 || nvm install 20
   - npm ci
   - npm run build
8. Move build:
   - rm -rf ../backend/dist
   - mv dist ../backend/dist
9. Restart app:
   - cd ../backend
   - command -v pm2 >/dev/null 2>&1 || npm install -g pm2
   - if pm2 describe hc-development succeeds: pm2 reload ecosystem.config.cjs
   - else: pm2 start ecosystem.config.cjs
   - pm2 save

Production fallback is identical except server path:

- ~/htdocs/<prod-server-name>/Reporting

## Common Failure Scenarios

1. SSH timeout or refusal
   - Cause: firewall/network restrictions, wrong host, blocked port 22
   - Check: server inbound rules and provider ACL

2. Workflow not appearing
   - Cause: workflow file not in .github/workflows, syntax issue, branch mismatch
   - Check: file path and YAML validity in default branch

3. PM2 app not restarting
   - Cause: PM2 missing, wrong app name, ecosystem path issue
   - Check: pm2 list and pm2 logs

4. Frontend not updated after successful deploy
   - Cause: dist move failed or stale files
   - Check: backend/dist timestamp and web server cache

5. App starts but API fails
   - Cause: invalid environment variables or database connectivity
   - Check: backend .env, DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, and PM2 logs

## Recommended Release Practice

1. Merge to main
2. Confirm automatic dev deployment success
3. Run smoke tests on dev (UI + /api/health + key business flow)
4. Trigger production workflow manually
5. Re-run smoke tests on production

## Suggested Next Improvements

- Move from password auth to SSH key auth in workflows
- Add migration step strategy (for example prisma migrate deploy) if schema migrations are managed
- Add automated health checks after PM2 reload
- Add deployment notifications (Slack/Email)
- Add rollback procedure (tag-based or previous release pointer)
