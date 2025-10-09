/**
 * Admin Routes - Multi-drone management and messaging
 */

import { Router } from 'express';
import { getDroneManager } from '../services/droneManager';
import { prisma } from '../index';

const adminRouter = Router();

/**
 * GET /admin/drones
 * Get all connected drones (admin only)
 */
adminRouter.get('/drones', async (req, res) => {
  try {
    const droneManager = getDroneManager();
    const connectedDrones = droneManager.getAllConnectedDrones();
    
    res.json({
      success: true,
      drones: connectedDrones,
    });
  } catch (error: any) {
    console.error('Error fetching drones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/drones/register
 * Register a new drone for a user
 */
adminRouter.post('/drones/register', async (req, res) => {
  try {
    const { userId, name, uin, connectionString, ipAddress, port } = req.body;

    const droneManager = getDroneManager();
    const droneId = await droneManager.registerDrone(
      userId,
      name,
      uin,
      connectionString,
      ipAddress,
      port
    );

    res.json({
      success: true,
      droneId,
      message: 'Drone registered successfully',
    });
  } catch (error: any) {
    console.error('Error registering drone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/drones/:droneId/connect
 * Connect to a specific drone
 */
adminRouter.post('/drones/:droneId/connect', async (req, res) => {
  try {
    const droneId = parseInt(req.params.droneId);
    const droneManager = getDroneManager();
    
    const success = await droneManager.connectDrone(droneId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Drone connected successfully',
      });
    } else {
      res.status(500).json({ error: 'Failed to connect to drone' });
    }
  } catch (error: any) {
    console.error('Error connecting drone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/drones/:droneId/disconnect
 * Disconnect from a specific drone
 */
adminRouter.post('/drones/:droneId/disconnect', async (req, res) => {
  try {
    const droneId = parseInt(req.params.droneId);
    const droneManager = getDroneManager();
    
    await droneManager.disconnectDrone(droneId);
    
    res.json({
      success: true,
      message: 'Drone disconnected',
    });
  } catch (error: any) {
    console.error('Error disconnecting drone:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/message/send
 * Send message to specific drone or all drones
 */
adminRouter.post('/message/send', async (req, res) => {
  try {
    const { droneId, message, importance } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const validImportance = ['normal', 'important', 'warning', 'critical'];
    const importanceLevel = validImportance.includes(importance) ? importance : 'normal';

    const droneManager = getDroneManager();

    if (droneId === 'all') {
      // Broadcast to all drones
      const count = await droneManager.broadcastMessage(message, importanceLevel);
      res.json({
        success: true,
        message: `Message sent to ${count} drone(s)`,
        count,
      });
    } else {
      // Send to specific drone
      const success = await droneManager.sendMessageToDrone(
        parseInt(droneId),
        message,
        importanceLevel
      );
      
      if (success) {
        res.json({
          success: true,
          message: 'Message sent to drone',
        });
      } else {
        res.status(404).json({ error: 'Drone not connected' });
      }
    }
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/users
 * Get all users (admin only)
 */
adminRouter.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        createdAt: true,
        drones: {
          select: {
            id: true,
            name: true,
            uin: true,
            isConnected: true,
            lastSeen: true,
          },
        },
      },
    });

    res.json({
      success: true,
      users,
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

export default adminRouter;

