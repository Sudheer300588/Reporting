# DigitalBevy Development Platform

## Overview
DigitalBevy is a comprehensive business management system designed to integrate CRM, campaign management, and a robust user hierarchy with dynamic role-based access control. The platform aims to streamline business operations, enhance marketing efforts through AI-powered insights, and provide a flexible, secure environment for managing clients and users. It targets businesses seeking an all-in-one solution for client engagement, team management, and data-driven decision-making.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `backend/prisma/migrations`.
I prefer clear and concise communication.
**All changes must be deployment-ready** - just `git pull && pm2 restart` on production, no manual fixes needed.
**Always update all 3 Prisma schema files** when making database changes (schema.prisma, schema.mysql.prisma, schema.postgres.prisma).

## System Architecture

### UI/UX Decisions
The frontend utilizes React, structured with modular components. Settings sections are self-contained, leveraging a `SettingsLayout` for navigation and `SettingsContext` for shared state. The design prioritizes clear information hierarchy and intuitive workflows, especially for role and permission management.

### Technical Implementations

#### Dynamic Role-Based Access Control
The system employs a permission-based access control model with no hardcoded role logic. Authorization is driven by custom roles defined in settings, featuring `fullAccess`, `isTeamManager`, and granular `permissions` objects.
- **Permission Modules**: `Users`, `Clients`, `Settings`, `Activities`.
- **Authorization Helpers**: Backend middleware (`hasFullAccess`, `userHasPermission`, `requirePermission`, `requireFullAccess`) and frontend helpers ensure consistent permission enforcement.
- **Client Assignment**: Uses `isTeamManager` flag for explicit manager classification, influencing client assignment and visibility.
- **Backward Compatibility**: Legacy users without custom roles receive temporary fallback permissions (e.g., `superadmin`/`admin` get full access, `manager` gets team manager status) until migrated.

#### Owner Protection (Updated Dec 2024)
The platform implements robust "owner protection" to prevent hostile takeover of the primary administrator account:
- **Owner Definition**: The oldest superadmin (by createdAt) is automatically designated as the "owner"
- **Protected Actions**: Owner cannot be deactivated, deleted, or demoted from superadmin role
- **Centralized Service**: `backend/services/ownerProtectionService.js` provides:
  - `getOwner()` - Cached lookup of owner with 1-minute TTL
  - `isOwner(userId)` - Check if user is the owner
  - `ensureOwnerGuard()` - Express middleware for mutation endpoints
  - `ensureOwnerRolePreserved()` - Forces superadmin role in update operations
  - `protectOwnerMutation()` - Validates proposed changes against owner rules
- **Frontend UI**: Owner displays Crown badge, toggle button disabled, delete button hidden
- **Applied To**: All user mutation routes (employees.js PUT/DELETE, superadmin.js PATCH routes)

#### AI Assistant Integration
A conversational AI assistant allows users to query client statistics, campaign data, and business metrics using natural language.
- **LLM & Voice Providers**: Supports OpenAI/Anthropic for LLM and ElevenLabs for Text-to-Speech.
- **Security**: API keys are encrypted using an existing `encryptionService`. Access to AI settings is restricted to `fullAccess` users. Chat responses are filtered based on the user's permissions.
- **Features**: Web Speech API for voice input, ElevenLabs for voice output, and wake word detection ("Hey Bevy").

#### Enhanced Dashboard (Updated Dec 2024)
The dashboard provides a comprehensive overview of business metrics with role-aware data display:
- **Email Metrics**: Sent/opened/clicked/bounced counts, open/click/unsubscribe rates from Mautic
- **Voicemail Metrics**: Sent/delivered/failed counts, success rate, total cost from DropCowboy
- **Visualizations**: Recharts-based bar charts for email performance, pie charts for voicemail delivery
- **Insight Cards**: Automatically generated alerts for low open rates (<20%), high bounces (>100), delivery issues (<70% success)
- **Sync Status Indicators**: Show last sync time for Mautic and DropCowboy integrations
- **Quick Actions**: Sync all data, manage clients/users, view activity (admin-only)
- **Permission Helpers**: `hasFullAccess()`, `hasPermission(module, action)`, `canViewClients()`, `canViewUsers()` for consistent access control
- **No Hardcoded Roles**: All access control uses dynamic permission helpers, not legacy role checks

