# DigitalBevy Development Platform

A comprehensive business management platform with integrated CRM, campaign management, and user hierarchy system.

## Project Overview

- **Purpose**: Business management platform with CRM, campaign management, and user hierarchy
- **Current State**: Development environment configured and running
- **Last Updated**: December 30, 2025

## Technology Stack

### Backend
- **Runtime**: Node.js 20.x
- **Framework**: Express 5.x
- **ORM**: Prisma 6.x
- **Database**: PostgreSQL (Replit-provided)
- **Authentication**: JWT with bcrypt
- **Logging**: Winston

### Frontend
- **Framework**: React 19.x
- **Build Tool**: Vite 7.x
- **Routing**: React Router v7
- **State Management**: Zustand + Context API
- **Styling**: Tailwind CSS
- **Charts**: Recharts

## Project Structure

```
Reporting-Dashboard/
├── backend/
│   ├── app.js           # Express app configuration
│   ├── server.js        # Server entry point
│   ├── prisma/          # Database schema and migrations
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic
│   ├── middleware/      # Auth, logging, rate limiting
│   ├── modules/         # Third-party integrations
│   │   ├── dropCowboy/  # SFTP data sync
│   │   ├── mautic/      # Marketing automation
│   │   └── vicidialer/  # Call center integration
│   └── utils/           # Helper utilities
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main app component
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   ├── contexts/    # React contexts
│   │   ├── hooks/       # Custom hooks
│   │   ├── services/    # API services
│   │   └── zustand/     # State management
│   └── vite.config.js   # Vite configuration
└── README.md
```

## Running the Application

The application runs with two workflows:
1. **Backend API**: Runs on port 3000 (internal)
2. **Frontend**: Runs on port 5000 (web preview via Vite dev server)

The frontend uses Vite's proxy to forward `/api` requests to the backend.

## Environment Configuration

### Backend (.env)
- `PORT`: Backend port (3000)
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT signing secret
- `ENCRYPTION_KEY`: Encryption key for sensitive data
- `NODE_ENV`: Environment (development/production)

### Frontend (.env)
- `VITE_API_URL`: API base URL (empty for proxy mode)

## Key Features

1. **Authentication**: JWT-based with OTP support
2. **User Hierarchy**: Superadmin, Admin, Manager, Employee roles
3. **Client Management**: CRM-style client tracking
4. **Campaign Dashboards**: Visual analytics
5. **Site Customization**: Dynamic branding
6. **Activity Logging**: Middleware-tracked actions

## Database

Uses PostgreSQL with Prisma ORM. Key models:
- User, ActivityLog
- Client, ClientAssignment, Campaign
- DropCowboyCampaign, MauticClient
- NotificationTemplate, SiteSettings

## Application Architecture

### Data Flow
- **Mautic**: Each client has their own Mautic instance (1:1 relationship). Credentials stored per client.
- **DropCowboy**: All clients share ONE DropCowboy account. Campaigns are filtered by client name prefix.
- **Vicidial**: All clients share ONE Vicidial system. Call data is filtered by client name.

### User Access Control
- **Superadmin**: Full access to all clients and settings
- **Admin**: Can manage managers and employees, access all clients
- **Manager**: Can manage employees, access assigned clients only
- **Employee/Telecaller**: Access assigned clients only

---

## Changelog

### December 30, 2025 - Session 2: Delete Functionality & API Fixes

#### New Features

**1. Permanent Delete for Mautic Clients**
- **What**: Added ability to permanently delete a Mautic client and ALL associated data
- **Why**: Previously only soft-delete (deactivate) existed. Users couldn't remove a client to re-add it with the same name.
- **Files Changed**:
  - `backend/modules/mautic/routes/api.js` - Added `DELETE /api/mautic/clients/:id/permanent` endpoint
  - `frontend/src/services/mautic/api.js` - Added `hardDeleteClient()` function
  - `frontend/src/services/mautic/mauticService.js` - Added `hardDeleteClient()` method
  - `frontend/src/hooks/mautic/useMautic.js` - Added `hardDeleteClient` to `useClientManagement` hook
  - `frontend/src/components/mautic/ClientsTable.jsx` - Added trash icon button with double confirmation

