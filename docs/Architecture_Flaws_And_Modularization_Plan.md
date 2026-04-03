# Architecture Flaws And Modularization Plan

## Purpose

This document captures:

- the major technical flaws currently present in the application
- the structural reasons the codebase is difficult to scale safely
- the target modular architecture for future work
- the recommended execution plan for refactoring and new development

This document is intended to become the working baseline for development on the `sudheer` branch.

## Executive Summary

The application already contains useful business logic and working integrations, but the current structure has several serious issues:

- multiple high-risk security and authorization flaws
- oversized route files acting as "god modules"
- weak separation between HTTP, business logic, provider integration, and persistence
- background jobs running inside request handlers
- duplicated permission logic across frontend and backend
- coexistence of current platform code with older, partially stale subsystems

The right long-term direction is a modular monolith:

- one deployment unit
- one primary database
- clear module boundaries
- dedicated service ownership per domain
- explicit background job layer
- provider integrations isolated behind adapters

The first phase must be security hardening. Modularization should not begin by moving files around while public administrative and sync endpoints remain exposed.

## Current High-Risk Flaws

## 1. Public Registration Is Still Open

### Problem

The frontend hides signup after the first user, but the backend registration endpoint still accepts public requests.

### Evidence

- `backend/routes/auth.js:22` checks whether signup should be allowed
- `backend/routes/auth.js:47` exposes public registration
- `backend/routes/auth.js:100` still applies a caller-provided role for non-first users

### Why This Is Dangerous

- any unauthenticated caller can create users after bootstrap
- callers can create privileged users up to the configured caps
- the frontend restriction is only cosmetic and not a true backend access control

### Impact

- account creation is not truly locked down
- administrative access can be expanded by public callers

## 2. Mautic Administrative Surface Is Public

### Problem

The Mautic route group is mounted without an authentication gate.

### Evidence

- `backend/app.js:194` mounts `/api/mautic`
- `backend/modules/mautic/email/routes/api.js:39` lists clients without auth
- `backend/modules/mautic/email/routes/api.js:504` creates clients without auth
- `backend/modules/mautic/email/routes/api.js:836` returns a decrypted stored password
- `backend/modules/mautic/email/routes/api.js:1450` tests external Mautic credentials without auth

### Why This Is Dangerous

- external callers can inspect operational data
- external callers can create and update integration records
- decrypted secrets can be returned through HTTP

### Impact

- credential exposure risk
- unauthorized external system interaction
- high operational abuse potential

## 3. DropCowboy Sync Endpoints Are Public

### Problem

The DropCowboy route group contains sensitive operational endpoints, but some of them are reachable without auth.

### Evidence

- `backend/app.js:191` mounts `/api/dropcowboy`
- `backend/modules/dropCowboy/routes/api.js:230` allows manual fetch without auth
- `backend/modules/dropCowboy/routes/api.js:337` exposes sync status without auth

### Why This Is Dangerous

- unauthenticated callers can trigger heavyweight SFTP import operations
- service behavior and operational timing become externally visible

### Impact

- denial-of-service risk
- unwanted external sync execution
- information leakage about system operation

## 4. SMS Sync And SMS Client Management Are Public

### Problem

SMS management and sync routes are also exposed without consistent auth enforcement.

### Evidence

- `backend/routes/sms.js:12`
- `backend/routes/sms.js:62`
- `backend/routes/sms.js:85`
- `backend/modules/mautic/email/routes/api.js:24` mounts nested SMS routes
- `backend/modules/mautic/sms/routes/smsClient.js:60`
- `backend/modules/mautic/sms/routes/smsClient.js:116`
- `backend/modules/mautic/sms/routes/smsClient.js:177`

### Why This Is Dangerous

- unauthorized callers can inspect SMS configuration and sync state
- unauthorized callers can create SMS clients or trigger sync work

### Impact

- operational misuse
- data exposure
- credential and sync abuse risk

## 5. Scheduler Contains Stale Domain Logic

### Problem

The notification scheduler still executes task and project logic even though the current Prisma schema does not define those models.

### Evidence

- `backend/services/schedulerService.js:18`
- `backend/services/schedulerService.js:105` calls `prisma.task`
- `backend/services/schedulerService.js:122` calls `prisma.notification`
- current schema in `backend/prisma/schema.prisma` does not define `Task`, `Project`, or `Notification`

### Why This Is Dangerous

- scheduled runtime behavior does not match the actual application schema
- dead or stale code is still being initialized during startup

### Impact

- unnecessary runtime errors
- operator confusion
- drift between product reality and background job behavior

## Structural Flaws Blocking Scale

## 1. God Files And Mixed Responsibilities

Several files are too large and mix unrelated concerns.

### High-Complexity Files

