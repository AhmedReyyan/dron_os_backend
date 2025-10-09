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
        ? 'Drone registered and connected successfully'
        : 'Drone registered but connection failed',
    });
  } catch (error: any) {
    console.error('Error registering drone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /user/drones/:userId
 * Get user's drones
 */
userRouter.get('/drones/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const droneManager = getDroneManager();
    
    const drones = await droneManager.getUserDrones(userId);
    
    res.json({
      success: true,
      drones,
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

export default userRouter;

