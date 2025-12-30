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

**Authorization Helpers (backend/middleware/auth.js):**
- `hasFullAccess(user)` - Checks if user has full access via customRole.fullAccess
- `userHasPermission(user, module, action)` - Checks specific permission in customRole
- `requirePermission(module, action)` - Route middleware for permission checks
- `requireFullAccess` - Route middleware requiring full access

### Client Assignment Logic
Client assignment now uses dynamic permissions instead of hardcoded role names:

**"Manager" for Assignment Purposes:**
- User with `customRole.fullAccess = true`, OR
- User with `Users.Create` permission (not Users.Read - that's too permissive)
- Legacy users: superadmin/admin/manager role without customRole assigned

**"Employee" for Assignment:**
- User without team management permissions (no fullAccess, no Users.Create)

**Assignment Endpoints (clients.js):**
- `/assignment/managers` - Returns users who can manage teams (based on permissions)
- `/assignment/managers/:id/employees` - Returns team members under a manager
- `POST /:id/assign` - Permission-based assignment validation
- `DELETE /:id/assign/:userId` - Permission-based unassignment

### Frontend Permission Helpers
Each component includes local permission helpers for consistency:
```javascript
const hasFullAccess = () => user?.customRole?.fullAccess === true || 
  (!user?.customRoleId && ['superadmin', 'admin'].includes(user?.role));

const hasPermission = (module, action) => hasFullAccess() || 
  user?.customRole?.permissions?.[module]?.includes(action);

const canManageTeam = () => hasFullAccess() || hasPermission('Users', 'Create');
```

### Backward Compatibility
Legacy users without a customRole assigned receive temporary fallback permissions:
- Legacy `superadmin`/`admin` role → Full access until customRole assigned
- Legacy `manager` role → Users/Clients management until customRole assigned

**To Complete Migration:** Assign customRoles to all legacy users via Settings page.

## Key Files

### Backend
- `backend/middleware/auth.js` - Authentication and authorization middleware
- `backend/routes/employees.js` - User management with permission checks
- `backend/routes/clients.js` - Client CRUD with permission-based assignment logic
- `backend/routes/settings.js` - Settings with full access requirements
- `backend/routes/activities.js` - Activity logs with permission filtering
- `backend/prisma/schema.prisma` - Database schema with Role model

### Frontend
- `frontend/src/pages/Clients.jsx` - Client management with permission-based assignment
- `frontend/src/pages/Employees.jsx` - User management UI with permission checks
- `frontend/src/pages/Activities.jsx` - Activity logs with permission checks
- `frontend/src/pages/Settings.jsx` - Role management UI
- `frontend/src/contexts/AuthContext.jsx` - Auth context

## Integrations
- Mautic (marketing automation)
- DropCowboy (ringless voicemail via SFTP)
- Vicidial (call center management)

## Recent Changes (December 2024)
- Migrated all authorization from hardcoded role names to dynamic permissions
- Replaced `authorize()` middleware with `requirePermission()` in all routes
- Updated role-based conditionals to use `hasFullAccess()` and `userHasPermission()`
- **Client assignment endpoints now use permission-based user classification**
- Frontend components (Clients.jsx, Activities.jsx, Settings.jsx) updated with permission helpers
- Settings admin-permissions routes now use customRole permissions
- `canViewClients` middleware allows all authenticated users (route handlers filter)
