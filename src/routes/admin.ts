/**
 * Admin Routes - Pure in-memory drone management (no database)
 */

import { Router } from 'express';
import { getDroneManager } from '../services/droneManager';
import { prisma } from '../index';

const adminRouter = Router();

/**
 * GET /admin/users
 * Get all users (database)
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

/**
 * GET /admin/drones
 * Get ALL drones from ALL users (in-memory via DroneManager)
 */
adminRouter.get('/drones', async (req, res) => {
  try {
    const droneManager = getDroneManager();
    const allDrones = droneManager.getAllDrones();

    res.json({
      success: true,
      drones: allDrones,
    });
  } catch (error: any) {
    console.error('Error fetching all drones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/stats
 * Get system-wide statistics (mock data for now)
 */
adminRouter.get('/stats', async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const droneManager = getDroneManager();
    const allDrones = droneManager.getAllDrones();

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDrones: allDrones.length,
        activeDrones: allDrones.filter((d: any) => d.isConnected).length,
        totalFlights: 0,
        totalFlightHours: 0,
        activeMissions: 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/message/send
 * Send message to all drones or a specific drone
 */
adminRouter.post('/message/send', async (req, res) => {
  try {
    const { message, importance, targetDroneId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    const droneManager = getDroneManager();
    
    // Send message to specific drone or all drones
    const result = droneManager.sendMessage(
      message,
      importance || 'normal',
      targetDroneId ? parseInt(targetDroneId) : null
    );

    res.json({
      success: true,
      message: result.message,
      sentTo: result.sentTo,
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default adminRouter;
