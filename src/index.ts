import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import authRouter from "./routes/auth";
import droneRouter from "./routes/drone";
import { getWebSocketService } from "./services/websocketService";

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
});
