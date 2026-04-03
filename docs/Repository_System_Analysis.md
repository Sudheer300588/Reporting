# Repository System Analysis

## Scope

This document captures the current technical understanding of the repository as inspected from the codebase, package manifests, Prisma schema, route wiring, service modules, and existing documentation.

This is a descriptive analysis only. It does not propose changes or improvements.

## System Summary

The repository is a monorepo for a white-labeled reporting and business management platform. Its main job is to combine:

- user and role management
- client assignment and visibility control
- reporting dashboards for multiple external platforms
- administrative configuration for credentials, branding, notifications, and AI features

The system is not just a UI over external APIs. Its dominant design pattern is local persistence of third-party data so that dashboards and reports are served from the platform's own database and local files instead of making fresh live API calls on every page load.

Primary integrated business domains:

- Mautic email reporting
- Mautic SMS reporting
- DropCowboy ringless voicemail data
- Vicidial agent and campaign reporting
- role-based internal administration
- SMTP-backed email notifications and OTP-based password reset
- AI assistant with optional text-to-speech

## Repository Layout

| Path | Purpose |
| --- | --- |
| `README.md` | Product-level overview |
| `docs/Technical_Documentation.md` | Existing authored technical documentation |
| `docs/Deployment_Documentation.md` | Deployment and runtime instructions |
| `backend/` | Express API, Prisma schema, schedulers, integrations |
| `frontend/` | React SPA built with Vite |
| `deploy.sh` | Production deployment and packaging script |
| `dev.sh` | Development bootstrap script |
| `docker-compose.dev.yml` | Local MySQL runtime for development |

## High-Level Architecture

```text
Browser
  |
  v
React SPA (Vite build)
  |
  v
Axios service layer / hooks / page components
  |
  v
Express application
  - auth middleware
  - permission middleware
  - route groups
  - error handling
  |
  +--> Prisma ORM --> MySQL
  |
  +--> Local filesystem
  |     - backend/dist
  |     - frontend/public/assets
  |     - data/campaigns
  |     - data/vicidial
  |     - temporary imported report pages
  |
  +--> External services
        - Mautic APIs
        - DropCowboy SFTP
        - Vicidial APIs
        - SMTP
        - OpenAI / Anthropic
        - ElevenLabs
```

## Runtime Assembly

The deployed application is assembled into a single backend-served runtime:

- the frontend is built with Vite
- the built frontend output is moved into `backend/dist`
- Express serves the SPA from `backend/dist`
- uploaded branding assets are served from `frontend/public/assets`
- the backend also serves all API routes from the same process

This packaging flow is defined in `deploy.sh`, while serving is implemented in:

- `backend/app.js`
- `backend/config/loadSiteSettings.js`

## Backend Architecture

### Startup Sequence

Backend startup is driven by `backend/server.js`:

1. load environment variables with `dotenv/config`
2. validate required environment variables
3. connect Prisma to the database
4. initialize schedulers
5. create the Express app
6. register the catch-all SPA handler
7. listen on the configured port

Critical environment checks include:

- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`

The encryption key must be a 64-character hex string because it is used for symmetric encryption of stored credentials.

### Express App Composition

`backend/app.js` creates the API server with:

- `helmet`
- `cors`
- `cookie-session`
- JSON body parsing
- global API rate limiting
- request logging
- static frontend build serving
- static asset serving for uploaded branding files
- mounted route groups
- centralized error handling

Public API endpoints:

- `GET /api/site-config`
- `GET /api/health`

Mounted authenticated and administrative route groups:

- `/api/auth`
- `/api/dashboard`
- `/api/users`
- `/api/activities`
- `/api/clients`
- `/api/settings`
- `/api/roles`
- `/api/ai`
- `/api/superadmin`
- `/api/superadmin/notifications`
- `/api/dropcowboy`
- `/api/mautic`
- `/api` for SMS routes
- `/api/agents` for Vicidial

### Security and Access Control

Authentication and authorization are implemented primarily in `backend/middleware/auth.js`.

The current access model is a hybrid:

- JWT bearer authentication is the main application session mechanism
- `cookie-session` also exists as a secondary short-lived session layer
- dynamic custom roles are the primary authorization model
- legacy base roles still exist for backward compatibility

Important access concepts:

- `Role` records define permission JSON structures
- `User.customRoleId` is the main modern permission link
- `User.role` still exists as a legacy base-role field
- first registered user becomes the protected owner/superadmin
- owner protections are enforced by `backend/services/ownerProtectionService.js`

Permission checks used across the backend include:

- full access
- per-module action checks such as `Users.Create`, `Clients.Read`
- team-manager logic
- user-management scoping
- client visibility scoping

### Logging and Error Handling

Logging is handled by `backend/utils/logger.js` using Winston.

Features:

- file-based logs in `backend/logs`
- structured JSON logs
- console logs in non-production
- sanitization of sensitive fields such as passwords, tokens, and cookies

Global error handling is registered through `backend/middleware/errorHandler.js`.

### Data Persistence

Prisma is configured in:

- `backend/prisma/schema.prisma`
- `backend/prisma/client.js`

The active default schema uses MySQL. Alternate schema files also exist:

- `backend/prisma/schema.mysql.prisma`
- `backend/prisma/schema.postgres.prisma`

The deployment script can swap the active schema to PostgreSQL by copying `schema.postgres.prisma` over `schema.prisma`, but the default repository state is MySQL-centric.

### Filesystem Usage

The backend does not rely on the database alone. Several features write to local files:

- `backend/dist` for the built SPA
- `frontend/public/assets` for uploaded logos, favicons, and branding images
- `data/campaigns` for downloaded DropCowboy files
- `data/vicidial` for Vicidial snapshots and caches
- Mautic temporary report-page import directories used by JSON import services

### Background Jobs and Schedulers

Scheduler initialization is centralized in `backend/config/registerSchedulers.js`.

Active background/scheduled systems:

- general notification scheduler
- DropCowboy scheduler
- Mautic scheduler
- Vicidial cron sync

Environment toggles affect whether some schedulers run in development:

- `ENABLE_SCHEDULER`
- `ENABLE_MAUTIC_SCHEDULER`

Important note on scheduler composition:

- the DropCowboy and Mautic schedulers match the current reporting platform domain
- the general notification scheduler still contains older task/project notification logic not represented in the current Prisma schema

## Backend Route Surface

### Auth

`backend/routes/auth.js`

Responsibilities:

- first-user registration
- login/logout
- current-user lookup
- password change
- revoke-all-sessions
- forgot-password OTP flow
- reset-password flow

Behavior summary:

- first registered user becomes superadmin
- login returns a JWT and sets session data
- password reset uses database-backed OTP records and SMTP delivery

### Dashboard

`backend/routes/dashboard.js`

Responsibilities:

- consolidated system overview
- sync progress status
- manual sync trigger

The heavy aggregation logic lives in `backend/services/dashboardService.js`.

### Users / Employees

`backend/routes/employees.js`

Responsibilities:

- create user
- list users
- get user detail
- update user
- change password
- delete user
- view user clients

This route is the main current user-management surface and is permission-aware.

### Activities

`backend/routes/activities.js`

Responsibilities:

- paginated activity log listing
- activity statistics

Visibility is filtered by permissions and scope.

### Clients

`backend/routes/clients.js`

Responsibilities:

- unified client listing
- client CRUD
- client assignment and unassignment
- service-specific lazy data endpoints
- client dashboard aggregation

The most important endpoint concept in this route is the unified client model, which merges:

- core client records
- assignments
- Mautic availability
- DropCowboy availability
- SMS availability

### Settings

`backend/routes/settings.js`

Responsibilities:

- global settings retrieval and update
- settings access metadata
- admin settings permissions
- current user settings permissions

This route supports settings-page visibility and notification-setting state.

### Roles

`backend/routes/roles.js`

Responsibilities:

- role listing
- role schema
- create role
- update role
- delete role
- activate/deactivate role

Role permissions are JSON-based and cover:

- pages
- settings sections
- users actions
- clients actions

### Superadmin Control Plane

`backend/routes/superadmin.js`

Despite the name, this file is the broader administrative control plane and is mounted with admin-level protection.

Responsibilities:

- owner lookup
- administrative dashboard
- SFTP credentials
- SMTP credentials
- Vicidial credentials
- legacy-style user/client management helpers
- employee listings
- activity listings
- maintenance emails
- site branding and uploads

This route coexists with the newer permission-driven route set rather than replacing it.

### Notification Templates and Email Logs

`backend/routes/notifications.js`

Responsibilities:

- CRUD for notification templates
- email log retrieval
- email stats
- send test notification emails

This powers the notification-template portion of the Settings UI.

### AI

`backend/routes/ai.js`

Responsibilities:

- AI settings storage
- voice list retrieval
- chat endpoint
- text-to-speech endpoint
- AI status endpoint

AI credentials are encrypted before storage.

## Core Data Model

The primary schema is in `backend/prisma/schema.prisma`.

### Identity and Access

- `Role`
- `User`
- `ActivityLog`
- `AdminSettingsPermission`
- `OTP`

Important structural behavior:

- users can have manager/employee self-relations
- `Role.permissions` holds structured permission JSON
- owner semantics are implemented in service logic, not a dedicated schema field

### Client and Assignment Domain

- `Client`
- `ClientAssignment`
- `Campaign`

This is the internal backbone that links users to visible data and service dashboards.

### Settings and Credentials

- `Settings`
- `SiteSettings`
- `AISettings`
- `SFTPCredential`
- `SMTPCredential`
- `VicidialCredential`
- `NotificationTemplate`
- `EmailLog`

These models hold operational configuration for the platform itself.

### DropCowboy Domain

- `DropCowboyCampaign`
- `DropCowboyCampaignRecord`
- `ImportedFile`
- `SyncLog`

This domain stores imported voicemail campaign data after SFTP ingestion and parsing.

### Mautic Email Domain

- `MauticClient`
- `MauticEmail`
- `MauticEmailReport`
- `MauticEmailReportAggregated`
- `MauticClickTrackable`
- `MauticEmailStatsCache`
- `MauticSegment`
- `MauticCampaign`
- `MauticFetchedMonth`
- `MauticSyncLog`

This part of the schema is designed to persist reporting data locally and support both raw and aggregated report access.

### SMS Domain

- `SmsClient`
- `MauticSms`
- `MauticSmsStat`

This domain is related to Mautic but logically separate from email persistence.

### Vicidial Domain

- `Agent`
- `ViciDialCampaign`
- `AgentCampaign`

This holds locally synchronized telecalling data.

## Integration Modules

### Mautic Email Integration

Main files:

- `backend/modules/mautic/mauticAPI.js`
- `backend/modules/mautic/email/routes/api.js`
- `backend/modules/mautic/email/services/dataService.js`
- `backend/modules/mautic/email/services/statsService.js`
- `backend/modules/mautic/email/services/aggregatedReportService.js`
- `backend/modules/mautic/email/services/reportJsonImportService.js`
- `backend/modules/mautic/schedulerService.js`

Architecture summary:

- per-client Mautic connection info is stored in `MauticClient`
- passwords are stored encrypted
- sync pipelines fetch metadata, campaigns, emails, segments, reports, and click stats
- data is bulk persisted locally
- dashboards and reports mostly read from local tables rather than live Mautic APIs

Important persistence behavior:

- raw email report rows can be imported and stored
- aggregated report rows reduce storage footprint and query cost
- fetched-month tracking exists for historical imports and backfills

### Mautic SMS Integration

Main files:

- `backend/modules/mautic/sms/routes/smsClient.js`
- `backend/modules/mautic/sms/services/smsService.js`
- `backend/modules/mautic/sms/services/smsClientSyncService.js`
- `backend/modules/mautic/sms/services/smsEnrichmentService.js`
- `backend/modules/mautic/sms/services/campaignGrouping.js`

Architecture summary:

- SMS sources may be dedicated `SmsClient` records
- campaigns are fetched from Mautic SMS endpoints
- SMS campaigns are matched to regular Mautic clients by normalized name-matching rules
- unmatched campaigns can be bucketed under an SMS-only placeholder client
- SMS stats are stored locally
- enrichment later adds message text, reply text, category, and mobile data

The SMS system therefore has two stages:

1. campaign and stat synchronization
2. incremental enrichment of contact-level details

### DropCowboy Integration

Main files:

- `backend/modules/dropCowboy/routes/api.js`
- `backend/modules/dropCowboy/services/sftpService.js`
- `backend/modules/dropCowboy/services/dataService.js`
- `backend/modules/dropCowboy/services/schedulerService.js`

Architecture summary:

- SFTP credentials are stored in the database
- remote JSON files are downloaded only when new
- local files are parsed into normalized campaign records
- records are grouped by campaign and deduplicated
- local campaign and record tables are updated
- sync logs are stored for visibility

This is an ETL pipeline rather than a live-reporting proxy.

### Vicidial Integration

Main files:

- `backend/modules/vicidialer/routes/vicidialAgents.js`
- `backend/modules/vicidialer/controllers/agentsControllers.js`
- `backend/modules/vicidialer/services/vicidial.service.js`
- `backend/modules/vicidialer/services/prisma.service.js`
- `backend/modules/vicidialer/cron/sync.cron.js`

Architecture summary:

- Vicidial credentials are stored in the database
- the service calls Vicidial API endpoints for agent and campaign data
- snapshots and caches are written to local JSON files
- database tables are updated from synchronized results
- the telecalling dashboard reads the synchronized local state

### AI Integration

Main files:

- `backend/routes/ai.js`
- `frontend/src/components/AIChatWidget.jsx`
- `frontend/src/components/Settings/AISettings.jsx`

Architecture summary:

- AI configuration is stored in `AISettings`
- LLM keys and voice keys are encrypted
- supported LLM providers are OpenAI and Anthropic
- voice provider flow is built around ElevenLabs
- prompts are contextualized using the clients visible to the currently authenticated user

The AI assistant is therefore not a generic chatbot. It is a user-scoped assistant over the platform's client and campaign context.

## Frontend Architecture

### Boot and Global Layout

Main files:

- `frontend/src/main.jsx`
- `frontend/src/App.jsx`
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/components/Navbar.jsx`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/hooks/useSiteBranding.js`

Boot flow:

1. initialize React app
2. apply site branding from local storage and `/api/site-config`
3. load `AuthProvider`
4. initialize router
5. wrap protected routes with navbar and AI widget

### Frontend Route Model

Protected routes include:

- `/dashboard`
- `/users`
- `/clients`
- `/activities`
- `/services`
- `/settings`
- `/profile`
- `/notifications`
- `/employees`
- `/agents`

Public routes include:

- `/login`
- `/signup`
- `/forgot-password`

### Auth State

`frontend/src/contexts/AuthContext.jsx`

Responsibilities:

- store token in `localStorage`
- apply Axios `Authorization` header globally
- fetch `/api/auth/me` on startup
- expose login, signup, logout, and password-reset helpers

Important detail:

- the active password-reset OTP flow is implemented and used
- the frontend still contains OTP-login helper methods and service wrappers for endpoints that do not appear in the currently mounted backend auth routes

### Permission Mirroring

`frontend/src/utils/permissions.js`

The frontend mirrors the backend's hybrid permission model:

- full access
- action-based permissions per module
- team-manager detection
- legacy fallback handling for users without custom roles

This affects:

- navbar link visibility
- settings section visibility
- client and employee actions
- activity log access

### Frontend State Layers

State is spread across several mechanisms:

- React local component state
- global auth context
- Zustand stores
- in-memory request caches in service modules

Main frontend stores:

- `frontend/src/zustand/useViewLevel.js`
- `frontend/src/zustand/useMauticStore.js`

### Frontend Services and Hooks

Important service and hook layers:

- `frontend/src/services/clientService.js`
- `frontend/src/services/mautic/`
- `frontend/src/services/dropCowboy/`
- `frontend/src/components/vicidial/api.js`
- `frontend/src/hooks/mautic/useMautic.js`
- `frontend/src/hooks/dropCowboy/useDropCowboy.js`

These layers centralize data loading and introduce lightweight client-side caching.

### Page-to-API Mapping

| Frontend area | Main API surface |
| --- | --- |
| Dashboard | `/api/dashboard/overview` |
| Clients | `/api/clients/unified` and lazy service endpoints |
| Services | unified clients, then service-specific dashboards |
| Employees | `/api/users`, `/api/roles`, `/api/superadmin/owner` |
| Activities | `/api/activities` |
| Profile | `/api/users/:id`, `/api/users/:id/password` |
| Settings | `/api/settings`, `/api/superadmin/*`, `/api/ai/*`, `/api/mautic/*` |
| AI chat widget | `/api/ai/status`, `/api/ai/chat`, `/api/ai/speak` |
| Vicidial dashboard | `/api/agents/*` |

### Reporting and Exporting

Exporting is implemented client-side in:

- `frontend/src/utils/exportHelpers.js`
- `frontend/src/components/ExportButton.jsx`
- `frontend/src/components/ExportModal.jsx`

Supported export formats:

- CSV
- XLSX
- PDF
- DOCX

Libraries used:

- `xlsx`
- `jspdf`
- `jspdf-autotable`
- `docx`

## End-to-End Workflows

### 1. Application Startup and Serve Workflow

1. backend validates environment
2. backend connects Prisma
3. schedulers are initialized
4. frontend build is served from `backend/dist`
5. latest branding is injected into `index.html`
6. browser loads SPA
7. frontend checks token and fetches current user

### 2. User Registration and Authentication Workflow

1. user opens login or signup
2. signup availability is checked via `/api/auth/signup-allowed`
3. first signup becomes superadmin/owner
4. login returns JWT and user payload
5. token is stored in `localStorage`
6. subsequent page loads call `/api/auth/me`

### 3. Password Reset Workflow

1. user enters email on forgot-password page
2. backend creates OTP record and emails the code
3. user submits OTP
4. backend verifies OTP and returns a temporary reset token
5. user submits new password
6. backend validates and updates password

### 4. Role and User Administration Workflow

1. admin creates or updates custom roles
2. roles encode page, settings, users, and clients permissions
3. admin creates user with selected custom role
4. manager relationships may be assigned
5. owner guard rules prevent destructive owner mutations
6. actions are written to activity logs

### 5. Client Management Workflow

1. users load the unified client list
2. backend filters visibility by full access, ownership, assignments, and permissions
3. a client can expose one or more services
4. frontend loads service-specific data only when a user drills in
5. managers/admins can assign or unassign users from clients

### 6. Dashboard Workflow

1. frontend calls a single overview endpoint
2. backend aggregates:
   - user stats
   - client stats
   - Mautic metrics
   - voicemail metrics
   - sync status
3. frontend renders KPI cards, charts, and insights from that single payload

### 7. Mautic Email Sync Workflow

1. admin stores Mautic client credentials
2. connection is tested
3. sync scheduler or manual sync fetches campaigns, emails, segments, reports, and stats
4. data is normalized and persisted
5. dashboards and client drilldowns query local tables

### 8. Mautic SMS Workflow

1. SMS client sources are configured
2. sync fetches SMS campaigns from source instances
3. campaigns are matched to regular Mautic clients using name grouping rules
4. campaign stats are fetched and saved locally
5. enrichment jobs add reply text, mobile numbers, and activity details
6. SMS dashboards render from local persisted data

### 9. DropCowboy Workflow

1. admin stores SFTP credentials
2. scheduler or manual fetch downloads new JSON files
3. files are parsed locally
4. records are grouped and deduplicated
5. campaign and record tables are updated
6. metrics and records are served from local state

### 10. Vicidial Workflow

1. admin stores Vicidial credentials
2. sync job calls Vicidial APIs
3. responses are snapshot to JSON files and persisted to DB
4. frontend dashboards query synchronized agent and campaign state

### 11. Branding Workflow

1. admin uploads branding assets
2. files are saved into frontend public assets
3. site settings record paths and visual options
4. backend injects title, favicon, and login background into served HTML
5. frontend also refreshes branding live using `site-customization-updated` events

### 12. Notification Template Workflow

1. admin manages email templates in Settings
2. template definitions are stored in `NotificationTemplate`
3. test emails can be sent using current SMTP credentials
4. sent-email results are logged to `EmailLog`

### 13. AI Assistant Workflow

1. admin stores encrypted LLM and voice credentials
2. widget checks AI status
3. user opens widget and submits a prompt
4. backend gathers all accessible client context for that user
5. backend builds a system prompt scoped to platform data
6. selected provider returns a text response
7. optional text-to-speech returns base64 audio for playback

## Dependency Inventory

### Backend Package Dependencies

Main backend runtime packages from `backend/package.json`:

- `express`
- `@prisma/client`
- `axios`
- `bcryptjs`
- `cors`
- `dotenv`
- `cookie-session`
- `express-rate-limit`
- `helmet`
- `jsonwebtoken`
- `multer`
- `node-cron`
- `nodemailer`
- `p-limit`
- `ssh2-sftp-client`
- `winston`
- `zod`
- `date-fns`

Backend development packages:

- `nodemon`
- `prisma`

### Frontend Package Dependencies

Main frontend runtime packages from `frontend/package.json`:

- `react`
- `react-dom`
- `react-router-dom`
- `axios`
- `zustand`
- `react-toastify`
- `recharts`
- `react-select`
- `xlsx`
- `jspdf`
- `jspdf-autotable`
- `docx`
- `lucide-react`
- `date-fns`

Frontend build and development packages:

- `vite`
- `@vitejs/plugin-react`
- `eslint`
- `tailwindcss`
- `postcss`
- `autoprefixer`

### External Infrastructure and Service Dependencies

The platform also depends on external systems that are part of the actual runtime architecture:

- MySQL or PostgreSQL database
- SMTP server
- SFTP server for DropCowboy imports
- Mautic instances
- Vicidial instance
- OpenAI or Anthropic
- ElevenLabs
- PM2 for production process management

### Runtime and Environment Dependencies

Documented runtime requirements include:

- Node.js 22.x
- MySQL 8.0+
- npm
- Docker and Docker Compose for local MySQL

Key environment-driven behavior:

- API base URL is controlled by `VITE_API_URL`
- schedulers are controlled by backend env flags
- frontend build is generated with blank `VITE_API_URL` in production packaging so API and SPA are co-hosted

## Operational Configuration

### Deployment

`deploy.sh` performs:

- prerequisite checks
- environment generation
- dependency installation
- schema selection for MySQL/PostgreSQL
- Prisma generation and database push
- frontend build
- move `frontend/dist` to `backend/dist`
- PM2 startup

### Development

`dev.sh` performs a simpler bootstrap:

- start MySQL with Docker Compose
- copy env templates
- install dependencies
- run Prisma migration/generation
- start backend and frontend dev servers

## Current Codebase Composition

### Active Current Paths

The mounted and primary current application surfaces are:

- `backend/routes/auth.js`
- `backend/routes/dashboard.js`
- `backend/routes/employees.js`
- `backend/routes/activities.js`
- `backend/routes/clients.js`
- `backend/routes/settings.js`
- `backend/routes/roles.js`
- `backend/routes/superadmin.js`
- `backend/routes/notifications.js`
- `backend/routes/ai.js`
- `backend/modules/dropCowboy/...`
- `backend/modules/mautic/...`
- `backend/modules/vicidialer/...`

### Coexisting Older or Residual Paths

The repository also contains residual or less-central code paths that are useful to know about:

- `backend/routes/employee.js` exists but is not mounted in `backend/app.js`
- `backend/routes/manager.js` exists but is not mounted in `backend/app.js`
- `backend/services/notificationService.js` and `backend/services/schedulerService.js` still contain task/project notification logic
- `frontend/src/pages/Notifications.jsx` is currently a placeholder page
- `frontend/src/services/otpService.js` includes OTP-login helpers for backend endpoints that do not appear to be currently mounted

### Important Structural Observation

The repository reflects layered evolution rather than a single clean rewrite. The current platform is clearly centered on client reporting, service integrations, RBAC, and admin settings, while some older task/project notification concepts remain in supporting services.

That means the codebase should be understood as:

- a current active reporting platform
- plus legacy-adjacent supporting code that is still present in the repository

## System Characterization

In practical terms, the system is best described as:

- a React/Express/Prisma business platform
- with client-scoped reporting dashboards
- backed by role-based access control
- powered by ETL-style third-party data ingestion
- deployed as a single backend-served SPA plus API runtime

The most important mental model for future work is:

1. users do not see raw third-party platforms directly
2. the platform ingests and normalizes external data
3. local persistence powers the UI
4. client visibility is always filtered by roles, assignments, and ownership rules
5. administration is split between modern permission-driven routes and a broad superadmin control plane
