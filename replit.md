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

## Recent Changes

- December 30, 2025: Migrated from MySQL to PostgreSQL for Replit compatibility
- December 30, 2025: Configured Vite proxy for API requests
- December 30, 2025: Added trust proxy setting for rate limiter
