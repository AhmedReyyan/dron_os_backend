import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import authRouter from "./routes/auth";
import droneRouter from "./routes/drone";
import adminRouter from "./routes/admin";
import userRouter from "./routes/user";
import { analyticsRouter } from "./routes/analytics";
import { getWebSocketService } from "./services/websocketService";
import { getTelemetryService } from "./services/telemetryService";

dotenv.config();

const app = express();
export const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Routes
app.use("/auth", authRouter);
app.use("/drone", droneRouter);
app.use("/admin", adminRouter);
app.use("/user", userRouter);
app.use("/analytics", analyticsRouter);

// Get users
app.get("/users", async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.get("/health", (req, res) => {
  res.json({ message: "Server is running!" });
});

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
const wsService = getWebSocketService();
wsService.initialize(server);

server.listen(PORT, async () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
  console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws/drone`);
  
  // Crash recovery: reset any stale 'connected'/'flying' drones to 'offline'
  try {
    const updated = await prisma.drone.updateMany({
      where: { status: { in: ['connected', 'flying'] } },
      data: { status: 'offline', lastSeen: new Date() }
    });
    if ((updated as any).count) {
      console.log(`🧯 [Recovery] Reset ${ (updated as any).count } drone(s) to offline at startup`);
    }
  } catch (e) {
    console.error('⚠️  [Recovery] Failed to reset drone statuses on startup:', e);
  }

  // Auto-connect to SITL on startup
  const { getMAVLinkService } = await import('./services/mavlinkService.js');
  const mavlinkService = getMAVLinkService();
  
  setTimeout(async () => {
    const connectionString = process.env.SITL_CONNECTION || 'udp:0.0.0.0:14550';
    console.log(`[Startup] Auto-connecting to SITL: ${connectionString}`);
    const success = await mavlinkService.connect(connectionString);
    if (success) {
      console.log('✅ [Startup] SITL connected successfully');
    } else {
      console.log('⚠️  [Startup] SITL connection failed - you can connect manually via /drone/connect');
    }
  }, 2000); // Wait 2 seconds for everything to initialize

  // Setup telemetry cleanup job (run every hour)
  setInterval(async () => {
    try {
      const telemetryService = getTelemetryService();
      await telemetryService.cleanupOldTelemetry();
      console.log('🧹 [Cleanup] Old telemetry data cleaned up');
    } catch (error) {
      console.error('❌ [Cleanup] Error cleaning up telemetry data:', error);
    }
  }, 60 * 60 * 1000); // Every hour
});
