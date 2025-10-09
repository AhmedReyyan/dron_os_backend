/**
 * WebSocket Service for Real-time Drone Data Streaming
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { getMAVLinkService } from './mavlinkService';
import { getDroneManager } from './droneManager';
import type { DronePosition, BatteryStatus, HeartbeatData, GPSData } from './mavlinkService';

export interface WebSocketMessage {
  type: 'position' | 'battery' | 'heartbeat' | 'gps' | 'status' | 'error' | 'connected' | 'disconnected';
  data: any;
  timestamp: number;
}

class DroneWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private mavlinkService = getMAVLinkService();
  private droneData: {
    position: DronePosition | null;
    battery: BatteryStatus | null;
    heartbeat: HeartbeatData | null;
    gps: GPSData | null;
  } = {
    position: null,
    battery: null,
    heartbeat: null,
    gps: null
  };

  /**
   * Initialize WebSocket server
   */
  public initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/drone'
    });

    console.log('[WebSocket] Server initialized on /ws/drone');

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.setupMAVLinkListeners();
  }

  private handleConnection(ws: WebSocket): void {
    console.log('[WebSocket] New client connected');
    this.clients.add(ws);

    // Send current connection status
    this.sendToClient(ws, {
      type: 'status',
      data: {
        connected: this.mavlinkService.isConnected(),
        ...this.droneData
      },
      timestamp: Date.now()
    });

    ws.on('message', (message: string) => {
      this.handleMessage(ws, message);
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, message: string): void {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'connect':
          this.handleConnectRequest(ws, data.connectionString);
          break;
        case 'disconnect':
          this.handleDisconnectRequest(ws);
          break;
        case 'arm':
          this.handleArmRequest(ws);
          break;
        case 'disarm':
          this.handleDisarmRequest(ws);
          break;
        case 'ping':
          this.sendToClient(ws, {
            type: 'status',
            data: { connected: this.mavlinkService.isConnected() },
            timestamp: Date.now()
          });
          break;
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  private async handleConnectRequest(ws: WebSocket, connectionString: string): Promise<void> {
    console.log('[WebSocket] Connection request:', connectionString);

    try {
      const success = await this.mavlinkService.connect(connectionString);
      
      if (success) {
        this.broadcast({
          type: 'connected',
          data: { message: 'Successfully connected to SITL' },
          timestamp: Date.now()
        });
      } else {
        this.sendToClient(ws, {
          type: 'error',
          data: { message: 'Failed to connect to SITL' },
          timestamp: Date.now()
        });
      }
    } catch (error: any) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: error.message || 'Connection error' },
        timestamp: Date.now()
      });
    }
  }

  private handleDisconnectRequest(ws: WebSocket): void {
    console.log('[WebSocket] Disconnect request');
    this.mavlinkService.disconnect();
    this.broadcast({
      type: 'disconnected',
      data: { message: 'Disconnected from SITL' },
      timestamp: Date.now()
    });
  }

  private async handleArmRequest(ws: WebSocket): Promise<void> {
    console.log('[WebSocket] Arm request');
    const success = await this.mavlinkService.arm();
    
    this.sendToClient(ws, {
      type: 'status',
      data: { 
        message: success ? 'Arm command sent' : 'Failed to arm',
        armed: success
      },
      timestamp: Date.now()
    });
  }

  private async handleDisarmRequest(ws: WebSocket): Promise<void> {
    console.log('[WebSocket] Disarm request');
    const success = await this.mavlinkService.disarm();
    
    this.sendToClient(ws, {
      type: 'status',
      data: { 
        message: success ? 'Disarm command sent' : 'Failed to disarm',
        armed: !success
      },
      timestamp: Date.now()
    });
  }

  private setupMAVLinkListeners(): void {
    this.mavlinkService.on('connected', () => {
      console.log('[WebSocket] MAVLink connected');
      this.broadcast({
        type: 'connected',
        data: { message: 'MAVLink connection established' },
        timestamp: Date.now()
      });
    });

    this.mavlinkService.on('disconnected', () => {
      console.log('[WebSocket] MAVLink disconnected');
      this.broadcast({
        type: 'disconnected',
        data: { message: 'MAVLink connection lost' },
        timestamp: Date.now()
      });
    });

    this.mavlinkService.on('position', (position: DronePosition) => {
      this.droneData.position = position;
      this.broadcast({
        type: 'position',
        data: position,
        timestamp: Date.now()
      });
    });

    this.mavlinkService.on('battery', (battery: BatteryStatus) => {
      this.droneData.battery = battery;
      this.broadcast({
        type: 'battery',
        data: battery,
        timestamp: Date.now()
      });
    });

    this.mavlinkService.on('heartbeat', (heartbeat: HeartbeatData) => {
      this.droneData.heartbeat = heartbeat;
      this.broadcast({
        type: 'heartbeat',
        data: heartbeat,
        timestamp: Date.now()
      });
    });

    this.mavlinkService.on('gps', (gps: GPSData) => {
      this.droneData.gps = gps;
      this.broadcast({
        type: 'gps',
        data: gps,
        timestamp: Date.now()
      });
    });

    // Listen for full telemetry updates
    this.mavlinkService.on('telemetry', (data: any) => {
      this.broadcast({
        type: 'telemetry',
        data: data,
        timestamp: Date.now()
      });
    });

    // Setup DroneManager listeners for multi-drone support
    const droneManager = getDroneManager();
    
    droneManager.on('telemetry', (droneData: any) => {
      // Broadcast telemetry from any connected drone
      this.broadcast({
        type: 'telemetry',
        data: droneData,
        timestamp: Date.now()
      });
    });

    droneManager.on('message', (messageData: any) => {
      // Broadcast admin messages to specific users/drones
      this.broadcast({
        type: 'message' as any,
        data: messageData,
        timestamp: Date.now()
      });
    });

    this.mavlinkService.on('error', (error: any) => {
      console.error('[WebSocket] MAVLink error:', error);
      this.broadcast({
        type: 'error',
        data: { message: error.message || 'MAVLink error' },
        timestamp: Date.now()
      });
    });
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  public close(): void {
    if (this.wss) {
      this.clients.forEach((client) => {
        client.close();
      });
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      console.log('[WebSocket] Server closed');
    }
  }
}

let wsServiceInstance: DroneWebSocketService | null = null;

export function getWebSocketService(): DroneWebSocketService {
  if (!wsServiceInstance) {
    wsServiceInstance = new DroneWebSocketService();
  }
  return wsServiceInstance;
}

export default DroneWebSocketService;