- `backend/modules/mautic/email/routes/api.js` - 2545 lines
- `backend/routes/superadmin.js` - 1818 lines
- `backend/routes/clients.js` - 1624 lines
- `backend/routes/employees.js` - 781 lines
- `backend/routes/auth.js` - 705 lines
- `frontend/src/pages/Clients.jsx` - 736 lines
- `frontend/src/pages/Employees.jsx` - 671 lines

### What Is Mixed Together

- request parsing
- authorization
- provider orchestration
- business rules
- background task kickoff
- Prisma queries
- response shaping

### Result

- hard to test
- hard to reason about
- hard to change safely
- high merge-conflict probability

## 2. Weak Module Boundaries

The codebase has folders named like modules, but the boundaries are porous.

Examples:

- `backend/modules/mautic/email/routes/api.js` directly mounts SMS routes
- the Mautic route also imports DropCowboy services
- route files call Prisma directly and also invoke cross-domain behavior
- admin behavior is split between new routes and `superadmin.js`

### Result

- domains are tangled
- modules do not truly own their own behavior
- changes in one area can break another unexpectedly

## 3. Background Work Lives Inside HTTP Request Handlers

### Evidence

- `backend/modules/mautic/email/routes/api.js:681`
- `backend/modules/mautic/email/routes/api.js:738`
- other background-start patterns appear throughout the Mautic route file

### Problem

Heavy work is started with `setImmediate` inside web requests.

### Why This Is Weak

- work is tied to the lifecycle of the API process
- jobs are not durable
- retries are ad hoc
- there is no explicit work queue
- operators cannot manage jobs centrally

### Result

- unreliable backfills
- difficult recovery after crashes
- poor observability

## 4. Frontend And Backend Re-Implement Authorization Separately

### Evidence

- backend permission rules in `backend/middleware/auth.js`
- frontend permission rules in `frontend/src/utils/permissions.js`

### Problem

The frontend mirrors policy logic instead of consuming a single authoritative authorization contract.

### Result

- policy drift risk
- UI and API can disagree
- adding permissions requires changing both sides

## 5. Current And Legacy Systems Coexist In The Same Runtime

### Examples

- `backend/routes/employee.js` exists but is not mounted
- `backend/routes/manager.js` exists but is not mounted
- task/project notification logic remains in scheduler services
- frontend OTP helpers still reference backend endpoints that do not exist

### Result

- repository intent is harder to understand
- dead paths raise maintenance cost
- engineers must first determine whether a path is active before editing it

## 6. Public And Administrative Concerns Are Not Clearly Separated

The current route topology makes it too easy for sensitive provider-management features to be mounted without proper protection.

### Result

- security depends on remembering to wrap each individual route correctly
- route groups do not reliably reflect access level

## 7. Inconsistent Session And Runtime Behavior

### Evidence

- `backend/app.js:55` allows permissive CORS fallback
- `backend/app.js:61` sets 2-minute cookie max age while the comment describes 24-hour behavior

### Result

- deployment behavior is harder to reason about
- session expectations are inconsistent
- cross-origin security posture is weak by default

## 8. Frontend Pages Are Feature Hubs Instead Of Feature Assemblies

Large pages such as:

- `frontend/src/pages/Clients.jsx`
- `frontend/src/pages/Employees.jsx`

combine:

- state machine logic
- API orchestration
- permissions
- modal flows
- presentation
- assignment workflows

### Result

- poor component reuse
- difficult testing
- harder feature extraction later

## Target Architecture

## Guiding Principle

The right target is a modular monolith.

That means:

- one backend app
- one frontend app
- one primary database
- clear boundaries by domain
- explicit ownership per module

This is a better fit than jumping to microservices because:

- the system is still tightly related around one business product
- modules share users, clients, roles, and reporting state
- the biggest problem is separation of concerns, not independent deployment

## Backend Target Shape

```text
backend/src
  app/
    createApp.js
    registerRoutes.js
    registerSchedulers.js
  shared/
    auth/
    db/
    errors/
    http/
    logging/
    jobs/
    validation/
    config/
  modules/
    auth/
      auth.routes.js
      auth.controller.js
      auth.service.js
      auth.repository.js
      auth.schemas.js
    users/
    roles/
    clients/
    settings/
    notifications/
    branding/
    ai/
    mautic-email/
      routes/
      application/
      domain/
      infrastructure/
    mautic-sms/
      routes/
      application/
      domain/
      infrastructure/
    dropcowboy/
      routes/
      application/
      domain/
      infrastructure/
    vicidial/
      routes/
      application/
      domain/
      infrastructure/
```

## Frontend Target Shape

```text
frontend/src
  app/
  shared/
    api/
    auth/
    permissions/
    ui/
    utils/
  features/
    auth/
    dashboard/
    users/
    roles/
    clients/
    settings/
    notifications/
    branding/
    ai/
    mautic-email/
    mautic-sms/
    dropcowboy/
    vicidial/
```

