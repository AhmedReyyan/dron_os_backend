/**
 * User Routes - User-specific drone management
 */

import { Router } from 'express';
import { getDroneManager } from '../services/droneManager';
import { prisma } from '../index';

const userRouter = Router();

/**
 * POST /user/drone/register
 * Register user's drone
 */
userRouter.post('/drone/register', async (req, res) => {
  try {
    const { userId, name, uin, ipAddress, port } = req.body;

    if (!userId || !name || !uin || !ipAddress || !port) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const connectionString = `udp:${ipAddress}:${port}`;
    const droneManager = getDroneManager();

    // Check if drone already exists
    const existingDrone = await prisma.drone.findUnique({ where: { uin } });
    
    if (existingDrone) {
      // Drone exists - check if it's connected
      if (existingDrone.isConnected) {
        console.log(`⚠️ Drone ${uin} already connected`);
        return res.json({
          success: true,
          droneId: existingDrone.id,
          connected: true,
          alreadyConnected: true,
          message: `Drone ${name} is already connected! You can see it on the map.`,
        });
      } else {
        // Exists but disconnected - reconnect
        console.log(`🔄 Reconnecting to existing drone ${uin}`);
        const connected = await droneManager.connectDrone(existingDrone.id);
        
        return res.json({
          success: true,
          droneId: existingDrone.id,
          connected,
          reconnected: true,
          message: connected
            ? `Drone ${name} reconnected successfully!`
            : `Found drone ${name}, but connection failed. Check if drone is online.`,
        });
      }
    }

    // New drone - register and connect
    const droneId = await droneManager.registerDrone(
      userId,
      name,
      uin,
      connectionString,
      ipAddress,
      port
    );

    // Auto-connect to the drone
    const connected = await droneManager.connectDrone(droneId);

    res.json({
      success: true,
      droneId,
      connected,
      message: connected
        ? `Drone ${name} registered and connected successfully!`
        : `Drone ${name} registered but connection failed. Check IP and port.`,
    });
  } catch (error: any) {
    console.error('Error registering drone:', error);
    
    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        success: false,
        error: 'This drone UIN is already registered. Each drone must have a unique UIN.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to register drone'
    });
  }
});

/**
 * GET /user/drones/:userId
 * Get ALL user's drones (connected and disconnected) with full details
 */
userRouter.get('/drones/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const drones = await prisma.drone.findMany({
      where: { userId },
      orderBy: [
        { isConnected: 'desc' }, // Connected drones first
        { lastSeen: 'desc' },    // Then by last seen
      ],
    });
    
    res.json({
      success: true,
      drones: drones.map(drone => ({
        id: drone.id,
        name: drone.name,
        uin: drone.uin,
        latitude: drone.latitude,
        longitude: drone.longitude,
        altitude: drone.altitude,
        isConnected: drone.isConnected,
        lastSeen: drone.lastSeen,
        ipAddress: drone.ipAddress,
        port: drone.port,
        connectionString: drone.connectionString,
        createdAt: drone.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching user drones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /user/drone/:droneId/connect
 * Connect to user's drone
 */
userRouter.post('/drone/:droneId/connect', async (req, res) => {
  try {
    const droneId = parseInt(req.params.droneId);
    const droneManager = getDroneManager();
    
    const success = await droneManager.connectDrone(droneId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Connected to drone',
      });
    } else {
      res.status(500).json({ error: 'Failed to connect to drone' });
    }
  } catch (error: any) {
    console.error('Error connecting to drone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/stats/:userId
 * Get dashboard statistics for user
 */
userRouter.get('/stats/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get mission counts
    const [activeMissions, totalMissions] = await Promise.all([
      prisma.mission.count({ where: { userId, status: 'active' } }),
      prisma.mission.count({ where: { userId } }),
    ]);

    // Get drone counts
    const [totalDrones, operationalDrones] = await Promise.all([
      prisma.drone.count({ where: { userId } }),
      prisma.drone.count({ where: { userId, isConnected: true } }),
    ]);

    // Get flight hours (sum of durations in seconds, convert to hours)
    const flightData = await prisma.flightLog.aggregate({
      where: { userId, status: 'completed' },
      _sum: { duration: true },
      _count: { id: true },
    });

    const totalFlightHours = flightData._sum.duration 
      ? Math.round(flightData._sum.duration / 3600) 
      : 0;

    // Calculate success rate
    const [completedMissions, failedMissions] = await Promise.all([
      prisma.mission.count({ where: { userId, status: 'completed' } }),
      prisma.mission.count({ where: { userId, status: 'failed' } }),
    ]);

    const totalCompletedOrFailed = completedMissions + failedMissions;
    const successRate = totalCompletedOrFailed > 0
      ? ((completedMissions / totalCompletedOrFailed) * 100).toFixed(1)
      : '100.0';

    res.json({
      success: true,
      stats: {
        activeMissions,
        totalMissions,
        totalDrones,
        operationalDrones,
        totalFlightHours,
        totalFlights: flightData._count.id,
        successRate: parseFloat(successRate),
      },
    });
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/recent-activity/:userId
 * Get recent activity/missions for user
 */
userRouter.get('/recent-activity/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    const recentMissions = await prisma.mission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { drone: true },
    });

    const activities = recentMissions.map(mission => ({
      id: mission.id,
      type: mission.status,
      title: mission.name,
      status: mission.status,
      timestamp: mission.completedAt || mission.startedAt || mission.createdAt,
      droneName: mission.drone?.name,
    }));

    res.json({
      success: true,
      activities,
    });
  } catch (error: any) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/flight-logs/:userId
 * Get flight logs for user
 */
userRouter.get('/flight-logs/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 20;

    const logs = await prisma.flightLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { 
        drone: { select: { name: true, uin: true } } 
      },
    });

    res.json({
      success: true,
      logs,
    });
  } catch (error: any) {
    console.error('Error fetching flight logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/active-drones/:userId
 * Get currently active/connected drones for operations page
 */
userRouter.get('/active-drones/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    const activeDrones = await prisma.drone.findMany({
      where: { userId, isConnected: true },
      select: {
        id: true,
        name: true,
        uin: true,
        latitude: true,
        longitude: true,
        altitude: true,
        isConnected: true,
        lastSeen: true,
      },
    });

    res.json({
      success: true,
      drones: activeDrones,
    });
  } catch (error: any) {
    console.error('Error fetching active drones:', error);
    res.status(500).json({ error: error.message });
  }
});

export default userRouter;




