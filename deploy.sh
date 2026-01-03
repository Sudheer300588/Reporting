#!/bin/bash
# DigitalBevy Deployment Script (Hardened)
# - Same-domain deployment: frontend at https://dev.abc.com, API at https://dev.abc.com/api
# - Supports MySQL + PostgreSQL (selects Prisma schema via --schema; NO file-copy)
# - Interactive wizard + --quick mode
# - Safer defaults: set -euo pipefail, mktemp, npm ci, migrate deploy (fallback to db push)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Configuration variables
DB_PROVIDER=""
DATABASE_URL=""
APP_PORT=""
SITE_URL=""
JWT_SECRET=""
ENCRYPTION_KEY=""
MAUTIC_SYNC_SCHEDULE=""
DROPCOWBOY_SYNC_SCHEDULE=""
ENABLE_SCHEDULER=""
SUPERADMIN_NAME=""
SUPERADMIN_EMAIL=""
SUPERADMIN_PASSWORD=""
PRISMA_SCHEMA=""

print_header() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC} ${CYAN}$1${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step()    { echo -e "${YELLOW}➤ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }
print_info()    { echo -e "${CYAN}ℹ $1${NC}"; }

# Load NVM if available
load_node() {
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  fi
}

check_prerequisites() {
  print_header "Checking Prerequisites"

  local missing=0

  if command -v node &>/dev/null; then
    print_success "Node.js $(node -v) installed"
  else
    print_error "Node.js not found"
    missing=1
  fi

  if command -v npm &>/dev/null; then
    print_success "npm $(npm -v) installed"
  else
    print_error "npm not found"
    missing=1
  fi

  if command -v openssl &>/dev/null; then
    print_success "openssl available"
  else
    print_warning "openssl not found (auto key-gen will fail; you can still input keys manually)"
  fi

  if command -v pm2 &>/dev/null; then
    print_success "PM2 $(pm2 -v) installed"
  else
    print_warning "PM2 not found (will install globally)"
  fi

  if [ "$missing" -eq 1 ]; then
    print_error "Missing required prerequisites. Install them and retry."
    exit 1
  fi
}

# Determine Prisma schema file based on DB_PROVIDER
set_prisma_schema() {
  if [ "$DB_PROVIDER" == "mysql" ]; then
    PRISMA_SCHEMA="$BACKEND_DIR/prisma/schema.mysql.prisma"
  else
    PRISMA_SCHEMA="$BACKEND_DIR/prisma/schema.postgres.prisma"
  fi

  if [ ! -f "$PRISMA_SCHEMA" ]; then
    print_error "Prisma schema file not found: $PRISMA_SCHEMA"
    exit 1
  fi

  print_success "Using Prisma schema: $(basename "$PRISMA_SCHEMA")"
}

# Safer DB URL: warn if password likely breaks URL parsing
warn_db_password_chars() {
  local pass="$1"
  if echo "$pass" | grep -qE '[@:/#?&]'; then
    print_warning "Your DB password contains special URL characters (@ : / # ? &)."
    print_warning "This can break DATABASE_URL parsing unless URL-encoded."
    print_warning "If connection fails, URL-encode the password (recommended)."
  fi
}

collect_config() {
  print_header "Step 1: Database Configuration"

  echo "Select database provider:"
  echo "  1) MySQL (recommended for production)"
  echo "  2) PostgreSQL"
  read -r -p "Enter choice [1-2]: " db_choice

  case $db_choice in
    1) DB_PROVIDER="mysql" ;;
    2) DB_PROVIDER="postgres" ;;
    *) print_error "Invalid choice"; exit 1 ;;
  esac
  print_success "Database provider: $DB_PROVIDER"
  echo ""

  if [ "$DB_PROVIDER" == "mysql" ]; then
    echo ""
    echo -e "${CYAN}Examples: localhost, 192.168.1.100, db.myserver.com${NC}"
    read -r -p "MySQL Host [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}

    read -r -p "MySQL Port [3306]: " DB_PORT
    DB_PORT=${DB_PORT:-3306}

    echo -e "${CYAN}Example: digitalbevy_db${NC}"
    read -r -p "MySQL Database name: " DB_NAME

    echo -e "${CYAN}Example: db_user${NC}"
    read -r -p "MySQL Username: " DB_USER

    read -r -s -p "MySQL Password: " DB_PASS
    echo ""
    warn_db_password_chars "$DB_PASS"

    DATABASE_URL="mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  else
    echo ""
    echo -e "${CYAN}Examples: localhost, 192.168.1.100, db.myserver.com${NC}"
    read -r -p "PostgreSQL Host [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}

    read -r -p "PostgreSQL Port [5432]: " DB_PORT
    DB_PORT=${DB_PORT:-5432}

    echo -e "${CYAN}Example: digitalbevy_db${NC}"
    read -r -p "PostgreSQL Database name: " DB_NAME

    echo -e "${CYAN}Example: db_user${NC}"
    read -r -p "PostgreSQL Username: " DB_USER

    read -r -s -p "PostgreSQL Password: " DB_PASS
    echo ""
    warn_db_password_chars "$DB_PASS"

    DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  fi
  print_success "Database connection configured"

  print_header "Step 2: Application Settings"

  echo -e "${CYAN}Public URL where users will access the application.${NC}"
  echo -e "${CYAN}Examples: https://crm.mycompany.com, https://app.example.com, http://192.168.1.100:3026${NC}"
  read -r -p "Website URL: " SITE_URL
  if [ -z "$SITE_URL" ]; then
    print_error "Website URL is required"
    exit 1
  fi
  SITE_URL="${SITE_URL%/}"
  print_success "Website URL: $SITE_URL"
  echo ""

  echo -e "${CYAN}Port your Node app will listen on. Common ports: 3000, 3026, 8080${NC}"
  echo -e "${CYAN}(Reverse proxy can still expose 80/443 externally)${NC}"
  read -r -p "Application port [3026]: " APP_PORT
  APP_PORT=${APP_PORT:-3026}
  print_success "Application port: $APP_PORT"
  echo ""

  read -r -p "Generate new JWT secret? [Y/n]: " gen_jwt
  if [ "${gen_jwt:-Y}" != "n" ] && [ "${gen_jwt:-Y}" != "N" ]; then
    if command -v openssl &>/dev/null; then
      JWT_SECRET="$(openssl rand -hex 32)"
      print_success "Generated new JWT secret"
    else
      print_warning "openssl missing; please enter JWT secret manually"
      read -r -s -p "Enter JWT secret: " JWT_SECRET
      echo ""
    fi
  else
    read -r -s -p "Enter existing JWT secret: " JWT_SECRET
    echo ""
  fi

  read -r -p "Generate new encryption key? [Y/n]: " gen_enc
  if [ "${gen_enc:-Y}" != "n" ] && [ "${gen_enc:-Y}" != "N" ]; then
    if command -v openssl &>/dev/null; then
      ENCRYPTION_KEY="$(openssl rand -hex 32)"
      print_success "Generated new encryption key"
    else
      print_warning "openssl missing; please enter ENCRYPTION_KEY manually"
      read -r -s -p "Enter encryption key: " ENCRYPTION_KEY
      echo ""
    fi
  else
    read -r -s -p "Enter existing encryption key: " ENCRYPTION_KEY
    echo ""
  fi

  print_header "Step 3: Super Admin Account"
  echo "Create the initial super admin account for system access."
  echo "This will be the first user with full administrative privileges."
  echo ""

  echo -e "${CYAN}Example: John Smith, Admin User${NC}"
  read -r -p "Super Admin Name [Super Admin]: " SUPERADMIN_NAME
  SUPERADMIN_NAME=${SUPERADMIN_NAME:-"Super Admin"}

  while true; do
    echo -e "${CYAN}Example: admin@yourcompany.com, john@example.com${NC}"
    read -r -p "Super Admin Email: " SUPERADMIN_EMAIL
    if [ -z "$SUPERADMIN_EMAIL" ]; then
      print_error "Email is required"
    elif [[ ! "$SUPERADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
      print_error "Please enter a valid email address"
    else
      break
    fi
  done

  while true; do
    echo -e "${CYAN}Choose a strong password (letters, numbers, symbols recommended)${NC}"
    read -r -s -p "Super Admin Password (min 8 chars): " SUPERADMIN_PASSWORD
    echo ""
    if [ "${#SUPERADMIN_PASSWORD}" -lt 8 ]; then
      print_error "Password must be at least 8 characters"
      continue
    fi
    read -r -s -p "Confirm Password: " password_confirm
    echo ""
    if [ "$SUPERADMIN_PASSWORD" != "$password_confirm" ]; then
      print_error "Passwords do not match"
    else
      break
    fi
  done
  print_success "Super Admin configured"

  print_header "Step 4: Scheduler Configuration"
  echo "Configure automatic data sync schedules."
  echo "Schedulers automatically sync data from Mautic and DropCowboy at specified times."
  echo ""

  read -r -p "Enable automatic schedulers? [Y/n]: " enable_sched
  if [ "${enable_sched:-Y}" != "n" ] && [ "${enable_sched:-Y}" != "N" ]; then
    ENABLE_SCHEDULER="true"

    echo ""
    echo -e "${CYAN}Cron format: minute hour day month weekday${NC}"
    echo -e "${CYAN}Examples:${NC}"
    echo -e "${CYAN}  0 3 * * *   = Every day at 3:00 AM${NC}"
    echo -e "${CYAN}  0 */6 * * * = Every 6 hours${NC}"
    echo -e "${CYAN}  0 2 * * 0   = Every Sunday at 2:00 AM${NC}"
    echo ""

    read -r -p "Mautic sync schedule [0 3 * * *]: " MAUTIC_SYNC_SCHEDULE
    MAUTIC_SYNC_SCHEDULE=${MAUTIC_SYNC_SCHEDULE:-"0 3 * * *"}

    read -r -p "DropCowboy sync schedule [0 4 * * *]: " DROPCOWBOY_SYNC_SCHEDULE
    DROPCOWBOY_SYNC_SCHEDULE=${DROPCOWBOY_SYNC_SCHEDULE:-"0 4 * * *"}

    print_success "Schedulers enabled"
  else
    ENABLE_SCHEDULER="false"
    MAUTIC_SYNC_SCHEDULE="0 3 * * *"
    DROPCOWBOY_SYNC_SCHEDULE="0 4 * * *"
    print_info "Schedulers disabled (you can sync manually from the dashboard)"
  fi

  print_header "Configuration Summary"
  echo -e "${CYAN}Database:${NC}"
  echo "  Provider: $DB_PROVIDER"
  echo "  Host: $DB_HOST:$DB_PORT"
  echo "  Database: $DB_NAME"
  echo ""
  echo -e "${CYAN}Application:${NC}"
  echo "  URL: $SITE_URL"
  echo "  Port: $APP_PORT"
  echo ""
  echo -e "${CYAN}Super Admin:${NC}"
  echo "  Name: $SUPERADMIN_NAME"
  echo "  Email: $SUPERADMIN_EMAIL"
  echo ""
  echo -e "${CYAN}Schedulers:${NC}"
  echo "  Enabled: $ENABLE_SCHEDULER"
  if [ "$ENABLE_SCHEDULER" == "true" ]; then
    echo "  Mautic: $MAUTIC_SYNC_SCHEDULE"
    echo "  DropCowboy: $DROPCOWBOY_SYNC_SCHEDULE"
  fi
  echo ""

  read -r -p "Proceed with this configuration? [Y/n]: " confirm
  if [ "${confirm:-Y}" == "n" ] || [ "${confirm:-Y}" == "N" ]; then
    print_error "Deployment cancelled."
    exit 1
  fi

  set_prisma_schema
}

create_env_file() {
  print_header "Creating Environment Configuration"

  local ENV_FILE="$BACKEND_DIR/.env"

  if [ -f "$ENV_FILE" ]; then
    local BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
    mv "$ENV_FILE" "$BACKUP_FILE"
    print_warning "Existing .env backed up to: $BACKUP_FILE"
  fi

  cat >"$ENV_FILE" <<EOF
# DigitalBevy Environment Configuration
# Generated on $(date)

PORT=$APP_PORT
NODE_ENV=production

# Database
DATABASE_URL="$DATABASE_URL"

# Security
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# URLs
FRONTEND_URL=$SITE_URL

# Scheduler
ENABLE_SCHEDULER=$ENABLE_SCHEDULER
ENABLE_MAUTIC_SCHEDULER=$ENABLE_SCHEDULER
ENABLE_DROPCOWBOY_SCHEDULER=$ENABLE_SCHEDULER
MAUTIC_SYNC_SCHEDULE=$MAUTIC_SYNC_SCHEDULE
DROPCOWBOY_SYNC_SCHEDULE=$DROPCOWBOY_SYNC_SCHEDULE
CRON_SCHEDULE=0 2 * * *

# Mautic Sync Settings
MAUTIC_HISTORICAL_MONTHS=12
MAUTIC_CONCURRENT_SYNCS=5
EOF

  print_success "Environment file created at $ENV_FILE"
}

install_dependencies() {
  print_header "Installing Dependencies"

  print_step "Installing backend dependencies..."
  cd "$BACKEND_DIR"
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  print_success "Backend dependencies installed"

  print_step "Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  print_success "Frontend dependencies installed"

  # Install PM2 globally if not present
  if ! command -v pm2 &>/dev/null; then
    print_step "Installing PM2 globally..."
    npm install -g pm2
    print_success "PM2 installed"
  fi
}

build_frontend() {
  print_header "Building Frontend"

  cd "$FRONTEND_DIR"

  # Same-domain deployment: API is /api (relative)
  echo "VITE_API_URL=/api" > .env.production

  npm run build
  print_success "Frontend built successfully"

  # Copy build to backend/dist
  if [ -d "$BACKEND_DIR/dist" ]; then
    rm -rf "$BACKEND_DIR/dist"
  fi

  # Vite outputs to ./dist by default
  mv dist "$BACKEND_DIR/"
  print_success "Frontend moved to backend/dist"
}

# Generate Prisma client and validate DB connectivity
validate_db_connection() {
  print_header "Validating Database Connection"

  cd "$BACKEND_DIR"

  print_step "Generating Prisma client..."
  npx prisma generate --schema "$PRISMA_SCHEMA" >/dev/null
  print_success "Prisma client generated"

  print_step "Testing database connection..."
  
  # Create test script in backend directory with .cjs extension for CommonJS compatibility
  local tmpfile="$BACKEND_DIR/db-connection-test.cjs"

  cat >"$tmpfile" <<'TESTEOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$connect();
    console.log('SUCCESS');
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('FAILED');
    console.error('Error:', e?.message || e);
    if (e?.code) console.error('Code:', e.code);
    process.exit(1);
  }
})();
TESTEOF

  local test_output
  test_output=$(cd "$BACKEND_DIR" && node db-connection-test.cjs 2>&1)
  
  # Clean up test file
  rm -f "$tmpfile"
  
  if echo "$test_output" | grep -q "SUCCESS"; then
    print_success "Database connection successful"
    return 0
  else
    print_error "Database connection failed"
    echo ""
    echo -e "${YELLOW}Error details:${NC}"
    echo "$test_output" | grep -v "^$" | head -10
    echo ""
    
    echo -e "${CYAN}Common fixes:${NC}"
    echo "  1. Password has special chars? URL-encode them or use simpler password"
    echo "  2. Check: mysql -h ${DB_HOST:-your_host} -P ${DB_PORT:-3306} -u ${DB_USER:-your_user} -p ${DB_NAME:-your_db}"
    echo ""
    
    read -r -p "Continue anyway? [y/N]: " continue_anyway
    if [ "${continue_anyway:-N}" != "y" ] && [ "${continue_anyway:-N}" != "Y" ]; then
      print_error "Deployment aborted. Fix database connection and retry."
      exit 1
    fi
    print_warning "Continuing with unverified database connection..."
    return 1
  fi
}

