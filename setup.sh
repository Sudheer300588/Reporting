#!/bin/bash
set -e

# Detect platform (Linux/Mac vs Windows Git Bash)
if [[ "$OS" == "Windows_NT" ]]; then
  COPY_CMD='powershell Copy-Item'
else
  COPY_CMD='cp'
fi

echo "Setting up backend..."
cd backend
if [ ! -f .env ]; then
  $COPY_CMD .env.example .env
fi
sleep 1
npm install

echo "Setting up frontend..."
cd ../frontend
if [ ! -f .env ]; then
  $COPY_CMD .env.example .env
fi
sleep 1
npm install

echo "✅ Setup done."
