#!/bin/bash

# Database Provider Switch Script
# This script switches the Prisma schema between MySQL and PostgreSQL

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PRISMA_DIR="$BACKEND_DIR/prisma"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}======================================${NC}"
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

# Check if database provider is specified
if [ -z "$1" ]; then
    echo ""
    print_header "Database Provider Switch Script"
    echo ""
    echo "Usage: $0 <mysql|postgres>"
    echo ""
    echo "Examples:"
    echo "  $0 mysql     - Switch to MySQL database"
    echo "  $0 postgres  - Switch to PostgreSQL database"
    echo ""
    exit 1
fi

DB_PROVIDER="$1"

# Validate provider
if [ "$DB_PROVIDER" != "mysql" ] && [ "$DB_PROVIDER" != "postgres" ]; then
    print_error "Invalid database provider: $DB_PROVIDER"
    echo "Please use 'mysql' or 'postgres'"
    exit 1
fi

print_header "Switching to $DB_PROVIDER"

# Backup current schema
if [ -f "$PRISMA_DIR/schema.prisma" ]; then
    cp "$PRISMA_DIR/schema.prisma" "$PRISMA_DIR/schema.prisma.backup"
    print_success "Backed up current schema to schema.prisma.backup"
fi

# Switch to the appropriate schema
if [ "$DB_PROVIDER" == "mysql" ]; then
    if [ -f "$PRISMA_DIR/schema.mysql.prisma" ]; then
        cp "$PRISMA_DIR/schema.mysql.prisma" "$PRISMA_DIR/schema.prisma"
        print_success "Switched to MySQL schema"
    else
        print_error "MySQL schema not found at $PRISMA_DIR/schema.mysql.prisma"
        exit 1
    fi
else
    if [ -f "$PRISMA_DIR/schema.postgres.prisma" ]; then
        cp "$PRISMA_DIR/schema.postgres.prisma" "$PRISMA_DIR/schema.prisma"
        print_success "Switched to PostgreSQL schema"
    else
        # If postgres schema doesn't exist, create it from current (which should be postgres)
        print_warning "PostgreSQL schema file not found, using current schema"
    fi
fi

# Generate Prisma client
echo ""
echo "Generating Prisma client..."
cd "$BACKEND_DIR"
npx prisma generate

print_success "Prisma client generated for $DB_PROVIDER"

echo ""
print_header "Database switch complete!"
echo ""
echo "Next steps:"
echo "  1. Make sure DATABASE_URL in .env is configured for $DB_PROVIDER"
echo "  2. Run 'npx prisma db push' to sync the schema with your database"
echo "  3. Run 'npx prisma db seed' if you need to seed the database"
echo ""