apply_database_schema() {
  print_header "Applying Database Schema"

  cd "$BACKEND_DIR"

  # Check if migrations folder exists with migration files
  if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
    print_step "Found migrations, running prisma migrate deploy..."
    if npx prisma migrate deploy --schema "$PRISMA_SCHEMA" 2>/dev/null; then
      print_success "Migrations applied successfully"
    else
      print_warning "migrate deploy failed, falling back to db push..."
      npx prisma db push --schema "$PRISMA_SCHEMA" --accept-data-loss
      print_success "Schema pushed (db push fallback)"
    fi
  else
    print_step "No migrations found, using db push..."
    npx prisma db push --schema "$PRISMA_SCHEMA"
    print_success "Database schema synchronized"
  fi

  # Seed notification templates if script exists
  if [ -f "prisma/seed-notifications.js" ]; then
    print_step "Seeding notification templates..."
    cd prisma
    node seed-notifications.js
    cd ..
    print_success "Notification templates seeded"
  fi
}

create_superadmin_if_needed() {
  print_header "Creating Super Admin Account"

  cd "$BACKEND_DIR"

  if [ -z "$SUPERADMIN_EMAIL" ] || [ -z "$SUPERADMIN_PASSWORD" ]; then
    print_info "Skipping Super Admin creation (no credentials provided)"
    return 0
  fi

  # Export for the seed script
  export SUPERADMIN_NAME
  export SUPERADMIN_EMAIL
  export SUPERADMIN_PASSWORD
  export PRISMA_SCHEMA

  if [ -f "prisma/seed-superadmin.js" ]; then
    print_step "Creating Super Admin account..."
    cd prisma
    if node seed-superadmin.js; then
      print_success "Super Admin account ready"
    else
      print_warning "Super Admin creation returned non-zero (may already exist)"
    fi
    cd ..
  else
    print_warning "seed-superadmin.js not found, skipping Super Admin creation"
  fi
}

