/**
 * Drone Manager - Pure in-memory drone connection management
 * No database - all state managed in memory via WebSocket
 */

import { EventEmitter } from 'events';
import { getMAVLinkService } from './mavlinkService';

interface DroneConnection {
  droneId: number;
  userId: number;
  uin: string;
  name: string;
  connectionString: string;
  ipAddress: string;
  port: number;
  mavlinkService: any;
  lastUpdate: number;
  isConnected: boolean;
  telemetry: {
    lat: number;
    lon: number;
    alt: number;
    relAlt: number;
    armed: boolean;
    mode: string;
    groundSpeed: number;
    airSpeed: number;
    heading: number;
    throttle: number;
    battery: number;
    satellites: number;
  };
}

class DroneManager extends EventEmitter {
  private connections: Map<number, DroneConnection> = new Map();
  private nextDroneId: number = 1;

  /**
   * Register a new drone (in-memory only)
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
      const droneId = this.nextDroneId++;
      
      console.log(`[DroneManager] Registered drone ${name} (UIN: ${uin}) for user ${userId} (ID: ${droneId})`);
      return droneId;
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
      // Get drone info from connections if it exists, or create placeholder
      const existingConn = this.connections.get(droneId);
      
      if (!existingConn) {
        console.error(`[DroneManager] Drone ${droneId} not found in connections`);
        return false;
      }

      const { connectionString, userId, uin, name } = existingConn;

      // Create a new MAVLink service for this drone
      const { default: MAVLinkService } = await import('./mavlinkService');
      const mavlinkService = new MAVLinkService();

      // Initialize telemetry state
      const connection: DroneConnection = {
        droneId,
        userId,
        uin,
        name,
        connectionString,
        ipAddress: existingConn.ipAddress,
        port: existingConn.port,
        mavlinkService,
        lastUpdate: Date.now(),
        isConnected: false,
        telemetry: {
          lat: 0,
          lon: 0,
          alt: 0,
          relAlt: 0,
          armed: false,
          mode: 'UNKNOWN',
          groundSpeed: 0,
          airSpeed: 0,
          heading: 0,
          throttle: 0,
          battery: 0,
          satellites: 0,
        },
      };

      this.connections.set(droneId, connection);

      // Listen to MAVLink telemetry updates
      mavlinkService.on('telemetry', (data: any) => {
        connection.telemetry = { ...connection.telemetry, ...data };
        connection.lastUpdate = Date.now();

        // REAL-TIME: Emit to WebSocket immediately with ALL data
        this.emit('telemetry', {
          droneId,
          userId,
          uin,
          name,
          ...connection.telemetry,
        });
      });

      // Connect to the drone
      const success = await mavlinkService.connect(connectionString);

      if (success) {
        connection.isConnected = true;
        console.log(`[DroneManager] ✅ Connected to drone ${name} (${uin})`);
      } else {
        console.error(`[DroneManager] ❌ Failed to connect to drone ${name} (${uin})`);
      }

      return success;
    } catch (error) {
      console.error('[DroneManager] Error connecting to drone:', error);
      return false;
    }
  }

  /**
   * Disconnect from a drone
   */
  async disconnectDrone(droneId: number): Promise<void> {
    const connection = this.connections.get(droneId);
    if (!connection) return;

    console.log(`[DroneManager] Disconnecting drone ${connection.name} (${droneId})`);

    connection.mavlinkService?.disconnect();
    this.connections.delete(droneId);

    this.emit('disconnected', { droneId });
  }

  /**
   * Register drone with initial connection info (called before connectDrone)
   */
  initializeDrone(
    droneId: number,
    userId: number,
    name: string,
    uin: string,
    connectionString: string,
    ipAddress: string,
    port: number
  ): void {
    this.connections.set(droneId, {
      droneId,
      userId,
      uin,
      name,
      connectionString,
      ipAddress,
      port,
      mavlinkService: null,
      lastUpdate: Date.now(),
      isConnected: false,
      telemetry: {
        lat: 0,
        lon: 0,
        alt: 0,
        relAlt: 0,
        armed: false,
        mode: 'UNKNOWN',
        groundSpeed: 0,
        airSpeed: 0,
        heading: 0,
        throttle: 0,
        battery: 0,
        satellites: 0,
      },
    });
  }

  /**
   * Get all active drones
   */
  getActiveDrones(): any[] {
    const drones: any[] = [];
    
    this.connections.forEach((conn) => {
      if (conn.isConnected) {
        drones.push({
          id: conn.droneId,
          userId: conn.userId,
          name: conn.name,
          uin: conn.uin,
          latitude: conn.telemetry.lat,
          longitude: conn.telemetry.lon,
          altitude: conn.telemetry.relAlt,
          isConnected: conn.isConnected,
          lastSeen: new Date(conn.lastUpdate).toISOString(),
        });
      }
    });

    return drones;
  }

  /**
   * Get ALL drones (for admin)
   */
  getAllDrones(): any[] {
    const drones: any[] = [];
    
    this.connections.forEach((conn) => {
      drones.push({
        id: conn.droneId,
        userId: conn.userId,
        name: conn.name,
        uin: conn.uin,
        latitude: conn.telemetry.lat,
        longitude: conn.telemetry.lon,
        altitude: conn.telemetry.relAlt,
        isConnected: conn.isConnected,
        lastSeen: new Date(conn.lastUpdate).toISOString(),
        mode: conn.telemetry.mode,
        armed: conn.telemetry.armed,
        battery: conn.telemetry.battery,
      });
    });

    return drones;
  }

  /**
   * Get connection info
   */
  getConnection(droneId: number): DroneConnection | undefined {
    return this.connections.get(droneId);
  }

  /**
   * Send ARM command to specific drone
   */
  async armDrone(droneId: number): Promise<boolean> {
    const connection = this.connections.get(droneId);
    if (!connection || !connection.mavlinkService) {
      console.error(`[DroneManager] Cannot arm - drone ${droneId} not found or not connected`);
      return false;
    }

    console.log(`[DroneManager] 🔧 Sending ARM command to drone ${connection.name} (${droneId})`);
    return await connection.mavlinkService.arm();
  }

  /**
   * Send DISARM command to specific drone
   */
  async disarmDrone(droneId: number): Promise<boolean> {
    const connection = this.connections.get(droneId);
    if (!connection || !connection.mavlinkService) {
      console.error(`[DroneManager] Cannot disarm - drone ${droneId} not found or not connected`);
      return false;
    }

    console.log(`[DroneManager] 🔧 Sending DISARM command to drone ${connection.name} (${droneId})`);
    return await connection.mavlinkService.disarm();
  }

  /**
   * Set flight mode for specific drone
   */
  async setDroneMode(droneId: number, mode: string): Promise<boolean> {
    const connection = this.connections.get(droneId);
    if (!connection || !connection.mavlinkService) {
      console.error(`[DroneManager] Cannot set mode - drone ${droneId} not found or not connected`);
      return false;
    }

    console.log(`[DroneManager] 🔧 Setting mode to ${mode} for drone ${connection.name} (${droneId})`);
    return await connection.mavlinkService.setMode(mode);
  }

  /**
   * Get drone by userId (for sending commands to user's own drone)
   */
  getDroneByUserId(userId: number): DroneConnection | undefined {
    for (const [droneId, conn] of this.connections.entries()) {
      if (conn.userId === userId && conn.isConnected) {
        return conn;
      }
    }
    return undefined;
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