#### Enterprise Sync Progress Tracking (Dec 2024)
Real-time sync progress tracking for Mautic data synchronization:
- **In-Memory Progress State**: Uses lightweight in-memory tracking (no database changes required)
- **Progress API**: `/api/mautic/sync/progress` endpoint exposes real-time per-client sync status
- **SyncProgressPanel UI**: Dashboard displays live progress with batch info, elapsed time, completion percentage
- **Per-Client Status**: Shows syncing/completed/failed/pending status for each Mautic client
- **Polling Strategy**: Frontend polls every 3 seconds during active sync, stops when complete
- **Memory Management**: Automatic cleanup after 5 minutes to prevent memory leaks
- **Priority-Based Syncing**: Fetches newest data first (months reversed) for faster initial value
- **Configurable Backfill**: `MAUTIC_HISTORICAL_MONTHS` env var limits historical backfill depth (default: 12 months)
- **Concurrent Syncs**: `MAUTIC_CONCURRENT_SYNCS` controls parallel client processing (default: 5)

#### Hierarchical Stats API (Dec 2024)
A four-tiered stats API for drilling down from application-level to individual email metrics:
- **Hierarchy**: Application > Client > Campaign > Email
- **Endpoints**:
  - `GET /api/mautic/stats/overview` - Application-level: all clients aggregated stats
  - `GET /api/mautic/clients/:clientId/stats` - Client-level: campaigns and top emails for a client
  - `GET /api/mautic/campaigns/:campaignId/stats` - Campaign-level: campaign details
  - `GET /api/mautic/emails/:emailId/stats` - Email-level: granular individual email metrics with optional history
- **Metrics Available**: sent, read, clicked, bounced, unsubscribed counts + openRate, clickRate, bounceRate, unsubscribeRate percentages
- **Date Filtering**: All endpoints support `fromDate` and `toDate` query params
- **Service**: `backend/modules/mautic/services/statsService.js` - shared aggregation helpers with Prisma groupBy/aggregate for efficient N+1-free queries
- **Note**: Campaigns and Emails are both linked to Clients but not directly to each other in the current schema

#### DropCowboy Client-Campaign Mapping (Jan 2025)
Strict mapping system for linking DropCowboy voicemail campaigns to Mautic clients:
- **Strict Matching Only**: Campaign names MUST start with the client name (no permissive heuristics)
  - Strategy 1: Exact prefix match (case-insensitive) - e.g., "JAE Automation S1 VM 1" matches "JAE Automation"
  - Strategy 2: Space-normalized match - e.g., "MoneyMailer" matches "Money Mailer Win Back VM 1"
- **No Hardcoding**: All matching is dynamic based on Mautic client names
- **Prevents Data Mixing**: Conservative matching ensures no cross-client record contamination
- **Campaign Naming Convention**: Team should name campaigns starting with exact client name
- **Service Detection**: `/api/dropcowboy/clients-with-campaigns` returns client IDs with mapped VM campaigns
- **Rebuild Endpoint**: `POST /api/dropcowboy/rebuild-campaigns` repairs unlinked campaign data
- **Files**: `backend/modules/dropCowboy/services/dataService.js`, `backend/modules/dropCowboy/routes/api.js`

#### Client Performance Widgets (Jan 2025)
Interactive performance visualization widgets on the Clients page:
- **EmailPerformanceWidget**: Recharts bar chart showing email metrics (sent, read, clicked, bounced) for selected Mautic client
- **VoicemailPerformanceWidget**: Delivery metrics and charts for DropCowboy campaigns linked to client
- **Dynamic Service Detection**: Ringless Voicemail row enables only when client has actual VM campaigns mapped
- **State Management**: `ClientServicesSection` resets selected service on client change to ensure correct widget display
- **Files**: `frontend/src/components/widgets/EmailPerformanceWidget.jsx`, `frontend/src/components/widgets/VoicemailPerformanceWidget.jsx`, `frontend/src/components/ClientServicesSection.jsx`

