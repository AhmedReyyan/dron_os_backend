# ⚡ Quick Start Guide

## Prerequisites

1. **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
2. **Node.js 18+** - [Download here](https://nodejs.org/)

## 🚀 Start Backend (Easy Way)

### Step 1: Create `.env` file

Create a file called `.env` in this folder (`dron_os_backend`) with this content:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/expressdb?schema=public"
JWT_SECRET="your-secret-key-change-this"
SENDER_EMAIL=""
SENDER_PASSWORD=""
NODE_ENV=development
```

### Step 2: Make sure Docker Desktop is running

- Open Docker Desktop
- Wait until it says "Docker Desktop is running"

### Step 3: Run the setup script

**On Windows:**
```
START_BACKEND.bat
```

**Or manually:**
```bash
# Start PostgreSQL
docker-compose up -d

# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Start server
npm run dev
```

## ✅ Verify It Works

Open browser: http://localhost:5000/health

Should show: `{"message":"Server is running!"}`

## 🐛 Troubleshooting

### "Docker Desktop is not running"
- Start Docker Desktop from Start Menu
- Wait 30 seconds for it to fully start
- Try again

### "Port 5432 already in use"
Your computer already has PostgreSQL installed. You can:
1. Stop it: Services → PostgreSQL → Stop
2. Or use existing PostgreSQL (update DATABASE_URL in .env)

### "Cannot connect to database"
```bash
# Check if PostgreSQL container is running
docker ps

# Restart it
docker-compose down
docker-compose up -d
```

## 📝 What Each Command Does

1. `docker-compose up -d` - Starts PostgreSQL in background
2. `npm install` - Installs required packages
3. `npx prisma migrate dev` - Creates database tables
4. `npm run dev` - Starts the backend server

## 🎯 Next Steps

After backend is running:

1. **Test drone connection:**
   - Start SITL (if you have it)
   - Open `http://localhost:3000/drone` in browser
   - Click "Connect to SITL"

2. **Or test with curl:**
   ```bash
   curl http://localhost:5000/health
   ```

---

**Need help?** Check `SETUP_GUIDE.md` for detailed instructions!



