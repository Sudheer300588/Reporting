# DigitalBevy Development Platform

A comprehensive business management platform with integrated CRM, campaign management, and user hierarchy system.

## 🏗️ Architecture

### **Technology Stack**

**Backend:**

- **Runtime:** Node.js 22.x
- **Framework:** Express 5.x
- **ORM:** Prisma 6.x
- **Database:** MySQL
- **Authentication:** JWT with bcrypt
- **Logging:** Winston
- **Task Scheduling:** node-cron
- **File Uploads:** Multer
- **Email:** Nodemailer

**Frontend:**

- **Framework:** React 19.x
- **Build Tool:** Vite 7.x
- **Routing:** React Router v7
- **State Management:** Zustand + Context API
- **Styling:** Tailwind CSS 3.x
- **HTTP Client:** Axios
- **Notifications:** React Toastify
- **Charts:** Recharts
- **Icons:** Lucide React

### **Project Structure**

```
dev/
├── backend/                    # Node.js/Express API
│   ├── app.js                 # Express app configuration
│   ├── server.js              # Server entry point
│   ├── config/                # Configuration files
│   ├── middleware/            # Auth, RBAC, logging, rate limiting
│   ├── modules/               # Feature modules (DropCowboy, Mautic)
│   ├── prisma/                # Database schema & migrations
│   ├── routes/                # API endpoints
│   ├── services/              # Business logic
│   ├── utils/                 # Helper functions
│   └── validators/            # Zod schemas
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── contexts/          # React Context providers
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Page components
│   │   ├── services/          # API service clients
│   │   ├── utils/             # Helper functions
│   │   └── zustand/           # Zustand stores
│   └── public/                # Static assets
│
├── deploy.sh                   # Production deployment script
├── setup.sh                    # Development setup script
└── start.sh                    # Start dev servers
```

## 🚀 Quick Start

### **Prerequisites**

- Node.js 22.x (use NVM)
- MySQL 8.0+
- npm or yarn

### **Development Setup**

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd dev
   ```

2. **Run setup script:**

   ```bash
   ./setup.sh
   ```

   This will:

   - Install backend dependencies
   - Install frontend dependencies
   - Copy `.env.example` to `.env` (if not exists)

3. **Configure environment variables:**

   **Backend** (`backend/.env`):

   ```env
   PORT=3027
   DATABASE_URL="mysql://user:password@localhost:3306/database"
   JWT_SECRET=<generate-random-secret>
   ENCRYPTION_KEY=<generate-random-key>
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173

   # Optional: Schedulers
   ENABLE_SCHEDULER=false
   CRON_SCHEDULE=0 2 * * *
   ENABLE_MAUTIC_SCHEDULER=false
   MAUTIC_SYNC_SCHEDULE=0 3 * * *
   ```

   **Frontend** (`frontend/.env`):

   ```env
   VITE_API_URL=http://localhost:3027
   ```

4. **Setup database:**

   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate dev
   cd ..
   ```

5. **Start development servers:**
   ```bash
   ./start.sh
   ```
   - Backend: http://localhost:3027
   - Frontend: http://localhost:5173

## 📦 Features

### **User Management**

- **Multi-role hierarchy:** SuperAdmin → Manager → Employee/Telecaller
- **Authentication:** JWT-based with password hashing
- **OTP System:** Two-factor authentication
- **Activity Logging:** Comprehensive audit trail
- **RBAC:** Role-based access control

### **Client Management**

- Client CRUD operations
- Client-to-user assignments
- Role-based visibility
- Multiple client types (general, mautic, dropcowboy)

### **DropCowboy Integration**

- Ringless voicemail campaign tracking
- SFTP file sync (scheduled & manual)
- Campaign metrics & analytics
- Record-level reporting with pagination

### **Mautic Integration**

- Email marketing campaign management
- Contact synchronization
- Email statistics & reports
- Segment management

### **Notification System**

- In-app notifications
- Email notifications (via SMTP)
- Configurable notification preferences
- Scheduled reminders & reports

### **Site Customization**

- Branding (logo, favicon, title)
- Login page customization (color/gradient/image)
- Dynamic site settings

## 🔧 Development

### **Backend Development**

```bash
cd backend

# Run in development mode (nodemon)
npm run dev

# Run Prisma Studio (DB GUI)
npm run prisma:studio

# Generate Prisma client after schema changes
npm run prisma:generate

# Create migration
npm run prisma:migrate

# Run production
npm start
```

### **Frontend Development**

```bash
cd frontend

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### **Database Migrations**

```bash
cd backend

# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations in production
npx prisma migrate deploy