#### Modular Settings Components
The `frontend/src/components/Settings/` directory houses self-contained components for various configurations, such as `RolesAndPermissions`, `MauticSettings`, `NotificationsSettings`, `SmtpCredentials`, `SftpCredentials`, `VicidialCredentials`, and `SiteBranding`. Each component manages its state and API calls, utilizing `useSettings()` for permission checks.

### System Design Choices

#### Database
Supports both MySQL and PostgreSQL through Prisma. The project maintains THREE schema files that MUST stay in sync:
- `schema.prisma` - Main schema (PostgreSQL, used on Replit dev)
- `schema.mysql.prisma` - MySQL template (used by deploy.sh for production)
- `schema.postgres.prisma` - PostgreSQL template

**CRITICAL: When modifying the schema, update ALL THREE files before committing.**

#### Deployment-Ready Development Workflow (Jan 2025)
All changes must be deployment-ready with a simple `git pull && pm2 restart`:
1. **Schema Changes**: Update all 3 schema files simultaneously
2. **Prisma Syntax**: Use relation connect syntax for all create operations
3. **API Changes**: Include new fields in all relevant select statements
4. **Frontend**: Ensure new fields are handled in forms and displays
5. **Test locally on Replit before committing**

#### Directory Structure (CI/CD Ready - Dec 2024)
```
/
├── backend/           # Node.js Express API
│   ├── prisma/        # Database schema & migrations
│   ├── routes/        # API routes
│   ├── services/      # Business logic
│   └── server.js      # Entry point
├── frontend/          # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── utils/     # Shared utilities (permissions.js)
│   └── vite.config.js
├── deploy.sh          # Multi-site deployment script
├── docker-compose.yml # Container orchestration
├── setup.sh           # Initial setup script
└── start.sh           # Quick start script
```

#### Prisma Relation Syntax (Critical - Jan 2025)
MySQL requires using Prisma's relation connect syntax instead of direct foreign key assignment:
- **Wrong**: `createdById: userId` (causes "Unknown argument" error)
- **Correct**: `createdBy: { connect: { id: userId } }`
- **Affected Operations**: All `create()` operations with foreign key relations
- **WHERE Clauses**: Can still use `createdById` for filtering (only affects create/update)
- **Files Fixed**: `employees.js`, `superadmin.js`, `clients.js`

#### Deployment (Updated Jan 2025)
An interactive `deploy.sh` script (Hardened) facilitates multi-site server deployments:
- **4-Step Wizard**: Database config, App settings, Super Admin creation, Scheduler config
- **Same-Domain Deployment**: Frontend at `/`, API at `/api` on same domain
- **ES Module Compatible**: Uses `.cjs` extension for PM2 ecosystem config
- **Production Migrations**: Uses `prisma migrate deploy` with fallback to `db push`
- **Quick Mode**: `./deploy.sh --quick` for redeployments using existing `.env`

**Important Frontend Configuration:**
- `VITE_API_URL` must be **empty** for same-domain deployment
- API paths in code already include `/api` prefix (e.g., `/api/auth/login`)
- Setting `VITE_API_URL=/api` causes double prefix bug (`/api/api/...`)

#### Environment Variables
Key configurations like `PORT`, `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `FRONTEND_URL` are managed via environment variables.

## External Dependencies
- **Prisma**: ORM for database interaction (supports MySQL and PostgreSQL).
- **OpenAI/Anthropic**: Large Language Model providers for the AI Assistant.
- **ElevenLabs**: Text-to-Speech API for the AI Assistant's voice features.
- **Mautic**: Marketing automation platform for email metrics and campaign data.
- **DropCowboy**: Ringless voicemail service, integrated via SFTP.
- **Vicidial**: Call center management system.
- **PM2**: Production process manager for Node.js applications.