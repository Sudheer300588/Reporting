# !/bin/bash
# Start backend server
cd backend
npm run start &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

cd frontend
npm run dev &
FRONTEND_PID=$!



# Wait for background processes
wait