start_application() {
  print_header "Starting Application"

  cd "$BACKEND_DIR"

  # Stop existing PM2 processes
  pm2 delete digitalbevy 2>/dev/null || true

  # Create PM2 ecosystem file
  cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'digitalbevy',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    max_memory_restart: '1G',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true
  }]
};
EOF

  # Create logs directory
  mkdir -p logs

  # Start with PM2
  print_step "Starting application with PM2..."
  pm2 start ecosystem.config.js
  pm2 save

  print_success "Application started!"
  echo ""
  pm2 status
}

print_summary() {
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                                                   ║${NC}"
  echo -e "${GREEN}║     ${CYAN}Deployment Complete!${GREEN}                                       ║${NC}"
  echo -e "${GREEN}║                                                                   ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${CYAN}Access Your Application:${NC}"
  echo "  Frontend: $SITE_URL"
  echo "  API:      $SITE_URL/api"
  echo ""
  if [ -n "$SUPERADMIN_EMAIL" ]; then
    print_info "Your Super Admin login credentials:"
    echo "  Email:    $SUPERADMIN_EMAIL"
    echo "  Password: [the password you entered during setup]"
    echo ""
  fi
  echo -e "${CYAN}Useful Commands:${NC}"
  echo "  pm2 status              - Check application status"
  echo "  pm2 logs digitalbevy    - View application logs"
  echo "  pm2 restart all         - Restart application"
  echo "  pm2 stop all            - Stop application"
  echo ""
  echo -e "${CYAN}Configuration Files:${NC}"
  echo "  Environment: $BACKEND_DIR/.env"
  echo "  PM2 Config:  $BACKEND_DIR/ecosystem.config.js"
  echo ""
}

