# DigitalBevy Development Platform

## Overview

DigitalBevy is a comprehensive business management platform that combines CRM functionality, campaign management, and a hierarchical user system. The platform integrates multiple third-party services including Mautic (email marketing), DropCowboy (ringless voicemail), and Vicidial (call center) to provide unified reporting and management dashboards for marketing campaigns.

The application follows a monorepo structure with separate `backend` (Node.js/Express API) and `frontend` (React SPA) directories. It uses Prisma ORM with MySQL for data persistence and implements JWT-based authentication with role-based access control.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture

**Framework & Runtime:**
- Express 5.x on Node.js 22.x with ES modules (`"type": "module"`)
- Entry point: `server.js` creates the app via `createApp()` from `app.js`
- Environment validation runs on startup, failing fast if required vars are missing

**Database Layer:**
- Prisma 6.x ORM with MySQL or PostgreSQL support
- Switch databases using: `cd backend && bash scripts/switch-database.sh postgres` (or `mysql`)
- Client instantiated in `backend/prisma/client.js` as singleton
- Schema and migrations managed via Prisma CLI commands

**Authentication & Authorization:**
- JWT tokens with 7-day expiration, HS256 algorithm
- Middleware in `backend/middleware/auth.js` handles token verification
- Role-based access control with dynamic permissions stored in database
- Users have `customRole` with granular permissions (Pages, Settings, Users, Clients modules)
- Helper functions: `hasFullAccess()`, `userHasPermission()`, `requirePermission()`

**Module System:**
- Feature modules organized under `backend/modules/`:
  - `dropCowboy/` - SFTP sync for ringless voicemail CSV data
  - `mautic/` - Email marketing API integration with encrypted credentials
  - `vicidialer/` - Call center agent/campaign stats with cron sync
- Each module has its own routes, services, and schedulers

**Scheduled Tasks:**
- `node-cron` for background jobs
- Schedulers initialized via `backend/config/registerSchedulers.js`
- Module-specific schedulers for DropCowboy SFTP sync, Mautic API sync, Vicidial agent sync

**Error Handling:**
- Custom `AppError` class hierarchy in `backend/middleware/errorHandler.js`
- Centralized error handler middleware
- Winston logger with file rotation (`logs/error.log`, `logs/combined.log`)

**Security:**
- Helmet for security headers
- Rate limiting via `express-rate-limit` (generous defaults: 10000 req/min API, 1000 req/5min auth)
- CORS enabled
- Encryption service for sensitive credentials (AES-256-CBC)

### Frontend Architecture

**Framework & Build:**
- React 19.x with Vite 7.x build tool
- React Router v7 for routing
- Development server proxies `/api` to backend on port 3027

**State Management:**
- Zustand for global state (`frontend/src/zustand/store.js`)
- `useAuthStore` for authentication state
- `useViewLevel` for UI navigation state
- Context API used alongside Zustand where appropriate

**Styling:**
- Tailwind CSS 3.x with custom brand colors (primary blue, secondary green)
- Custom animations defined in `tailwind.config.js`

**Key Patterns:**
- Barrel exports for component organization (e.g., `components/Settings/index.js`)
- Custom hooks for reusable logic (`useSiteBranding.js`)
- Centralized permission helpers in `utils/permissions.js`
- Error handling utilities in `utils/errorHandler.js`

### Data Flow

1. Frontend makes authenticated requests to `/api/*` endpoints
2. Backend validates JWT, checks permissions via middleware
3. Business logic in route handlers or services
4. Prisma queries MySQL database
5. Response follows consistent format: `{ success: boolean, data?, error?, pagination? }`

## External Dependencies

### Database
- **MySQL** - Primary data store accessed via Prisma ORM
- Connection configured via `DATABASE_URL` environment variable

### Third-Party Service Integrations

**Mautic (Email Marketing):**
- Basic auth API integration
- Credentials stored encrypted in database
- Syncs emails, campaigns, and contacts
- Scheduler runs daily at 3 AM by default

**DropCowboy (Ringless Voicemail):**
- SFTP integration using `ssh2-sftp-client`
- Downloads CSV files from remote server
- Parses campaign data and stores in database
- Scheduler runs daily at 2 AM by default

**Vicidial (Call Center):**
- HTTPS API calls to Vicidial server
- Syncs agent stats and campaign data
- Credentials stored in database
- Cron job for agent/campaign sync

### Email Services
- **Nodemailer** for transactional emails
- SMTP credentials stored in database
- Template-based notifications with variable interpolation
- OTP service for passwordless authentication and password reset

### Required Environment Variables
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Token signing key (minimum 32 characters)
- `ENCRYPTION_KEY` - For encrypting sensitive credentials (minimum 32 characters)

### Optional Environment Variables
- `PORT` - Server port (default: 3027)
- `CRON_SCHEDULE` - DropCowboy sync schedule
- `MAUTIC_SYNC_SCHEDULE` - Mautic sync schedule
- `ENABLE_SCHEDULER` - Enable schedulers in development
- `LOG_LEVEL` - Winston log level