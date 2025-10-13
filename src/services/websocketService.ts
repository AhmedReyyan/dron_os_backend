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

interface ClientInfo {
  userId: number | null;
  isAdmin: boolean;
  authenticated: boolean;
  connectedAt: number;
}

class DroneWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientInfo> = new Map();
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
    console.log('[WebSocket] New client connected, awaiting authentication...');
    
    // Initialize client with unauthenticated state
    this.clients.set(ws, {
      userId: null,
      isAdmin: false,
      authenticated: false,
      connectedAt: Date.now()
    });

    // Send current connection status
    this.sendToClient(ws, {
      type: 'status',
      data: {
        connected: this.mavlinkService.isConnected(),
        ...this.droneData,
        requiresAuth: true
      },
      timestamp: Date.now()
    });

    ws.on('message', (message: string) => {
      this.handleMessage(ws, message);
    });

    ws.on('close', () => {
      const clientInfo = this.clients.get(ws);
      console.log(`[WebSocket] Client disconnected (User: ${clientInfo?.userId || 'unknown'})`);
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
        case 'auth':
          this.handleAuthentication(ws, data);
          break;
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
        case 'set_mode':
          this.handleSetModeRequest(ws, data.mode);
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

  /**
   * Handle client authentication
   */
  private handleAuthentication(ws: WebSocket, data: any): void {
    const { userId, isAdmin } = data;
    
    if (!userId) {
      this.sendToClient(ws, {
        type: 'error' as any,
        data: { message: 'userId required for authentication' },
        timestamp: Date.now()
      });
      return;
    }

    // Update client info
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.userId = userId;
      clientInfo.isAdmin = isAdmin || false;
      clientInfo.authenticated = true;
      this.clients.set(ws, clientInfo);
      
      console.log(`[WebSocket] ✅ Client authenticated: User ${userId} (Admin: ${isAdmin})`);
      
      // Send confirmation
      this.sendToClient(ws, {
        type: 'status' as any,
        data: { 
          authenticated: true,
          userId,
          isAdmin,
          message: 'Authentication successful'
        },
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
    const clientInfo = this.clients.get(ws);
    if (!clientInfo || !clientInfo.userId) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Not authenticated' },
        timestamp: Date.now()
      });
      return;
    }

    console.log(`[WebSocket] Arm request from user ${clientInfo.userId}`);
    
    // Get user's drone from DroneManager
    const droneManager = getDroneManager();
    const drone = droneManager.getDroneByUserId(clientInfo.userId);
    
    if (!drone) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'No connected drone found for your account' },
        timestamp: Date.now()
      });
      return;
    }

    const success = await droneManager.armDrone(drone.droneId);
    
    this.sendToClient(ws, {
      type: 'status',
      data: { 
        message: success ? `Arm command sent to ${drone.name}` : 'Failed to arm',
        armed: success
      },
      timestamp: Date.now()
    });
  }

  private async handleDisarmRequest(ws: WebSocket): Promise<void> {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo || !clientInfo.userId) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Not authenticated' },
        timestamp: Date.now()
      });
      return;
    }

    console.log(`[WebSocket] Disarm request from user ${clientInfo.userId}`);
    
    // Get user's drone from DroneManager
    const droneManager = getDroneManager();
    const drone = droneManager.getDroneByUserId(clientInfo.userId);
    
    if (!drone) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'No connected drone found for your account' },
        timestamp: Date.now()
      });
      return;
    }

    const success = await droneManager.disarmDrone(drone.droneId);
    
    this.sendToClient(ws, {
      type: 'status',
      data: { 
        message: success ? `Disarm command sent to ${drone.name}` : 'Failed to disarm',
        armed: !success
      },
      timestamp: Date.now()
    });
  }

  private async handleSetModeRequest(ws: WebSocket, mode: string): Promise<void> {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo || !clientInfo.userId) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Not authenticated' },
        timestamp: Date.now()
      });
      return;
    }

    if (!mode) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Mode parameter required' },
        timestamp: Date.now()
      });
      return;
    }

    console.log(`[WebSocket] Set mode request: ${mode} from user ${clientInfo.userId}`);
    
    // Get user's drone from DroneManager
    const droneManager = getDroneManager();
    const drone = droneManager.getDroneByUserId(clientInfo.userId);
    
    if (!drone) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'No connected drone found for your account' },
        timestamp: Date.now()
      });
      return;
    }

    const success = await droneManager.setDroneMode(drone.droneId, mode);
    
    this.sendToClient(ws, {
      type: 'status',
      data: { 
        message: success ? `Mode set to ${mode} for ${drone.name}` : 'Failed to set mode',
        mode: success ? mode : undefined
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
    // NOTE: Removed old mavlinkService telemetry listener
    // Now using DroneManager which includes userId for proper filtering
    
    // Setup DroneManager listeners for multi-drone support
    const droneManager = getDroneManager();
    
    droneManager.on('telemetry', (droneData: any) => {
      // Broadcast telemetry with server-side filtering (reduced logging)
      this.broadcastTelemetryFiltered(droneData);
    });

    droneManager.on('message', (messageData: any) => {
      // Broadcast admin messages to specific users/drones
      console.log(`[WebSocket] Broadcasting message to user ${messageData.targetUserId}: ${messageData.message}`);
      
      this.broadcastMessageFiltered(messageData);
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

  /**
   * Broadcast message to all authenticated clients
   */
  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((clientInfo, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  /**
   * Broadcast telemetry with server-side filtering
   * Only sends to: 1) Drone owner, 2) Admins
   */
  private broadcastTelemetryFiltered(droneData: any): void {
    const targetUserId = droneData.userId;
    
    this.clients.forEach((clientInfo, ws) => {
      // Only send if:
      // 1. Client is authenticated, AND
      // 2. Client owns this drone OR is admin
      if (clientInfo.authenticated && ws.readyState === WebSocket.OPEN) {
        const shouldReceive = clientInfo.isAdmin || clientInfo.userId === targetUserId;
        
        if (shouldReceive) {
          // Send data (logging reduced for performance)
          ws.send(JSON.stringify({
            type: 'telemetry',
            data: droneData,
            timestamp: Date.now()
          }));
        }
      }
    });
  }

  /**
   * Broadcast messages with filtering
   * Only sends to the target user (drone owner) or all users if targetUserId is null
   */
  private broadcastMessageFiltered(messageData: any): void {
    const targetUserId = messageData.targetUserId;
    
    this.clients.forEach((clientInfo, ws) => {
      // Send to target user OR broadcast to all authenticated users if targetUserId is null
      const shouldSend = clientInfo.authenticated && 
                        ws.readyState === WebSocket.OPEN &&
                        (targetUserId === null || clientInfo.userId === targetUserId);
      
      if (shouldSend) {
        ws.send(JSON.stringify({
          type: 'message',
          data: {
            message: messageData.message,
            importance: messageData.importance,
            timestamp: messageData.timestamp,
            droneName: messageData.targetDroneName,
          },
          timestamp: Date.now()
        }));
        
        console.log(`[WebSocket] ✅ Message delivered to user ${clientInfo.userId} (target: ${targetUserId || 'broadcast'})`);
      }
    });
  }

  public close(): void {
    if (this.wss) {
      this.clients.forEach((clientInfo, ws) => {
        ws.close();
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


