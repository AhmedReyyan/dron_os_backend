/**
 * User Routes - Database-backed drone management
 */

import { Router } from 'express';
import { getDroneManager } from '../services/droneManager';
import { getTelemetryService } from '../services/telemetryService';
import { prisma } from '../index';

const userRouter = Router();

/**
 * POST /user/drone/register
 * Register user's drone in database
 */
userRouter.post('/drone/register', async (req, res) => {
  try {
    const { userId, name, uin, ipAddress, port } = req.body;

    if (!userId || !name || !uin || !ipAddress || !port) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if drone already exists
    const existingDrone = await prisma.drone.findUnique({
      where: { uin }
    });

    if (existingDrone) {
      return res.status(400).json({ 
        success: false,
        error: 'Drone with this UIN already exists' 
      });
    }

    // Create drone in database
    const drone = await prisma.drone.create({
      data: {
        name,
        uin,
        status: 'offline',
        userId,
        lastSeen: new Date()
      }
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        type: 'drone_registered',
        title: `Drone ${name} registered`,
        description: `Drone ${name} (UIN: ${uin}) was registered successfully`,
        status: 'success',
        userId,
        droneId: drone.id
      }
    });

    // Register with DroneManager for real-time operations
    const connectionString = `udp:${ipAddress}:${port}`;
    const droneManager = getDroneManager();
    
    // Initialize drone connection info
    droneManager.initializeDrone(
      drone.id,
      userId,
      name,
      uin,
      connectionString,
      ipAddress,
      port
    );

    // Auto-connect to the drone
    const connected = await droneManager.connectDrone(drone.id);

    if (connected) {
      // Update drone status in database
      await prisma.drone.update({
        where: { id: drone.id },
        data: { 
          status: 'connected',
          lastSeen: new Date()
        }
      });

      // Create connection activity
      await prisma.activity.create({
        data: {
          type: 'drone_connected',
          title: `Drone ${name} connected`,
          description: `Drone ${name} successfully connected to SITL`,
          status: 'success',
          userId,
          droneId: drone.id
        }
      });
    }

    res.json({
      success: true,
      droneId: drone.id,
      connected,
      message: connected
        ? `Drone ${name} registered and connected successfully!`
        : `Drone ${name} registered but connection failed. Check IP and port.`,
    });
  } catch (error: any) {
    console.error('Error registering drone:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to register drone'
    });
  }
});

/**
 * GET /user/stats/:userId
 * Get dashboard statistics for user from database
 */