## Module Rules

Each module should own:

- its route definitions
- its controllers
- its application services or use cases
- its repositories
- its validation schemas
- its response DTO shaping
- its provider adapters
- its tests

Each module should not directly own:

- global Express bootstrap
- global logger setup
- global Prisma bootstrapping
- cross-module permission policy definitions

## Layering Rules

### Controllers

Controllers should:

- validate input
- call a use case or service
- map result to HTTP response

Controllers should not:

- perform large Prisma workflows directly
- orchestrate multiple providers inline
- start background jobs manually

### Application Services

Application services should:

- hold business workflow logic
- coordinate repositories and adapters
- emit job requests

### Repositories

Repositories should:

- encapsulate Prisma queries
- expose domain-specific persistence methods

Repositories should not:

- know about HTTP
- know about provider APIs

### Provider Adapters

Adapters should encapsulate:

- Mautic API calls
- DropCowboy SFTP behavior
- Vicidial API calls
- SMTP behavior
- AI provider calls

### Jobs

Jobs should become a first-class layer.

Examples:

- Mautic metadata fetch job
- Mautic historical backfill job
- SMS enrichment job
- DropCowboy import job
- Vicidial sync job

These should be dispatched explicitly and monitored explicitly.

## Recommended Refactor Plan

## Phase 0: Safety And Baseline

### Goals

- freeze the shape of the current system
- avoid starting a large refactor without safety rails

### Work

- document active versus inactive routes
- document existing scheduler behavior
- define branch strategy and development workflow
- add architectural decision documentation for modularization

## Phase 1: Security Hardening

### Goals

- remove the highest-risk exposure points before structural refactoring

### Work

- lock backend registration after bootstrap
- require authentication and authorization for all Mautic admin endpoints
- remove or harden the decrypted-password endpoint
- require authentication and authorization for DropCowboy sync operations
- require authentication and authorization for SMS sync and client-management operations
- tighten CORS defaults
- align session behavior with actual intended runtime policy

### Why Phase 1 Comes First

Because modularization without security cleanup just moves dangerous code into new folders.

## Phase 2: Shared Platform Extraction

### Goals

- centralize common infrastructure

### Work

- consolidate auth primitives
- centralize permission policy evaluation
- unify request validation strategy
- centralize error classes and error mapping
- centralize provider configuration access
- define shared job-dispatch interfaces

## Phase 3: Backend Modular Extraction

### Order

1. `auth`
2. `users` and `roles`
3. `clients`
4. `settings`, `branding`, and `notifications`
5. `mautic-email`
6. `mautic-sms`
7. `dropcowboy`
8. `vicidial`
9. reduce and eventually retire `superadmin.js`

### Why This Order

- auth and authorization stabilize everything else
- users, roles, and clients are the platform core
- settings and branding are operationally central
- the provider modules are the largest extractions and depend on stable core contracts

## Phase 4: Background Job Isolation

### Goals

- move long-running provider work out of request handlers

### Work

- replace `setImmediate` backfills with explicit jobs
- define job payloads and lifecycle states
- add progress reporting for jobs
- make sync endpoints dispatch work instead of owning it

## Phase 5: Frontend Modularization

### Goals

- align the frontend structure with backend module boundaries

### Work

- move shared permission logic into one canonical source of truth from backend contracts
- split large pages into feature modules
- move feature-specific API calls into feature service layers
- move complex page state into feature-specific hooks or stores

## Phase 6: Legacy Retirement

### Goals

- remove ambiguity in the repository

### Work

- retire unmounted route files after equivalent paths are confirmed
- remove stale auth helpers that target nonexistent endpoints
- remove or archive obsolete task/project scheduler code
- reduce compatibility shims once migration is complete

## Working Plan For The `sudheer` Branch

## Immediate Development Sequence

1. Security lockdown of exposed route groups and registration behavior
2. Create shared module conventions and folder structure
3. Extract core modules:
   - auth
   - users
   - roles
   - clients
4. Extract operational modules:
   - settings
   - notifications
   - branding
   - ai
5. Extract provider modules one at a time:
   - mautic-email
   - mautic-sms
   - dropcowboy
   - vicidial
6. Move background work to explicit jobs
7. Align frontend features to backend modules
8. Remove stale legacy paths

## Definition Of Success

The modularization effort should be considered successful when:

- every sensitive endpoint is protected by the correct auth and permission policy
- no major route file acts as a god file
- provider integrations are isolated from controllers
- background sync work is not launched directly from request handlers
- frontend feature folders map cleanly to backend modules
- active and legacy code paths are clearly separated

## Closing Note

The application already has meaningful domain value. The problem is not lack of functionality. The problem is that functionality has accumulated faster than structure.

The branch should now be used to:

- secure the current surface
- establish module boundaries
- refactor in phased slices without breaking the running product