**Permanent Delete Details**:
- Deletes all related records in a transaction:
  - MauticEmail (emails synced from Mautic)
  - MauticEmailReport (email delivery reports)
  - MauticCampaign (campaigns)
  - MauticSegment (segments)
  - MauticSyncLog (sync history)
  - MauticFetchedMonth (fetch tracking)
- If linked to a main Client record with no other Mautic services, also deletes that Client
- Unlinks any DropCowboy campaigns before deleting linked Client (sets clientId to null)

#### Bug Fixes

**2. API Client Authentication Fix**
- **What**: Fixed Mautic and DropCowboy API clients not sending authentication tokens
- **Why**: Custom axios instances don't inherit `axios.defaults`, so auth headers were missing
- **Symptoms**: 401/404 errors when making API calls
- **Files Changed**:
  - `frontend/src/services/mautic/api.js` - Added request interceptor for auth token
  - `frontend/src/services/dropCowboy/api.js` - Added request interceptor for auth token

**3. API Base URL Fix**
- **What**: Changed fallback URL from `https://dev.hcddev.com` to empty string
- **Why**: Empty string uses Vite proxy correctly; hardcoded URL bypassed proxy and caused CORS/routing issues
- **Symptoms**: 404 errors, requests going to wrong server
- **Files Changed**:
  - `frontend/src/services/mautic/api.js` - Changed baseURL fallback to `""`
  - `frontend/src/services/dropCowboy/api.js` - Changed baseURL fallback to `""`

---

### December 30, 2025 - Session 1: Initial Setup & Migration

#### Infrastructure Changes

**1. MySQL to PostgreSQL Migration**
- **What**: Converted all database operations from MySQL to PostgreSQL
- **Why**: Replit provides PostgreSQL; MySQL required external service
- **Files Changed**: 
  - `backend/prisma/schema.prisma` - Changed provider to postgresql
  - Various backend files - Updated any MySQL-specific syntax

**2. Vite Proxy Configuration**
- **What**: Configured Vite to proxy `/api` requests to backend on port 3000
- **Why**: Frontend runs on port 5000, backend on port 3000; proxy enables seamless API calls
- **Files Changed**: `frontend/vite.config.js`

**3. Express Trust Proxy Setting**
- **What**: Added `app.set('trust proxy', 1)` for rate limiter
- **Why**: Behind Replit's proxy, rate limiter needs to trust X-Forwarded-For headers
- **Files Changed**: `backend/app.js`

**4. Database Seeding**
- **What**: Seeded notification templates into fresh database
- **Why**: Required for notification system to function

---

## API Endpoints Reference

### Mautic Client Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mautic/clients` | List all Mautic clients |
| POST | `/api/mautic/clients` | Create new Mautic client |
| PUT | `/api/mautic/clients/:id` | Update Mautic client |
| PATCH | `/api/mautic/clients/:id/toggle` | Toggle active/inactive status (soft delete) |
| DELETE | `/api/mautic/clients/:id/permanent` | **NEW** - Permanently delete client and all data |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |

---

## Developer Notes

### Adding New API Services
When creating a new axios instance for API calls:
1. Use empty string as baseURL fallback: `const baseURL = import.meta.env.VITE_API_URL || ""`
2. Add auth interceptor:
```javascript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Database Cascade Behavior
- MauticClient children (emails, campaigns, segments, sync logs) have `onDelete: Cascade`
- DropCowboyCampaign has `onDelete: SetNull` for clientId (campaigns persist, just unlinked)
- Client children (ClientAssignment, Campaign) have `onDelete: Cascade`

### Testing Credentials
- **Superadmin**: `admin@digitalbevy.com` / `Admin@123`
