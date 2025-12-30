# DigitalBevy Development Platform

## Overview
Business management system integrating CRM, campaign management, and user hierarchy with dynamic role-based access control.

## Authorization System

### Dynamic Roles Architecture
All authorization is driven by custom roles defined in Settings. The system uses permission-based access control:

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

### Backward Compatibility
Legacy users without a customRole assigned receive temporary fallback permissions:
- Legacy `superadmin`/`admin` role → Full access until customRole assigned
- Legacy `manager` role → Users/Clients management until customRole assigned

**To Complete Migration:** Assign customRoles to all legacy users via Settings page.

## Key Files

### Backend
- `backend/middleware/auth.js` - Authentication and authorization middleware
- `backend/routes/employees.js` - User management with permission checks
- `backend/routes/clients.js` - Client CRUD with permission-based filtering
- `backend/routes/settings.js` - Settings with full access requirements
- `backend/routes/activities.js` - Activity logs with permission filtering
- `backend/prisma/schema.prisma` - Database schema with Role model

### Frontend
- `frontend/src/pages/Employees.jsx` - User management UI with permission checks
- `frontend/src/pages/Settings.jsx` - Role management UI
- `frontend/src/contexts/AuthContext.jsx` - Auth context with permission helpers

## Integrations
- Mautic (marketing automation)
- DropCowboy (ringless voicemail via SFTP)
- Vicidial (call center management)

## Recent Changes (December 2024)
- Migrated all authorization from hardcoded role names to dynamic permissions
- Replaced `authorize()` middleware with `requirePermission()` in all routes
- Updated role-based conditionals to use `hasFullAccess()` and `userHasPermission()`
- Settings admin-permissions routes now use customRole permissions
- `canViewClients` middleware allows all authenticated users (route handlers filter)
