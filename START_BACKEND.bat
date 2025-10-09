@echo off
echo ================================
echo  Starting Backend Server
echo ================================
echo.

echo [1/4] Starting PostgreSQL with Docker...
docker-compose up -d
if errorlevel 1 (
    echo ERROR: Docker failed to start. Please make sure Docker Desktop is running.
    pause
    exit /b 1
)
echo.

echo [2/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo.

echo [3/4] Running database migrations...
call npx prisma migrate dev --name init
echo.

echo [4/4] Starting backend server...
echo.
echo ================================
echo  Backend Starting!
echo  - HTTP: http://localhost:5000
echo  - WebSocket: ws://localhost:5000/ws/drone
echo ================================
echo.
call npm run dev



