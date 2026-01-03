#!/bin/bash

# DigitalBevy Deployment Script
# Interactive deployment script for DigitalBevy platform
# Supports both MySQL and PostgreSQL databases
# Version: 2.0.0 - Full Interactive Configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Configuration variables (will be set during interactive prompts)
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

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}$1${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${YELLOW}➤ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# Load NVM if available
load_node() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
}

# Test database connectivity
test_db_connection() {
    print_step "Testing database connection..."
    
    cd "$BACKEND_DIR"
    
    # Create a temporary test script
    cat > /tmp/test_db_connection.js << 'TESTEOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$connect();
        console.log('SUCCESS');
        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error('FAILED:', error.message);
        process.exit(1);
    }
}

main();
TESTEOF

    # Run the test (requires prisma client to be generated first)
    if node /tmp/test_db_connection.js 2>&1 | grep -q "SUCCESS"; then
        print_success "Database connection successful"
        rm -f /tmp/test_db_connection.js
        return 0
    else
        print_error "Database connection failed"
        print_info "Please check your database credentials and ensure the server is running"
        rm -f /tmp/test_db_connection.js
        return 1
    fi
}

# Validate database connection before proceeding
validate_db_connection() {
    print_header "Validating Database Connection"
    
    cd "$BACKEND_DIR"
    
    # First generate prisma client
    print_step "Generating Prisma client for connection test..."
    if ! npx prisma generate 2>&1; then
        print_error "Failed to generate Prisma client"
        exit 1
    fi
    
    # Test connection
    if ! test_db_connection; then
        echo ""
        read -p "Continue anyway? [y/N]: " continue_anyway
        if [ "$continue_anyway" != "y" ] && [ "$continue_anyway" != "Y" ]; then
            print_error "Deployment aborted. Please fix database connection and try again."
            exit 1
        fi
        print_warning "Continuing with unverified database connection..."
    fi
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local missing=0
    
    # Check Node.js
    if command -v node &> /dev/null; then
        print_success "Node.js $(node -v) installed"
    else
        print_error "Node.js not found"
        missing=1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        print_success "npm $(npm -v) installed"
    else
        print_error "npm not found"
        missing=1
    fi
    
    # Check PM2 (optional but recommended for production)
    if command -v pm2 &> /dev/null; then
        print_success "PM2 $(pm2 -v) installed"
    else
        print_warning "PM2 not found (will install if needed)"
    fi
    
    if [ $missing -eq 1 ]; then
        print_error "Missing required prerequisites. Please install them and try again."
        exit 1
    fi
}

