/**
 * User Routes - Pure in-memory drone management (no database)
 */

import { Router } from 'express';
import { getDroneManager } from '../services/droneManager';

const userRouter = Router();

/**
 * POST /user/drone/register
 * Register user's drone (in-memory only)
 */
userRouter.post('/drone/register', async (req, res) => {
  try {
    const { userId, name, uin, ipAddress, port } = req.body;

    if (!userId || !name || !uin || !ipAddress || !port) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const connectionString = `udp:${ipAddress}:${port}`;
    const droneManager = getDroneManager();

    // Register drone in-memory
    const droneId = await droneManager.registerDrone(
      userId,
      name,
      uin,
      connectionString,
      ipAddress,
      port
    );

    // Initialize drone connection info
    droneManager.initializeDrone(
      droneId,
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
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to register drone'
    });
  }
});

/**
 * GET /user/stats/:userId
 * Get dashboard statistics for user (mock data)
 */
userRouter.get('/stats/:userId', async (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        activeMissions: 0,
        totalMissions: 0,
        totalDrones: 0,
        operationalDrones: 0,
        totalFlightHours: 0,
        totalFlights: 0,
        successRate: 100.0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/recent-activity/:userId
 * Get recent activity (mock data)
 */
userRouter.get('/recent-activity/:userId', async (req, res) => {
  try {
    res.json({
      success: true,
      activities: [],
    });
  } catch (error: any) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/flight-logs/:userId
 * Get flight logs (mock data)
 */
userRouter.get('/flight-logs/:userId', async (req, res) => {
  try {
    res.json({
      success: true,
      logs: [],
    });
  } catch (error: any) {
    console.error('Error fetching flight logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/active-drones/:userId
 * Get currently active/connected drones (in-memory via DroneManager)
 */
userRouter.get('/active-drones/:userId', async (req, res) => {
  try {
    const droneManager = getDroneManager();
    const activeDrones = droneManager.getActiveDrones();

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
