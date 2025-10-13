/**
 * Drone Routes - SITL Control and Telemetry
 */

import { Router } from 'express';
import { getMAVLinkService } from '../services/mavlinkService';

const droneRouter = Router();

/**
 * POST /drone/connect
 * Connect to SITL
 */
droneRouter.post('/connect', async (req, res) => {
  try {
    const { connectionString } = req.body;

    if (!connectionString) {
      return res.status(400).json({ error: 'Connection string is required' });
    }

    // Validate connection string format
    const validFormats = /^(tcp|udp|udpin):[^:]+:\d+$/;
    if (!validFormats.test(connectionString)) {
      return res.status(400).json({
        error: 'Invalid connection string format. Use: tcp:HOST:PORT or udp:HOST:PORT'
      });
    }

    const mavlinkService = getMAVLinkService();
    const success = await mavlinkService.connect(connectionString);

    if (success) {
      return res.json({
        success: true,
        message: 'Successfully connected to SITL',
        connectionString
      });
    } else {
      return res.status(500).json({
        error: 'Failed to connect to SITL. Check if SITL is running.'
      });
    }
  } catch (error: any) {
    console.error('Connection error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to connect to SITL'
    });
  }
});

/**
 * POST /drone/disconnect
 * Disconnect from SITL
 */
droneRouter.post('/disconnect', async (req, res) => {
  try {
    const mavlinkService = getMAVLinkService();
    mavlinkService.disconnect();

    return res.json({
      success: true,
      message: 'Disconnected from SITL'
    });
  } catch (error: any) {
    console.error('Disconnect error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to disconnect'
    });
  }
});

/**
 * GET /drone/status
 * Get current drone status
 */
droneRouter.get('/status', async (req, res) => {
  try {
    const mavlinkService = getMAVLinkService();
    const data = mavlinkService.getCurrentData();

    return res.json({
      ...data,
      connected: mavlinkService.isConnected()
    });
  } catch (error: any) {
    console.error('Status error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to get status'
    });
  }
});

/**
 * POST /drone/arm
 * Send ARM command
 */
droneRouter.post('/arm', async (req, res) => {
  try {
    const mavlinkService = getMAVLinkService();

    if (!mavlinkService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to drone' });
    }

    const success = await mavlinkService.arm();

    if (success) {
      return res.json({
        success: true,
        message: 'Arm command sent'
      });
    } else {
      return res.status(500).json({
        error: 'Failed to send arm command'
      });
    }
  } catch (error: any) {
    console.error('Arm error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to arm'
    });
  }
});

/**
 * POST /drone/disarm
 * Send DISARM command
 */
droneRouter.post('/disarm', async (req, res) => {
  try {
    const mavlinkService = getMAVLinkService();

    if (!mavlinkService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to drone' });
    }

    const success = await mavlinkService.disarm();

    if (success) {
      return res.json({
        success: true,
        message: 'Disarm command sent'
      });
    } else {
      return res.status(500).json({
        error: 'Failed to send disarm command'
      });
    }
  } catch (error: any) {
    console.error('Disarm error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to disarm'
    });
  }
});

/**
 * POST /drone/set-mode
 * Set flight mode
 */
droneRouter.post('/set-mode', async (req, res) => {
  try {
    const { mode } = req.body;

    if (!mode) {
      return res.status(400).json({ error: 'Flight mode is required' });
    }

    const mavlinkService = getMAVLinkService();

    if (!mavlinkService.isConnected()) {
      return res.status(400).json({ error: 'Not connected to drone' });
    }

    const success = await mavlinkService.setMode(mode);

    if (success) {
      return res.json({
        success: true,
        message: `Mode set to ${mode}`
      });
    } else {
      return res.status(500).json({
        error: 'Failed to set mode'
      });
    }
  } catch (error: any) {
    console.error('Set mode error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to set mode'
    });
  }
});

export default droneRouter;


