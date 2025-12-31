# DigitalBevy Development Platform

## Overview

DigitalBevy is a comprehensive business management platform designed to integrate CRM, campaign management, and a robust user hierarchy system. It aims to streamline business operations, enhance client management, and provide insightful analytics through centralized dashboards. The platform supports dynamic customization and integrates with key external marketing and communication tools.

## User Preferences

- **Communication**: Explain things clearly and concisely, using simple language.
- **Workflow**: I prefer an iterative development approach. Please ask before making major architectural changes or decisions that might impact the overall structure or core functionalities.
- **Code Style**: I appreciate well-structured and readable code. Ensure proper commenting for complex logic.
- **Interaction**: Provide detailed explanations when introducing new features or significant modifications.

## System Architecture

The platform follows a client-server architecture with a React-based frontend and a Node.js Express backend.

### UI/UX Decisions
- **Styling**: Uses Tailwind CSS for a utility-first approach to design.
- **Charting**: Employs Recharts for dynamic and visual campaign analytics dashboards.
- **Design Approach**: Emphasizes dynamic branding and site customization for varied client needs.

### Technical Implementations
- **Backend**:
    - **Runtime**: Node.js 20.x with Express 5.x.
    - **Database**: PostgreSQL with Prisma 6.x ORM.
    - **Authentication**: JWT-based authentication with bcrypt for password hashing and OTP support.
    - **Logging**: Winston for structured application logging.
- **Frontend**:
    - **Framework**: React 19.x with Vite 7.x for fast development.
    - **State Management**: Combination of Zustand and React Context API.
    - **Routing**: React Router v7.
- **Core Features**:
    - **User Hierarchy**: Supports Superadmin, Admin, Manager, and Employee roles with granular, dynamic permission management.
    - **Client Management**: CRM-style client tracking and assignment.
    - **Campaign Dashboards**: Visual analytics for marketing campaigns.
    - **Site Customization**: Dynamic branding capabilities (logo, colors).
    - **Activity Logging**: Tracks user actions via middleware.

### Settings Page Architecture (Modular Components)
The Settings page has been refactored into modular components located in `frontend/src/components/Settings/`:

- **SettingsLayout.jsx**: Main layout with sidebar navigation and scroll-synced sections. Provides `useSettings` context for shared state.
- **SettingsSection.jsx**: Wrapper component that auto-registers sections with the layout for scroll tracking.
- **SettingsHeader.jsx**: Header component with email notification status banner.
- **SmtpCredentials.jsx**: SMTP email server configuration with password visibility toggle and test email functionality.
- **SftpCredentials.jsx**: DropCowboy SFTP credentials with connection test and manual sync buttons.
- **VicidialCredentials.jsx**: Vicidial API configuration with connection testing.
- **MauticSettings.jsx**: Autovation (Mautic) client management with add/edit modals and sync functionality.
- **SiteBranding.jsx**: Site customization for logo, favicon, and login background (image/color/gradient).
- **RolesAndPermissions.jsx**: Dynamic role management with create/edit/delete functionality.
- **Permissions.jsx**: Granular permission matrix UI for role configuration.
- **index.js**: Barrel export file for all Settings components.

**File Size Limits for Uploads:**
- Favicon: 200KB max (PNG, JPG, SVG, WEBP)
- Logo: 2MB max (PNG, JPG, SVG, WEBP)
- Login Background: 5MB max (PNG, JPG, SVG, WEBP)

### System Design Choices
- **Data Flow**:
    - **Mautic**: Each client has a dedicated Mautic instance (1:1 relationship).
    - **DropCowboy**: All clients share a single DropCowboy account, with data filtered by client name prefix.
    - **Vicidial**: All clients share a single Vicidial system, with call data filtered by client.
- **Access Control**: Role-based access control with a hierarchy that allows Superadmins full control, Admins to manage managers/employees, Managers to manage employees within assigned clients, and Employees access only to assigned clients. Custom roles with granular permissions override base roles.
- **API Communication**: The frontend proxies `/api` requests to the backend, running on different ports during development.
- **Database Seeding**: Notification templates are seeded for initial setup.

## External Dependencies

- **Database**: PostgreSQL (provided by Replit).
- **Mautic**: Marketing automation platform for client-specific instances.
- **DropCowboy**: SFTP service for data synchronization.
- **Vicidial**: Call center integration for managing calls and campaigns.
- **JWT**: JSON Web Tokens for authentication.
- **Prisma**: ORM for database interaction.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **Recharts**: Charting library for React.
- **Winston**: Logging library.