# Drone SITL Integration - Backend

This backend provides MAVLink connectivity to SITL and WebSocket streaming for real-time drone telemetry.

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file:

```env
PORT=5000
DATABASE_URL="your_database_url"
JWT_SECRET="your_jwt_secret"
SENDER_EMAIL="your_email@example.com"
```

### Running the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

The server will run on:
- **HTTP**: `http://localhost:5000`
- **WebSocket**: `ws://localhost:5000/ws/drone`

## 📡 API Endpoints

### Drone Control

#### Connect to SITL
```http
POST /drone/connect
Content-Type: application/json

{
  "connectionString": "tcp:127.0.0.1:5760"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully connected to SITL",
  "connectionString": "tcp:127.0.0.1:5760"
}
```

#### Disconnect from SITL
```http
POST /drone/disconnect
```

#### Get Drone Status
```http
GET /drone/status
```

**Response:**
```json
{
  "connected": true,
  "timestamp": 1234567890
}
```

#### Arm Drone
```http
POST /drone/arm
```

#### Disarm Drone
```http
POST /drone/disarm
```

### Authentication (Existing)

#### Signup
```http
POST /auth/signup
```

#### Login
```http
POST /auth/login
```

## 🔌 WebSocket Connection

Connect to `ws://localhost:5000/ws/drone`

### Client → Server Messages

```javascript
// Connect to SITL
{
  "type": "connect",
  "connectionString": "tcp:127.0.0.1:5760"
}

// Disconnect
{
  "type": "disconnect"
}

// Arm drone
{
  "type": "arm"
}

// Disarm drone
{
  "type": "disarm"
}

// Ping
{
  "type": "ping"
}
```

### Server → Client Messages

```javascript
// Position update (5Hz)
{
  "type": "position",
  "data": {
    "lat": 47.397742,
    "lon": 8.545594,
    "alt": 488.5,
    "relative_alt": 10.5,
    "vx": 2.5,
    "vy": 1.2,
    "vz": -0.5,
    "hdg": 45.0,
    "time_boot_ms": 123456
  },
  "timestamp": 1234567890
}

// Battery update
{
  "type": "battery",
  "data": {
    "id": 0,
    "battery_function": 0,
    "type": 1,
    "temperature": 25.5,
    "battery_remaining": 85
  },
  "timestamp": 1234567890
}

// GPS update
{
  "type": "gps",
  "data": {
    "time_usec": 123456789,
    "fix_type": 3,
    "lat": 47.397742,
    "lon": 8.545594,
    "alt": 488.5,
    "vel": 5.2,
    "satellites_visible": 12
  },
  "timestamp": 1234567890
}

// Heartbeat
{
  "type": "heartbeat",
  "data": {
    "type": 2,
    "autopilot": 3,
    "base_mode": 81,
    "custom_mode": 0,
    "system_status": 4
  },
  "timestamp": 1234567890
}

// Connection status
{
  "type": "connected",
  "data": {
    "message": "Successfully connected to SITL"
  },
  "timestamp": 1234567890
}

// Disconnection
{
  "type": "disconnected",
  "data": {
    "message": "Disconnected from SITL"
  },
  "timestamp": 1234567890
}

// Error
{
  "type": "error",
  "data": {
    "message": "Connection failed"
  },
  "timestamp": 1234567890
}
```

## 📁 Project Structure

```
dron_os_backend/
├── src/
│   ├── index.ts                    # Main server entry
│   ├── services/
│   │   ├── mavlinkService.ts      # MAVLink connection handler
│   │   └── websocketService.ts    # WebSocket server
│   ├── routes/
│   │   ├── auth.ts                # Authentication routes
│   │   └── drone.ts               # Drone control routes
│   ├── lib/
│   │   └── nodemailer.ts          # Email service
│   ├── utils/
│   │   └── otpGenerator.ts        # OTP utility
│   └── env.ts                     # Environment config
├── prisma/
│   └── schema.prisma              # Database schema
└── package.json
```

## 🔧 Technologies Used

- **Express.js**: Web framework
- **WebSocket (ws)**: Real-time communication
- **node-mavlink**: MAVLink protocol implementation
- **Prisma**: Database ORM
- **TypeScript**: Type safety
- **JWT**: Authentication

## 📊 MAVLink Messages Supported

| Message ID | Message Name | Description |
|------------|--------------|-------------|
| 0 | HEARTBEAT | System status |
| 24 | GPS_RAW_INT | GPS fix data |
| 33 | GLOBAL_POSITION_INT | Position and velocity |
| 147 | BATTERY_STATUS | Battery information |

## 🐛 Troubleshooting

### SITL Connection Issues

1. **Verify SITL is running:**
   ```bash
   # For ArduPilot
   cd ~/ardupilot/ArduCopter
   sim_vehicle.py --console --map
   ```

2. **Check correct port:**
   - TCP: Port 5760
   - UDP: Port 14550

3. **Test MAVLink connection:**
   ```bash
   # Using mavproxy
   mavproxy.py --master=tcp:127.0.0.1:5760
   ```

### WebSocket Issues

1. **Connection refused:**
   - Ensure backend is running
   - Check port 5000 is not in use

2. **No telemetry data:**
   - Verify SITL connection is established
   - Check browser console for WebSocket errors

## 🔐 Security Notes

- Use environment variables for sensitive data
- Enable CORS only for trusted origins in production
- Add authentication middleware for drone control endpoints
- Use WSS (secure WebSocket) in production

## 📚 References

- [MAVLink Protocol](https://mavlink.io/)
- [ArduPilot SITL](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)