# Collect deployment configuration
collect_config() {
    print_header "Step 1: Database Configuration"
    
    # Database provider
    echo "Select database provider:"
    echo "  1) MySQL (recommended for production)"
    echo "  2) PostgreSQL"
    read -p "Enter choice [1-2]: " db_choice
    
    case $db_choice in
        1) DB_PROVIDER="mysql" ;;
        2) DB_PROVIDER="postgres" ;;
        *) 
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    print_success "Database provider: $DB_PROVIDER"
    echo ""
    
    # Database connection
    if [ "$DB_PROVIDER" == "mysql" ]; then
        echo ""
        echo -e "${CYAN}Examples: localhost, 192.168.1.100, db.myserver.com${NC}"
        read -p "MySQL Host [localhost]: " DB_HOST
        DB_HOST=${DB_HOST:-localhost}
        
        read -p "MySQL Port [3306]: " DB_PORT
        DB_PORT=${DB_PORT:-3306}
        
        echo -e "${CYAN}Example: digitalbevy_db${NC}"
        read -p "MySQL Database name: " DB_NAME
        
        echo -e "${CYAN}Example: db_user${NC}"
        read -p "MySQL Username: " DB_USER
        
        read -sp "MySQL Password: " DB_PASS
        echo ""
        
        DATABASE_URL="mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    else
        echo ""
        echo -e "${CYAN}Examples: localhost, 192.168.1.100, db.myserver.com${NC}"
        read -p "PostgreSQL Host [localhost]: " DB_HOST
        DB_HOST=${DB_HOST:-localhost}
        
        read -p "PostgreSQL Port [5432]: " DB_PORT
        DB_PORT=${DB_PORT:-5432}
        
        echo -e "${CYAN}Example: digitalbevy_db${NC}"
        read -p "PostgreSQL Database name: " DB_NAME
        
        echo -e "${CYAN}Example: db_user${NC}"
        read -p "PostgreSQL Username: " DB_USER
        
        read -sp "PostgreSQL Password: " DB_PASS
        echo ""
        
        DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    fi
    print_success "Database connection configured"
    
    print_header "Step 2: Application Settings"
    
    # Website URL
    echo -e "${CYAN}This is the public URL where users will access your application.${NC}"
    echo -e "${CYAN}Examples: https://crm.mycompany.com, https://app.example.com, http://192.168.1.100:3026${NC}"
    read -p "Website URL: " SITE_URL
    if [ -z "$SITE_URL" ]; then
        print_error "Website URL is required"
        exit 1
    fi
    # Remove trailing slash if present
    SITE_URL="${SITE_URL%/}"
    print_success "Website URL: $SITE_URL"
    echo ""
    
    # Application port
    echo -e "${CYAN}The port your application will run on. Common ports: 3000, 3026, 8080${NC}"
    read -p "Application port [3026]: " APP_PORT
    APP_PORT=${APP_PORT:-3026}
    print_success "Application port: $APP_PORT"
    echo ""
    
    # JWT Secret
    read -p "Generate new JWT secret? [Y/n]: " gen_jwt
    if [ "$gen_jwt" != "n" ] && [ "$gen_jwt" != "N" ]; then
        JWT_SECRET=$(openssl rand -hex 32)
        print_success "Generated new JWT secret"
    else
        read -sp "Enter existing JWT secret: " JWT_SECRET
        echo ""
    fi
    
    # Encryption key
    read -p "Generate new encryption key? [Y/n]: " gen_enc
    if [ "$gen_enc" != "n" ] && [ "$gen_enc" != "N" ]; then
        ENCRYPTION_KEY=$(openssl rand -hex 32)
        print_success "Generated new encryption key"
    else
        read -sp "Enter existing encryption key: " ENCRYPTION_KEY
        echo ""
    fi
    
    print_header "Step 3: Super Admin Account"
    echo "Create the initial super admin account for system access."
    echo "This will be the first user with full administrative privileges."
    echo ""
    
    echo -e "${CYAN}Example: John Smith, Admin User${NC}"
    read -p "Super Admin Name [Super Admin]: " SUPERADMIN_NAME
    SUPERADMIN_NAME=${SUPERADMIN_NAME:-"Super Admin"}
    
    while true; do
        echo -e "${CYAN}Example: admin@yourcompany.com, john@example.com${NC}"
        read -p "Super Admin Email: " SUPERADMIN_EMAIL
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
        read -sp "Super Admin Password (min 8 characters): " SUPERADMIN_PASSWORD
        echo ""
        if [ ${#SUPERADMIN_PASSWORD} -lt 8 ]; then
            print_error "Password must be at least 8 characters"
        else
            read -sp "Confirm Password: " password_confirm
            echo ""
            if [ "$SUPERADMIN_PASSWORD" != "$password_confirm" ]; then
                print_error "Passwords do not match"
            else
                break
            fi
        fi
    done
    print_success "Super Admin account configured"
    
    print_header "Step 4: Scheduler Configuration"
    echo "Configure automatic data sync schedules."
    echo "Schedulers automatically sync data from Mautic and DropCowboy at specified times."
    echo ""
    
    read -p "Enable automatic schedulers? [Y/n]: " enable_sched
    if [ "$enable_sched" != "n" ] && [ "$enable_sched" != "N" ]; then
        ENABLE_SCHEDULER="true"
        
        echo ""
        echo -e "${CYAN}Cron format: minute hour day month weekday${NC}"
        echo -e "${CYAN}Examples:${NC}"
        echo -e "${CYAN}  0 3 * * *   = Every day at 3:00 AM${NC}"
        echo -e "${CYAN}  0 */6 * * * = Every 6 hours${NC}"
        echo -e "${CYAN}  0 2 * * 0   = Every Sunday at 2:00 AM${NC}"
        echo ""
        
        read -p "Mautic sync schedule [0 3 * * *] (3 AM daily): " MAUTIC_SYNC_SCHEDULE
        MAUTIC_SYNC_SCHEDULE=${MAUTIC_SYNC_SCHEDULE:-"0 3 * * *"}
        
        read -p "DropCowboy sync schedule [0 4 * * *] (4 AM daily): " DROPCOWBOY_SYNC_SCHEDULE
        DROPCOWBOY_SYNC_SCHEDULE=${DROPCOWBOY_SYNC_SCHEDULE:-"0 4 * * *"}
        
        print_success "Schedulers enabled"
    else
        ENABLE_SCHEDULER="false"
        MAUTIC_SYNC_SCHEDULE="0 3 * * *"
        DROPCOWBOY_SYNC_SCHEDULE="0 4 * * *"
        print_info "Schedulers disabled (you can sync manually from the dashboard)"
    fi
    
    # Display configuration summary
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
    echo -e "${CYAN}Security:${NC}"
    echo "  JWT Secret: [generated/provided]"
    echo "  Encryption Key: [generated/provided]"
    echo ""
    echo -e "${CYAN}Super Admin:${NC}"
    echo "  Name: $SUPERADMIN_NAME"
    echo "  Email: $SUPERADMIN_EMAIL"
    echo "  Password: ********"
    echo ""
    echo -e "${CYAN}Schedulers:${NC}"
    echo "  Enabled: $ENABLE_SCHEDULER"
    if [ "$ENABLE_SCHEDULER" == "true" ]; then
        echo "  Mautic: $MAUTIC_SYNC_SCHEDULE"
        echo "  DropCowboy: $DROPCOWBOY_SYNC_SCHEDULE"
    fi
    echo ""
    
    read -p "Proceed with this configuration? [Y/n]: " confirm
    if [ "$confirm" == "n" ] || [ "$confirm" == "N" ]; then
        print_error "Deployment cancelled. Run script again to reconfigure."
        exit 1
    fi
}

# Create environment file
create_env_file() {
    print_header "Creating Environment Configuration"
    
    ENV_FILE="$BACKEND_DIR/.env"
    
    # Backup existing .env if it exists
    if [ -f "$ENV_FILE" ]; then
        BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
        mv "$ENV_FILE" "$BACKUP_FILE"
        print_warning "Existing .env backed up to: $BACKUP_FILE"
    fi
    
    cat > "$ENV_FILE" << EOF
# ╔═══════════════════════════════════════════════════════════════════╗
# ║ DigitalBevy Environment Configuration                             ║
# ║ Generated on $(date)
# ╚═══════════════════════════════════════════════════════════════════╝

# ─────────────────────────────────────────────────────────────────────
# Server Configuration
# ─────────────────────────────────────────────────────────────────────
PORT=$APP_PORT
NODE_ENV=production

# ─────────────────────────────────────────────────────────────────────
# Database Configuration
# Provider: $DB_PROVIDER
# ─────────────────────────────────────────────────────────────────────
DATABASE_URL="$DATABASE_URL"

# ─────────────────────────────────────────────────────────────────────
# Security Keys (do not share or commit to version control)
# ─────────────────────────────────────────────────────────────────────
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# ─────────────────────────────────────────────────────────────────────
# Application URLs
# ─────────────────────────────────────────────────────────────────────
FRONTEND_URL=$SITE_URL

# ─────────────────────────────────────────────────────────────────────
# Scheduler Configuration (cron format)
# ─────────────────────────────────────────────────────────────────────
ENABLE_SCHEDULER=$ENABLE_SCHEDULER
ENABLE_MAUTIC_SCHEDULER=$ENABLE_SCHEDULER
ENABLE_DROPCOWBOY_SCHEDULER=$ENABLE_SCHEDULER
MAUTIC_SYNC_SCHEDULE=$MAUTIC_SYNC_SCHEDULE
DROPCOWBOY_SYNC_SCHEDULE=$DROPCOWBOY_SYNC_SCHEDULE
CRON_SCHEDULE=0 2 * * *

# ─────────────────────────────────────────────────────────────────────
# Mautic Sync Settings
# ─────────────────────────────────────────────────────────────────────
MAUTIC_HISTORICAL_MONTHS=12
MAUTIC_CONCURRENT_SYNCS=5
EOF

    print_success "Environment file created at $ENV_FILE"
    print_info "You can edit this file later to add additional settings"
}

# Switch database provider
switch_database() {
    print_header "Configuring Database Provider"
    
    cd "$BACKEND_DIR"
    
    if [ "$DB_PROVIDER" == "mysql" ]; then
        if [ -f "prisma/schema.mysql.prisma" ]; then
            cp prisma/schema.mysql.prisma prisma/schema.prisma
            print_success "Switched to MySQL schema"
        else
            print_error "MySQL schema not found"
            exit 1
        fi
    else
        if [ -f "prisma/schema.postgres.prisma" ]; then
            cp prisma/schema.postgres.prisma prisma/schema.prisma
            print_success "Switched to PostgreSQL schema"
        fi
    fi
}

# Install dependencies
install_dependencies() {
    print_header "Installing Dependencies"
    
    print_step "Installing backend dependencies..."
    cd "$BACKEND_DIR"
    npm install
    print_success "Backend dependencies installed"
    
    print_step "Installing frontend dependencies..."
    cd "$FRONTEND_DIR"
    npm install
    print_success "Frontend dependencies installed"
}

# Build frontend
build_frontend() {
    print_header "Building Frontend"
    
    cd "$FRONTEND_DIR"
    
    # Create .env for frontend build
    echo "VITE_API_URL=" > .env.production
    
    npm run build
    print_success "Frontend built successfully"
    
    # Copy build to backend dist
    if [ -d "$BACKEND_DIR/dist" ]; then
        rm -rf "$BACKEND_DIR/dist"
    fi
    mv dist "$BACKEND_DIR/"
    print_success "Frontend moved to backend/dist"
}

# Setup database
setup_database() {
    print_header "Setting Up Database"
    
    cd "$BACKEND_DIR"
    
    print_step "Generating Prisma client..."
    npx prisma generate
    print_success "Prisma client generated"
    
    print_step "Pushing schema to database..."
    npx prisma db push
    print_success "Database schema synchronized"
    
    # Seed notification templates
    print_step "Seeding notification templates..."
    if [ -f "prisma/seed-notifications.js" ]; then
        cd prisma
        node seed-notifications.js
        cd ..
        print_success "Notification templates seeded"
    fi
    
    # Create super admin account
    print_step "Creating Super Admin account..."
    if [ -f "prisma/seed-superadmin.js" ]; then
        cd prisma
        SUPERADMIN_NAME="$SUPERADMIN_NAME" \
        SUPERADMIN_EMAIL="$SUPERADMIN_EMAIL" \
        SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" \
        node seed-superadmin.js
        cd ..
        print_success "Super Admin account created"
    else
        print_warning "Super Admin seed script not found"
    fi
}

# Install PM2 if not available
ensure_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_step "Installing PM2..."
        npm install -g pm2
        print_success "PM2 installed"
    fi
}