userRouter.get('/stats/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get user's drones
    const drones = await prisma.drone.findMany({
      where: { userId }
    });

    // Get user's missions
    const missions = await prisma.mission.findMany({
      where: { userId }
    });

    // Calculate statistics
    const totalDrones = drones.length;
    const operationalDrones = drones.filter((d: any) => d.status === 'connected' || d.status === 'flying').length;
    const totalMissions = missions.length;
    const activeMissions = missions.filter((m: any) => m.status === 'active').length;
    const completedMissions = missions.filter((m: any) => m.status === 'completed').length;
    const successfulMissions = missions.filter((m: any) => m.success).length;
    
    // Calculate total flight hours
    const totalFlightHours = missions.reduce((sum: number, mission: any) => sum + mission.flightHours, 0);
    
    // Calculate success rate
    const successRate = completedMissions > 0 ? (successfulMissions / completedMissions) * 100 : 100;

    res.json({
      success: true,
      stats: {
        activeMissions,
        totalMissions,
        totalDrones,
        operationalDrones,
        totalFlightHours: Math.round(totalFlightHours * 100) / 100, // Round to 2 decimal places
        totalFlights: completedMissions,
        successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
      },
    });
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/recent-activity/:userId
 * Get recent activity from database
 */
userRouter.get('/recent-activity/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get recent activities for the user
    const activities = await prisma.activity.findMany({
      where: { userId },
      include: {
        drone: {
          select: { name: true }
        },
        mission: {
          select: { name: true }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 20 // Limit to last 20 activities
    });

    // Format activities for frontend
    const formattedActivities = activities.map((activity: any) => ({
      id: activity.id,
      type: activity.type,
      title: activity.title,
      status: activity.status,
      timestamp: activity.timestamp.toISOString(),
      droneName: activity.drone?.name,
      missionName: activity.mission?.name
    }));

    res.json({
      success: true,
      activities: formattedActivities,
    });
  } catch (error: any) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/flight-logs/:userId
 * Get flight logs from database
 */
userRouter.get('/flight-logs/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get completed missions as flight logs
    const flightLogs = await prisma.mission.findMany({
      where: { 
        userId,
        status: 'completed'
      },
      include: {
        drone: {
          select: { name: true, uin: true }
        }
      },
      orderBy: { endTime: 'desc' }
    });

    // Format flight logs for frontend
    const formattedLogs = flightLogs.map((mission: any) => ({
      id: mission.id,
      missionName: mission.name,
      droneName: mission.drone?.name,
      droneUin: mission.drone?.uin,
      startTime: mission.startTime?.toISOString(),
      endTime: mission.endTime?.toISOString(),
      flightHours: mission.flightHours,
      success: mission.success,
      description: mission.description
    }));

    res.json({
      success: true,
      logs: formattedLogs,
    });
  } catch (error: any) {
    console.error('Error fetching flight logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /user/drone/connect-existing
 * Connect to existing drone
 */
userRouter.post('/drone/connect-existing', async (req, res) => {
  try {
    const { userId, droneId, ipAddress, port } = req.body;
    
    if (!userId || !droneId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and Drone ID are required'
      });
    }

    // Find the drone and verify it belongs to the user
    const drone = await prisma.drone.findFirst({
      where: { 
        id: parseInt(droneId),
        userId: parseInt(userId)
      }
    });

    if (!drone) {
      return res.status(404).json({
        success: false,
        error: 'Drone not found or does not belong to this user'
      });
    }

    // Source of truth: in-memory DroneManager. Ignore stale DB status.
    const droneManager = getDroneManager();
    const existingConn = droneManager.getConnection(drone.id);
    if (existingConn && existingConn.isConnected) {
      return res.status(400).json({
        success: false,
        error: 'Drone is already connected'
      });
    }

    // Initialize drone in DroneManager
    const connectionString = `udp:${ipAddress || 'localhost'}:${port || 14550}`;
    
    droneManager.initializeDrone(
      drone.id,
      parseInt(userId),
      drone.name,
      drone.uin,
      connectionString,
      ipAddress || 'localhost',
      parseInt(port) || 14550
    );

    // Connect to the drone
    const connected = await droneManager.connectDrone(drone.id);

    if (connected) {
      // Update drone status in database
      await prisma.drone.update({
        where: { id: drone.id },
        data: { 
          status: 'connected',
          lastSeen: new Date()
        }
      });

      // Log the connection activity
      await prisma.activity.create({
        data: {
          userId: parseInt(userId),
          droneId: drone.id,
          type: 'drone_connected',
          title: `Drone ${drone.name} connected`,
          description: `Drone ${drone.name} (UIN: ${drone.uin}) connected to SITL at ${ipAddress}:${port}.`,
          status: 'success'
        }
      });

      res.json({
        success: true,
        message: `Drone ${drone.name} connected successfully`,
        droneId: drone.id,
        connected: true
      });
    } else {
      res.json({
        success: false,
        error: 'Failed to establish connection to drone',
        connected: false
      });
    }
  } catch (error: any) {
    console.error('Error connecting to existing drone:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to connect to existing drone'
    });
  }
});

/**
 * POST /user/drone/disconnect
 * Disconnect user's drone
 */
userRouter.post('/drone/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const droneManager = getDroneManager();
    
    // Find user's connected drone
    const drone = droneManager.getDroneByUserId(userId);
    
    if (!drone) {
      return res.status(404).json({ 
        success: false,
        error: 'No connected drone found for this user' 
      });
    }

    // Disconnect the drone
    await droneManager.disconnectDrone(drone.droneId);

    // Update drone status in database
    await prisma.drone.update({
      where: { id: drone.droneId },
      data: { 
        status: 'offline',
        lastSeen: new Date()
      }
    });

    // Create disconnect activity
    await prisma.activity.create({
      data: {
        type: 'drone_disconnected',
        title: `Drone ${drone.name} disconnected`,
        description: `Drone ${drone.name} was disconnected from SITL`,
        status: 'info',
        userId,
        droneId: drone.droneId
      }
    });

    res.json({
      success: true,
      message: `Drone ${drone.name} disconnected successfully`,
      droneId: drone.droneId
    });
  } catch (error: any) {
    console.error('Error disconnecting drone:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to disconnect drone'
    });
  }
});

/**
 * GET /user/active-drones/:userId
 * Get currently active/connected drones from database
 */
userRouter.get('/active-drones/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get user's drones from DB
    const drones = await prisma.drone.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        uin: true,
        status: true,
        batteryLevel: true,
        lastSeen: true,
        createdAt: true
      }
    });

    // Overlay in-memory truth for connection status
    const dm = getDroneManager();
    const formattedDrones = drones.map((drone: any) => {
      const conn = dm.getConnection(drone.id);
      const isConnected = !!conn?.isConnected;
      return {
        id: drone.id,
        name: drone.name,
        uin: drone.uin,
        status: isConnected ? 'connected' : 'offline',
        batteryLevel: drone.batteryLevel,
        lastSeen: (conn?.lastUpdate ? new Date(conn.lastUpdate) : drone.lastSeen)?.toISOString(),
        createdAt: drone.createdAt.toISOString(),
        isConnected
      };
    });

    res.json({
      success: true,
      drones: formattedDrones,
    });
  } catch (error: any) {
    console.error('Error fetching active drones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/telemetry/:userId
 * Get telemetry data for user's drones
 */
userRouter.get('/telemetry/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 100;

    const telemetryService = getTelemetryService();
    const telemetryData = await telemetryService.getUserTelemetryData(userId, limit);

    res.json({
      success: true,
      telemetry: telemetryData,
    });
  } catch (error: any) {
    console.error('Error fetching telemetry data:', error);
    res.status(500).json({ error: error.message });
  }
});

export default userRouter;
