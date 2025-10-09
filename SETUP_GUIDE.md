# 🚀 Backend Setup Guide

## Quick Start (3 Steps)

### Step 1: Start PostgreSQL with Docker

```bash
cd dron_os_backend
docker-compose up -d
```

This will start PostgreSQL in a Docker container in the background.

**Verify it's running:**
```bash
docker ps
```

You should see `express_postgres` container running.

### Step 2: Install Dependencies & Setup Database

```bash
# Install Node packages
npm install

# Run database migrations
npx prisma migrate dev

# (Optional) Generate Prisma client
npx prisma generate
```

### Step 3: Start the Backend Server

```bash
npm run dev
```

You should see:
```
🚀 Server ready at http://localhost:5000
📡 WebSocket available at ws://localhost:5000/ws/drone
```

## ✅ Verify Everything Works

### Test Health Endpoint
```bash
curl http://localhost:5000/health
```

Should return:
```json
{"message":"Server is running!"}
```

### Test Database Connection
```bash
curl http://localhost:5000/users
```

Should return an array (empty or with users).

## 🔧 Useful Commands

### Database Management

**View database in Prisma Studio:**
```bash
npx prisma studio
```

**Reset database:**
```bash
npx prisma migrate reset
```

**Create new migration:**
```bash
npx prisma migrate dev --name your_migration_name
```

### Docker Commands

**Start PostgreSQL:**
```bash
docker-compose up -d
```

**Stop PostgreSQL:**
```bash
docker-compose down
```

**Stop and remove data:**
```bash
docker-compose down -v
```

**View PostgreSQL logs:**
```bash
docker-compose logs postgres
```

**Access PostgreSQL CLI:**
```bash
docker exec -it express_postgres psql -U postgres -d expressdb
```

### Backend Commands

**Development (with hot reload):**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Run production build:**
```bash
npm start
```

## 🐛 Troubleshooting

### "Port 5432 already in use"

Another PostgreSQL instance is running. Either:
1. Stop it: `sudo service postgresql stop` (Linux) or stop from Services (Windows)
2. Or change port in `docker-compose.yml`

### "Cannot connect to database"

1. Check Docker is running: `docker ps`
2. Check database URL in `.env` matches docker-compose settings
3. Restart Docker: `docker-compose down && docker-compose up -d`

### "Prisma migration failed"

1. Reset database: `npx prisma migrate reset`
2. Run migrations again: `npx prisma migrate dev`

### "Module not found"

```bash
rm -rf node_modules package-lock.json
npm install
```

## 📝 Environment Variables

The `.env` file contains:

```env
PORT=5000                              # Backend server port
DATABASE_URL="postgresql://..."        # Database connection
JWT_SECRET="your-secret"               # For authentication
SENDER_EMAIL="email@domain.com"        # For password reset emails
```

## 🗄️ Database Schema

Your database includes:
- **User** table (for authentication)
- Prisma migrations in `prisma/migrations/`

## 🔌 API Endpoints

### Authentication
- `POST /auth/signup` - Create account
- `POST /auth/login` - Login
- `POST /auth/send-reset-password-mail` - Request password reset

### Drone Control
- `POST /drone/connect` - Connect to SITL
- `POST /drone/disconnect` - Disconnect from SITL
- `GET /drone/status` - Get current status
- `POST /drone/arm` - Arm the drone
- `POST /drone/disarm` - Disarm the drone

### WebSocket
- `ws://localhost:5000/ws/drone` - Real-time telemetry

## ✨ Next Steps

After backend is running:

1. **Test with SITL:**
   ```bash
   # In another terminal, start SITL
   cd ~/ardupilot/ArduCopter
   sim_vehicle.py --console --map
   ```

2. **Connect via API:**
   ```bash
   curl -X POST http://localhost:5000/drone/connect \
     -H "Content-Type: application/json" \
     -d '{"connectionString":"tcp:127.0.0.1:5760"}'
   ```

3. **Start Frontend:**
   ```bash
   cd ../dronos-frontend
   pnpm dev
   ```

4. **Open app:**
   ```
   http://localhost:3000/drone
   ```

## 🎯 Complete Setup Checklist

- [ ] Docker installed and running
- [ ] PostgreSQL container started (`docker-compose up -d`)
- [ ] Dependencies installed (`npm install`)
- [ ] Database migrated (`npx prisma migrate dev`)
- [ ] `.env` file configured
- [ ] Backend running (`npm run dev`)
- [ ] Health check passed (`curl localhost:5000/health`)

---

**Ready!** Your backend is now running and ready to connect to SITL! 🚁