# Quick deploy mode (non-interactive, uses existing .env)
quick_deploy() {
  print_header "Quick Deploy Mode"

  if [ ! -f "$BACKEND_DIR/.env" ]; then
    print_error "No .env file found. Run without --quick for interactive setup."
    exit 1
  fi

  # Determine DB provider from .env (only match uncommented DATABASE_URL= lines)
  local DB_URL
  DB_URL=$(grep "^DATABASE_URL=" "$BACKEND_DIR/.env" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if echo "$DB_URL" | grep -qE "^mysql://"; then
    DB_PROVIDER="mysql"
  elif echo "$DB_URL" | grep -qE "^(postgres|postgresql)://"; then
    DB_PROVIDER="postgres"
  else
    print_error "Could not determine database provider from DATABASE_URL"
    print_info "Expected format: mysql://... or postgresql://..."
    exit 1
  fi

  # Get PORT from .env if available
  APP_PORT=$(grep "^PORT=" "$BACKEND_DIR/.env" | head -1 | cut -d'=' -f2 | tr -d ' ')
  APP_PORT=${APP_PORT:-3026}

  # Get FRONTEND_URL from .env if available
  SITE_URL=$(grep "^FRONTEND_URL=" "$BACKEND_DIR/.env" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  SITE_URL=${SITE_URL:-"http://localhost:$APP_PORT"}

  print_info "Using existing .env configuration"
  print_info "Database provider: $DB_PROVIDER"
  print_info "Port: $APP_PORT"

  set_prisma_schema
  load_node
  check_prerequisites
  install_dependencies
  validate_db_connection || true
  build_frontend
  apply_database_schema
  start_application

  echo ""
  print_success "Quick deployment complete!"
  echo ""
  echo -e "${CYAN}Access Your Application:${NC}"
  echo "  Frontend: $SITE_URL"
  echo "  API:      $SITE_URL/api"
  echo ""
}

show_help() {
  echo ""
  echo -e "${CYAN}DigitalBevy Deployment Script (Hardened)${NC}"
  echo ""
  echo "Usage: ./deploy.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -h, --help    Show this help message"
  echo "  -q, --quick   Quick deploy using existing backend/.env"
  echo ""
  echo "Interactive Mode (default):"
  echo "  Step 1: Database configuration (MySQL/PostgreSQL)"
  echo "  Step 2: Application settings (URL, Port, Security Keys)"
  echo "  Step 3: Super Admin account creation"
  echo "  Step 4: Scheduler configuration (Mautic, DropCowboy)"
  echo ""
  echo "Notes:"
  echo "  - Frontend uses VITE_API_URL=/api (same domain deployment)."
  echo "  - Prisma uses --schema flag (no schema.prisma copying)."
  echo "  - Production prefers 'migrate deploy' if migrations exist;"
  echo "    otherwise falls back to 'db push'."
  echo ""
  exit 0
}

main() {
  clear || true
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║     ${GREEN}DigitalBevy Deployment Script (Hardened)${CYAN}                      ║${NC}"
  echo -e "${CYAN}║     Same-domain: frontend '/', API '/api'                         ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  read -r -p "Press Enter to start deployment wizard..."

  load_node
  check_prerequisites
  collect_config
  create_env_file
  install_dependencies
  validate_db_connection || true
  build_frontend
  apply_database_schema
  create_superadmin_if_needed
  start_application
  print_summary
}

# Handle command line arguments
case "${1:-}" in
  -h|--help)
    show_help
    ;;
  -q|--quick)
    quick_deploy
    ;;
  *)
    main "$@"
    ;;
esac
