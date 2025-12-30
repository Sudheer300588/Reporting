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
- User, ActivityLog, Role
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

### December 30, 2025 - Session 3: Dynamic Roles & Permissions System

#### New Features

**1. Dynamic Role Management**
- **What**: Added complete CRUD for custom roles with granular permissions
- **Why**: Roles were previously hardcoded as enum. Users needed ability to create/edit roles from Settings.
- **Files Changed**:
  - `backend/prisma/schema.prisma` - Added `Role` model with JSON permissions field, added `customRoleId` to User
  - `backend/routes/roles.js` - Full CRUD API for roles
  - `backend/app.js` - Registered roles routes
  - `frontend/src/services/roles/api.js` - Roles API service with auth interceptor
  - `frontend/src/components/Settings/RolesAndPermissions.jsx` - Complete UI for role list, create, edit, delete
  - `frontend/src/components/Settings/Permissions.jsx` - Granular permissions selector with module-based grouping

**Role Model Details**:
- `name` - Unique role name
- `description` - Optional description
- `fullAccess` - Boolean for full system access (disables permissions tab when ON)
- `permissions` - JSON object storing granular permissions by module
- `isSystem` - Boolean to mark built-in roles (cannot be edited/deleted)
- `isActive` - Soft delete capability

**Permissions Schema**:
```json
{
  "Pages": ["Dashboard", "Clients", "Users", "Services", "Activities", "Settings"],
  "Settings": ["Roles", "Autovation Clients", "Notifications", "SMTP Credentials", ...],
  "Users": ["Create", "Read", "Update", "Delete"],
  "Clients": ["Create", "Read", "Update", "Delete"]
}
```

**User-Role Relationship**:
- User model has optional `customRoleId` field
- Maintains backward compatibility with existing `role` enum (UserRole)
- Custom role permissions override enum permissions when assigned

---

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

### Role Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/roles` | List all roles with user counts |
| GET | `/api/roles/:id` | Get single role details |
| GET | `/api/roles/schema` | Get permissions schema |
| POST | `/api/roles` | Create new role |
| PUT | `/api/roles/:id` | Update role |
| DELETE | `/api/roles/:id` | Delete role (non-system only) |
| PATCH | `/api/roles/:id/toggle` | Toggle role active status |

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

---

## Known Issues & Improvement Plan (December 30, 2025)

### Current Issues

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Large Settings file | Medium | `frontend/src/pages/Settings.jsx` | 2,398 lines managing 8 sections - hard to maintain |
| Debug console.logs | Low | `frontend/src/pages/Settings.jsx` | Lines 147, 582-590 have debug statements |
| No password toggle | Low | Settings: SFTP, Vicidial | Password fields don't have show/hide button |
| No connection tests | Medium | Settings: SFTP, Vicidial | No way to verify credentials work before saving |
| Dynamic roles not enforced | High | `backend/middleware/auth.js` | Custom roles stored but not checked in auth |
| No role assignment UI | Medium | User management | Users cannot be assigned custom roles |
| Two role systems | Medium | Settings page | Old AdminSettingsPermission overlaps with new Role model |

### Implementation Plan

**Phase 1: Quick Fixes (Low Risk)**
1. Remove console.log debug statements
2. Add password visibility toggle to SFTP/Vicidial forms
3. Add form validation for credential fields

**Phase 2: Feature Additions (Medium Risk)**
4. Add SFTP connection test endpoint and button
5. Add Vicidial connection test endpoint and button
6. Add role assignment dropdown in User create/edit forms

**Phase 3: Auth Integration (Higher Risk)**
7. Update auth middleware to check customRole permissions
8. Update JWT token to include role permissions
9. Update frontend permission checks

**Phase 4: Code Organization (Refactor)**
10. Split Settings.jsx into separate component files:
    - `SettingsRoles.jsx`
    - `SettingsMautic.jsx`
    - `SettingsNotifications.jsx`
    - `SettingsMaintenance.jsx`
    - `SettingsSMTP.jsx`
    - `SettingsSFTP.jsx`
    - `SettingsVicidial.jsx`
    - `SettingsSiteCustomization.jsx`

### Settings Sections Overview

| Section | Purpose | Access Level |
|---------|---------|--------------|
| Roles & Permissions | Create/edit custom roles | Superadmin only |
| Autovation Clients | Manage Mautic connections | Superadmin, permitted Admins |
| Notifications | Email template configuration | Superadmin, permitted Admins |
| System Maintenance Email | Send mass emails | Superadmin, permitted Admins |
| SMTP Credentials | Email server configuration | Superadmin, permitted Admins |
| Voicemail SFTP Credentials | DropCowboy sync settings | Superadmin, permitted Admins |
| Vicidial Credentials | Call center API config | Superadmin, permitted Admins |
| Site Customization | Branding (logo, colors) | Superadmin, permitted Admins |
