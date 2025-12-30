# DigitalBevy Development Platform

## Overview
Business management system integrating CRM, campaign management, and user hierarchy with dynamic role-based access control.

## Authorization System

### Dynamic Roles Architecture
All authorization is driven by custom roles defined in Settings. The system uses permission-based access control with NO hardcoded role logic:

**Permission Modules:**
- `Users` - User management (Create, Read, Update, Delete)
- `Clients` - Client management (Create, Read, Update, Delete)
- `Settings` - System settings (Read, Update)
- `Activities` - Activity logs (Read)

**Role Fields:**
- `fullAccess` - Boolean, grants access to all modules and actions
- `isTeamManager` - Boolean, determines if users with this role appear in manager dropdown for client assignments
- `permissions` - JSON object storing module-specific permissions

**Authorization Helpers (backend/middleware/auth.js):**
- `hasFullAccess(user)` - Checks if user has full access via customRole.fullAccess
- `userHasPermission(user, module, action)` - Checks specific permission in customRole
- `requirePermission(module, action)` - Route middleware for permission checks
- `requireFullAccess` - Route middleware requiring full access

### Client Assignment Logic
Client assignment uses an explicit `isTeamManager` field to classify users:

**"Manager" for Assignment Purposes:**
- User with `customRole.fullAccess = true`, OR
- User with `customRole.isTeamManager = true`
- Legacy users: superadmin/admin/manager role without customRole assigned

**"Employee" for Assignment:**
- User without fullAccess and without isTeamManager flag

**Assignment Endpoints (clients.js):**
- `/assignment/managers` - Returns users who have isTeamManager or fullAccess roles
- `/assignment/managers/:id/employees` - Returns team members under a manager
- `POST /:id/assign` - Permission-based assignment validation
- `DELETE /:id/assign/:userId` - Permission-based unassignment

### Frontend Permission Helpers
Each component includes local permission helpers for consistency:
```javascript
const hasFullAccess = () => user?.customRole?.fullAccess === true || 
  (!user?.customRoleId && ['superadmin', 'admin'].includes(user?.role));

const hasPermission = (module, action) => {
  if (hasFullAccess()) return true;
  const modulePerms = user?.customRole?.permissions?.[module];
  // Handle both array and object permission formats
  if (Array.isArray(modulePerms)) return modulePerms.includes(action);
  if (modulePerms && typeof modulePerms === 'object') return modulePerms[action] === true;
  return false;
};

const canManageTeam = () => hasFullAccess() || user?.customRole?.isTeamManager === true;
```

### Backward Compatibility
Legacy users without a customRole assigned receive temporary fallback permissions:
- Legacy `superadmin`/`admin` role → Full access until customRole assigned
- Legacy `manager` role → Team manager status until customRole assigned

**To Complete Migration:** Assign customRoles to all legacy users via Settings page.

## Key Files

### Backend
- `backend/middleware/auth.js` - Authentication and authorization middleware
- `backend/routes/employees.js` - User management with permission checks
- `backend/routes/clients.js` - Client CRUD with isTeamManager-based assignment logic
- `backend/routes/settings.js` - Settings with full access requirements
- `backend/routes/activities.js` - Activity logs with permission filtering
- `backend/prisma/schema.prisma` - Database schema with Role model (includes isTeamManager field)

### Frontend
- `frontend/src/pages/Clients.jsx` - Client management with isTeamManager-based assignment
- `frontend/src/pages/Employees.jsx` - User management UI with permission checks
- `frontend/src/pages/Activities.jsx` - Activity logs with permission checks
- `frontend/src/pages/Settings.jsx` - Role management UI
- `frontend/src/components/Settings/RolesAndPermissions.jsx` - Role creation/edit with Team Manager checkbox
- `frontend/src/contexts/AuthContext.jsx` - Auth context

## Integrations
- Mautic (marketing automation)
- DropCowboy (ringless voicemail via SFTP)
- Vicidial (call center management)

## Recent Changes (December 2024)
- **Added `isTeamManager` field to Role model** - Explicit designation for team managers in client assignment
- Updated Settings UI with "Team Manager" checkbox in role creation/edit dialog
- Updated client assignment endpoints to use isTeamManager instead of inferring from permissions
- **CRITICAL FIX: `userHasPermission` now handles object format permissions** - Backend middleware now correctly checks `{"Create": true}` object format in addition to `["Create"]` array format
- Fixed Roles API access - Users with Users.Create/Update permissions can now fetch roles list
- Fixed Settings page access - Users with any Settings subsection permissions can now access the Settings page
- Migrated all authorization from hardcoded role names to dynamic permissions
- Replaced `authorize()` middleware with `requirePermission()` in all routes
- Frontend components updated with permission helpers that handle both permission formats
- **EMPLOYEES API FIX (Dec 30, 2024):** Team managers now see employees assigned to their clients via `ClientAssignment` table, not the legacy empty `_ManagerEmployee` table
- **SETTINGS PAGE FIX (Dec 30, 2024):** Removed hardcoded `user?.role` checks. Now uses dynamic permission check via `hasSettingsAccess()` and `canAccessSetting()` functions that handle both object `{"Autovation Clients": true}` and array `["Autovation Clients"]` permission formats

## Database & Deployment

### Multi-Database Support
The application supports both MySQL and PostgreSQL databases:

**Schema Files:**
- `backend/prisma/schema.prisma` - Active schema (copied from provider-specific file)
- `backend/prisma/schema.mysql.prisma` - MySQL schema template
- `backend/prisma/schema.postgres.prisma` - PostgreSQL schema template

**Switching Databases:**
```bash
# Use the switch script
./backend/scripts/switch-database.sh mysql    # For MySQL
./backend/scripts/switch-database.sh postgres # For PostgreSQL
```

### Deployment Script (deploy.sh)
Interactive deployment script supporting multi-site server deployments:

**Features:**
- Selects database provider (MySQL or PostgreSQL)
- Configures database connection interactively
- Sets website URL and application port
- Generates security keys (JWT, encryption)
- Builds frontend and syncs with backend
- Runs database migrations and optional seeding
- Starts application with PM2 process manager

**Usage:**
```bash
# Interactive deployment
./deploy.sh

# Quick deployment (uses existing .env)
./deploy.sh --quick

# Help
./deploy.sh --help
```

**Port Configuration:**
- Default port: 3026
- Configurable during deployment for multi-site setups
- Backend reads `PORT` environment variable

### Environment Variables
Key environment variables (see `backend/.env.example`):
- `PORT` - Application port (default: 3026)
- `DATABASE_URL` - Database connection string (MySQL or PostgreSQL format)
- `JWT_SECRET` - Token signing secret
- `ENCRYPTION_KEY` - Data encryption key
- `FRONTEND_URL` - Public URL for email links
