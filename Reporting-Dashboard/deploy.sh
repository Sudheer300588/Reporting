#!/bin/bash
set -e

######## LOAD NODE 22 + NVM (NON-INTERACTIVE SAFE) ########
export NVM_DIR="$HOME/.nvm"
# load nvm
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# use Node 22
nvm use 22 >/dev/null 2>&1 || true

# ensure correct path for npm & pm2
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"

###########################################################

echo "Installing backend dependencies..."
cd backend
npm install

echo "Installing frontend dependencies..."
cd ../frontend
npm install

echo "Building frontend..."
npm run build

echo "Moving frontend to backend/dist..."
rm -rf ../backend/dist
mv dist ../backend/

cd ../backend

echo "Running Prisma..."
npx prisma generate
npx prisma migrate deploy

echo "Seeding notification templates..."
cd prisma
node seed-notifications.js
cd ..

######### PM2 SECTION (NO NPM PREFIX OVERRIDE) #########

echo "Checking PM2..."
if ! command -v pm2 &> /dev/null; then
  echo "PM2 not found — installing..."
  npm install -g pm2
fi

#########################################################

pm2 delete simple-app 2>/dev/null || true

echo "Starting backend with PM2 (ESM mode)..."
pm2 start ecosystem.config.cjs

pm2 save

echo "🎉 Deployment complete!"
