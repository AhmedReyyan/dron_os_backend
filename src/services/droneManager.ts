/**
 * Drone Manager - Handles multiple drone connections
 * Similar to Python Server that manages multiple client connections
 */

import { EventEmitter } from 'events';
import { getMAVLinkService } from './mavlinkService';
import { prisma } from '../index';

interface DroneConnection {
  droneId: number;
  userId: number;
  uin: string;
  name: string;
  connectionString: string;
  mavlinkService: any;
  lastUpdate: number;
  telemetry: {
    lat: number;
    lon: number;
    alt: number;
    relAlt: number;
    armed: boolean;
    mode: string;
    groundSpeed: number;
    heading: number;
    throttle: number;
    battery: number;
    satellites: number;
  };
}

class DroneManager extends EventEmitter {
  private connections: Map<number, DroneConnection> = new Map();

  /**
   * Register a new drone for a user
   */
  async registerDrone(
    userId: number,
    name: string,
    uin: string,
    connectionString: string,
    ipAddress: string,
    port: number
  ): Promise<number> {
    try {
      const drone = await prisma.drone.create({
        data: {
          userId,
          name,
          uin,
          connectionString,
          ipAddress,
          port,
        },
      });

      console.log(`[DroneManager] Registered drone ${name} (UIN: ${uin}) for user ${userId}`);
      return drone.id;
    } catch (error) {
      console.error('[DroneManager] Error registering drone:', error);
      throw error;
    }
  }

  /**
   * Connect to a drone's SITL
   */
  async connectDrone(droneId: number): Promise<boolean> {
    try {
      const drone = await prisma.drone.findUnique({ where: { id: droneId } });
      if (!drone) {
        throw new Error('Drone not found');
      }

      // Create a new MAVLink service for this drone
      const { default: MAVLinkService } = await import('./mavlinkService');
      const mavlinkService = new MAVLinkService();

      const success = await mavlinkService.connect(drone.connectionString);

      if (success) {
        // Store connection
        const connection: DroneConnection = {
          droneId: drone.id,
          userId: drone.userId,
          uin: drone.uin,
          name: drone.name,
          connectionString: drone.connectionString,
          mavlinkService,
          lastUpdate: Date.now(),
          telemetry: {
            lat: 0,
            lon: 0,
            alt: 0,
            relAlt: 0,
            armed: false,
            mode: 'UNKNOWN',
            groundSpeed: 0,
            heading: 0,
            throttle: 0,
            battery: 100,
            satellites: 0,
          },
        };

        this.connections.set(droneId, connection);

        // Listen for telemetry updates
        mavlinkService.on('telemetry', (data: any) => {
          connection.telemetry = { ...connection.telemetry, ...data };
          connection.lastUpdate = Date.now();

          // Update database
          prisma.drone.update({
            where: { id: droneId },
            data: {
              isConnected: true,
              lastSeen: new Date(),
              latitude: data.lat || connection.telemetry.lat,
              longitude: data.lon || connection.telemetry.lon,
              altitude: data.relAlt || connection.telemetry.relAlt,
            },
          }).catch(() => {});

          // Emit telemetry for WebSocket broadcasting
          this.emit('telemetry', {
            droneId,
            userId: drone.userId,
            uin: drone.uin,
            name: drone.name,
            ...connection.telemetry,
          });
        });

        await prisma.drone.update({
          where: { id: droneId },
          data: { isConnected: true },
        });

        console.log(`[DroneManager] ✅ Connected to drone ${drone.name} (${drone.uin})`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[DroneManager] Error connecting drone:', error);
      return false;
    }
  }

  /**
   * Disconnect a drone
   */
  async disconnectDrone(droneId: number): Promise<void> {
    const connection = this.connections.get(droneId);
    if (connection) {
      connection.mavlinkService.disconnect();
      this.connections.delete(droneId);

      await prisma.drone.update({
        where: { id: droneId },
        data: { isConnected: false },
      });

      console.log(`[DroneManager] Disconnected drone ${connection.name}`);
    }
  }

  /**
   * Get all connected drones
   */
  getAllConnectedDrones() {
    return Array.from(this.connections.values()).map((conn) => ({
      droneId: conn.droneId,
      userId: conn.userId,
      uin: conn.uin,
      name: conn.name,
      telemetry: conn.telemetry,
      lastUpdate: conn.lastUpdate,
    }));
  }

  /**
   * Get drones for a specific user
   */
  async getUserDrones(userId: number) {
    const drones = await prisma.drone.findMany({
      where: { userId },
    });
    return drones;
  }

  /**
   * Send message to specific drone (admin feature)
   */
  async sendMessageToDrone(
    droneId: number,
    message: string,
    importance: 'normal' | 'important' | 'warning' | 'critical'
  ): Promise<boolean> {
    const connection = this.connections.get(droneId);
    if (!connection) {
      return false;
    }

    // Emit message event that WebSocket will broadcast to specific client
    this.emit('message', {
      droneId,
      userId: connection.userId,
      uin: connection.uin,
      message,
      importance,
      timestamp: Date.now(),
    });

    console.log(`[DroneManager] 📨 Message sent to ${connection.name}: [${importance}] ${message}`);
    return true;
  }

  /**
   * Send message to all drones
   */
  async broadcastMessage(
    message: string,
    importance: 'normal' | 'important' | 'warning' | 'critical'
  ): Promise<number> {
    let sentCount = 0;
    for (const [droneId] of this.connections) {
      const success = await this.sendMessageToDrone(droneId, message, importance);
      if (success) sentCount++;
    }
    console.log(`[DroneManager] 📢 Broadcast message to ${sentCount} drones`);
    return sentCount;
  }
}

// Singleton instance
let droneManagerInstance: DroneManager | null = null;

export function getDroneManager(): DroneManager {
  if (!droneManagerInstance) {
    droneManagerInstance = new DroneManager();
  }
  return droneManagerInstance;
}

export default DroneManager;