# Start application
start_application() {
    print_header "Starting Application"
    
    cd "$BACKEND_DIR"
    
    # Ensure PM2 is available
    ensure_pm2
    
    # Stop existing instance if running
    pm2 delete digitalbevy 2>/dev/null || true
    
    # Check if ecosystem.config.cjs exists
    if [ -f "ecosystem.config.cjs" ]; then
        # Update ecosystem config with correct port
        print_step "Starting with ecosystem.config.cjs..."
        pm2 start ecosystem.config.cjs
    else
        # Start directly with server.js
        print_step "Starting server.js with PM2..."
        pm2 start server.js --name "digitalbevy" -i 1 --env production
    fi
    
    pm2 save
    
    print_success "Application started with PM2"
    echo ""
    print_info "Useful PM2 commands:"
    echo "  pm2 status            - Check status"
    echo "  pm2 logs digitalbevy  - View logs"
    echo "  pm2 restart all       - Restart"
    echo "  pm2 stop all          - Stop"
}

# Print summary
print_summary() {
    print_header "Deployment Complete!"
    
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Your DigitalBevy application has been deployed successfully!     ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Configuration Summary:${NC}"
    echo "  ┌─────────────────────────────────────────────────────────────────┐"
    echo "  │ Database Provider:  $DB_PROVIDER"
    echo "  │ Application Port:   $APP_PORT"
    echo "  │ Website URL:        $SITE_URL"
    echo "  │ Schedulers:         $ENABLE_SCHEDULER"
    echo "  └─────────────────────────────────────────────────────────────────┘"
    echo ""
    echo -e "${CYAN}Access Your Application:${NC}"
    echo "  URL: $SITE_URL"
    echo ""
    print_info "Your Super Admin login credentials:"
    echo "  Email:    $SUPERADMIN_EMAIL"
    echo "  Password: [the password you entered during setup]"
    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo "  pm2 status              - Check application status"
    echo "  pm2 logs digitalbevy    - View application logs"
    echo "  pm2 restart all         - Restart application"
    echo "  pm2 stop all            - Stop application"
    echo ""
    echo -e "${CYAN}Configuration Files:${NC}"
    echo "  Environment: $BACKEND_DIR/.env"
    echo "  Database:    $BACKEND_DIR/prisma/schema.prisma"
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
    
    # Get PORT from .env if available (only uncommented lines)
    APP_PORT=$(grep "^PORT=" "$BACKEND_DIR/.env" | head -1 | cut -d'=' -f2 | tr -d ' ')
    APP_PORT=${APP_PORT:-3026}
    
    # Get FRONTEND_URL from .env if available (only uncommented lines)
    SITE_URL=$(grep "^FRONTEND_URL=" "$BACKEND_DIR/.env" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    SITE_URL=${SITE_URL:-"http://localhost:$APP_PORT"}
    
    print_info "Using existing .env configuration"
    print_info "Database provider: $DB_PROVIDER"
    print_info "Port: $APP_PORT"
    
    load_node
    check_prerequisites
    switch_database
    install_dependencies
    validate_db_connection
    build_frontend
    setup_database_quick
    start_application
    
    echo ""
    print_success "Quick deployment complete!"
    echo ""
    echo -e "${CYAN}Access Your Application:${NC}"
    echo "  URL: $SITE_URL"
    echo ""
}

# Setup database for quick deploy (no superadmin creation - already exists)
setup_database_quick() {
    print_header "Setting Up Database"
    
    cd "$BACKEND_DIR"
    
    print_step "Generating Prisma client..."
    npx prisma generate
    print_success "Prisma client generated"
    
    print_step "Pushing schema to database..."
    npx prisma db push
    print_success "Database schema synchronized"
    
    # Seed notification templates
    print_step "Seeding notification templates..."
    if [ -f "prisma/seed-notifications.js" ]; then
        cd prisma
        node seed-notifications.js
        cd ..
        print_success "Notification templates seeded"
    fi
    
    print_info "Skipping Super Admin creation (quick mode assumes existing users)"
}

# Main deployment flow
main() {
    clear
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                                   ║${NC}"
    echo -e "${CYAN}║     ${GREEN}DigitalBevy Deployment Script v2.0${CYAN}                            ║${NC}"
    echo -e "${CYAN}║     Business Management Platform                                 ║${NC}"
    echo -e "${CYAN}║                                                                   ║${NC}"
    echo -e "${CYAN}║     This wizard will guide you through:                          ║${NC}"
    echo -e "${CYAN}║       1. Database configuration (MySQL/PostgreSQL)               ║${NC}"
    echo -e "${CYAN}║       2. Application settings (URL, Port, Security Keys)         ║${NC}"
    echo -e "${CYAN}║       3. Super Admin account creation                            ║${NC}"
    echo -e "${CYAN}║       4. Scheduler configuration (Mautic, DropCowboy)            ║${NC}"
    echo -e "${CYAN}║                                                                   ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    read -p "Press Enter to start deployment wizard..."
    
    # Check for quick mode
    if [ "$1" == "--quick" ] || [ "$1" == "-q" ]; then
        quick_deploy
        exit 0
    fi
    
    # Load Node version manager
    load_node
    
    # Run deployment steps
    check_prerequisites
    collect_config
    create_env_file
    switch_database
    install_dependencies
    validate_db_connection
    build_frontend
    setup_database
    start_application
    print_summary
}

# Show help
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo ""
    echo -e "${CYAN}DigitalBevy Deployment Script v2.0${NC}"
    echo ""
    echo "Usage: ./deploy.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    echo "  -q, --quick   Quick deploy using existing .env configuration"
    echo ""
    echo "Interactive Mode (default):"
    echo "  The wizard will prompt you for:"
    echo "    - Database type (MySQL/PostgreSQL) and credentials"
    echo "    - Application URL and port"
    echo "    - Security keys (auto-generated or manual)"
    echo "    - Super Admin account (email and password)"
    echo "    - Scheduler configuration (optional)"
    echo ""
    echo "  Note: SFTP, SMTP, and other integration credentials are configured"
    echo "  through the Settings page in the application after deployment."
    echo ""
    echo "  All settings are written to backend/.env automatically."
    echo ""
    echo "Quick Mode (--quick):"
    echo "  Uses existing backend/.env file without prompts."
    echo "  Useful for redeployment or CI/CD pipelines."
    echo ""
    echo "Requirements:"
    echo "  - Node.js 18+ and npm"
    echo "  - Database server (MySQL or PostgreSQL) running and accessible"
    echo "  - openssl (for key generation)"
    echo ""
    exit 0
fi

# Run main function
main "$@"