# Reset database (⚠️ DATA LOSS)
npx prisma migrate reset
```

## 🚢 Deployment

### **Production Deployment**

```bash
./deploy.sh
```

This script will:

1. Use Node.js 22 via NVM
2. Install backend dependencies
3. Build frontend
4. Move frontend build to `backend/dist`
5. Run Prisma migrations
6. Start backend with PM2

### **PM2 Management**

```bash
# View logs
pm2 logs simple-app

# Restart app
pm2 restart simple-app

# Stop app
pm2 stop simple-app

# Delete app from PM2
pm2 delete simple-app

# Monitor
pm2 monit
```

### **Environment-Specific Configuration**

**Production** (`backend/.env`):

```env
NODE_ENV=production
PORT=3027
DATABASE_URL="mysql://user:password@production-host:3306/prod_db?connection_limit=10"
JWT_SECRET=<strong-random-secret>
FRONTEND_URL=https://your-domain.com
ENABLE_SCHEDULER=true
ENABLE_MAUTIC_SCHEDULER=true
```

## 🔒 Security

### **Implemented Security Measures**

- ✅ JWT authentication with token versioning
- ✅ Password hashing with bcrypt (10 rounds)
- ✅ Rate limiting on API endpoints
- ✅ Helmet.js security headers
- ✅ Input validation with Zod
- ✅ SQL injection protection via Prisma
- ✅ CORS configuration
- ✅ OTP-based 2FA
- ✅ Activity logging for auditing
- ✅ Encryption for sensitive data (Mautic passwords)

### **Security Best Practices**

- Never commit `.env` files
- Rotate JWT_SECRET periodically
- Use strong DATABASE passwords
- Enable HTTPS in production
- Keep dependencies updated
- Review activity logs regularly

## 📊 API Documentation

### **Authentication**

```bash
# Register (first user becomes superadmin)
POST /api/auth/register
Body: { name, email, password }

# Login
POST /api/auth/login
Body: { email, password }

# Get current user
GET /api/auth/me
Headers: Authorization: Bearer <token>

# Change password
POST /api/auth/change-password
Headers: Authorization: Bearer <token>
Body: { oldPassword, newPassword }
```

### **Users**

```bash
# Get all users (role-based filtering)
GET /api/users
Headers: Authorization: Bearer <token>

# Create user
POST /api/users
Headers: Authorization: Bearer <token>
Body: { name, email, password, role }

# Update user
PUT /api/users/:id
Headers: Authorization: Bearer <token>
Body: { name, email, role, isActive }

# Delete user
DELETE /api/users/:id
Headers: Authorization: Bearer <token>
```

### **Clients**

```bash
# Get all clients (with pagination)
GET /api/clients?page=1&limit=50
Headers: Authorization: Bearer <token>

# Create client
POST /api/clients
Headers: Authorization: Bearer <token>
Body: { name, clientType, email, phone, ... }

# Assign client to user
POST /api/clients/:id/assign
Headers: Authorization: Bearer <token>
Body: { userId }
```

### **Health Check**

```bash
# Check API health
GET /api/health

Response:
{
  "uptime": 12345.67,
  "timestamp": 1701619200000,
  "status": "OK",
  "checks": {
    "database": { "status": "OK", "responseTime": "5ms" },
    "memory": { "heapUsed": "50MB", "status": "OK" }
  },
  "system": {
    "platform": "darwin",
    "nodeVersion": "v22.20.0",
    "environment": "production"
  }
}
```

## 🐛 Troubleshooting

### **Common Issues**

**Database Connection Fails:**

```bash
# Check MySQL is running
mysql -u user -p

# Verify DATABASE_URL in .env
# Check firewall/network settings
```

**Frontend Can't Reach Backend:**

```bash
# Verify backend is running on port 3027
# Check VITE_API_URL in frontend/.env
# Check CORS configuration in backend/app.js
```

**Prisma Client Out of Sync:**

```bash
cd backend
npm run prisma:generate
```

**PM2 App Won't Start:**

```bash
# Check logs
pm2 logs simple-app --lines 100

# Verify Node 22 is active
nvm use 22
node --version

# Check cwd in ecosystem.config.cjs
```

## 🧪 Testing

Currently, no automated tests are implemented. **Recommended:**

```bash
# Install testing dependencies
npm install --save-dev jest supertest @testing-library/react vitest

# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📝 Code Quality

### **Linting**

```bash
# Frontend
cd frontend
npm run lint

# Backend (setup ESLint)
cd backend
npx eslint .
```

### **Logging**

All logging uses Winston (`backend/utils/logger.js`):

```javascript
import logger from "./utils/logger.js";

logger.info("Operation successful", { userId: 123 });
logger.error("Operation failed", { error: error.message });
logger.warn("Deprecated feature used");
```

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## 📄 License

Proprietary - All rights reserved

## 🔗 Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)

---

**Need Help?** Contact the development team or check the logs in `backend/logs/`.
