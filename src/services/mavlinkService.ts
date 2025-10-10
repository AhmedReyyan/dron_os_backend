/**
 * MAVLink Service for SITL Connection
 * Handles connection to SITL and telemetry data streaming
 */

import { EventEmitter } from 'events';

export interface DronePosition {
  lat: number;
  lon: number;
  alt: number;
  relative_alt: number;
  vx: number;
  vy: number;
  vz: number;
  hdg: number;
  time_boot_ms: number;
}

export interface BatteryStatus {
  id: number;
  battery_function: number;
  type: number;
  temperature: number;
  battery_remaining: number;
}

export interface HeartbeatData {
  type: number;
  autopilot: number;
  base_mode: number;
  custom_mode: number;
  system_status: number;
}

export interface GPSData {
  time_usec: number;
  fix_type: number;
  lat: number;
  lon: number;
  alt: number;
  vel: number;
  satellites_visible: number;
}

export interface DroneData {
  position?: DronePosition;
  battery?: BatteryStatus;
  heartbeat?: HeartbeatData;
  gps?: GPSData;
  connected: boolean;
  timestamp: number;
}

class MAVLinkService extends EventEmitter {
  private connection: any = null;
  private connected: boolean = false;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private connectionString: string = '';
  private systemId: number = 0;
  private componentId: number = 0;
  private droneState: {
    armed: boolean;
    mode: string;
    lat: number;
    lon: number;
    alt: number;
    relAlt: number;
    groundSpeed: number;
    airSpeed: number;
    heading: number;
    throttle: number;
    battery: number;
    satellites: number;
  } = {
    armed: false,
    mode: 'UNKNOWN',
    lat: 0,
    lon: 0,
    alt: 0,
    relAlt: 0,
    groundSpeed: 0,
    airSpeed: 0,
    heading: 0,
    throttle: 0,
    battery: 100,
    satellites: 0
  };

  constructor() {
    super();
  }

  /**
   * Connect to SITL via MAVLink
   */
  async connect(connectionString: string): Promise<boolean> {
    try {
      this.connectionString = connectionString;
      console.log(`[MAVLink] Attempting to connect to: ${connectionString}`);

      // Dynamic import of dgram for UDP
      const dgram = await import('dgram');
      
      // Parse connection string (format: protocol:host:port)
      const parts = connectionString.split(':');
      const protocol = parts[0];
      const host = parts[1] || '0.0.0.0';
      const port = parseInt(parts[2]);

      console.log(`[MAVLink] Protocol: ${protocol}, Host: ${host}, Port: ${port}`);

      // Create connection based on protocol
      if (protocol === 'udp' || protocol === 'udpin') {
        // For UDP, create a listening server
        const udpServer = dgram.createSocket('udp4');
        
        udpServer.on('error', (err) => {
          console.error(`[MAVLink] UDP server error: ${err}`);
          this.connected = false;
          this.emit('error', err);
        });

        udpServer.on('message', (msg, rinfo) => {
          // Parse MAVLink messages silently (no raw byte logs)
          this.handleRawMessage(msg);
        });

        udpServer.on('listening', () => {
          const addr = udpServer.address();
          console.log(`[MAVLink] UDP server listening on ${addr.address}:${addr.port}`);
          this.connected = true;
          this.emit('connected');
        });

        // Bind to the specified port
        udpServer.bind(port, host);
        this.connection = udpServer;
        
        return true;
      } else {
        throw new Error('Unsupported protocol. Use tcp or udp/udpin');
      }

      // Set up message handlers for TCP
      this.setupMessageHandlers();

      // Wait for heartbeat
      const heartbeatReceived = await this.waitForHeartbeat(10000);
      
      if (heartbeatReceived) {
        this.connected = true;
        console.log('[MAVLink] Connection established successfully');
        this.startDataStream();
        this.emit('connected');
        return true;
      } else {
        throw new Error('Heartbeat timeout - no data received from SITL');
      }
    } catch (error) {
      console.error('[MAVLink] Connection error:', error);
      this.connected = false;
      this.emit('error', error);
      return false;
    }
  }

  private handleRawMessage(buffer: Buffer): void {
    try {
      // MAVLink v2: 0xFD, v1: 0xFE
      if (buffer[0] === 0xFD && buffer.length >= 12) {
        const payloadLen = buffer[1];
        const msgId = buffer.readUIntLE(7, 3); // 24-bit message ID
        const payload = buffer.slice(10, 10 + payloadLen);
        this.parseMavlinkV2Message(msgId, payload);
      } else if (buffer[0] === 0xFE && buffer.length >= 8) {
        const payloadLen = buffer[1];
        const msgId = buffer[5];
        const payload = buffer.slice(6, 6 + payloadLen);
        this.parseMavlinkV2Message(msgId, payload);
      }
    } catch (e) {
      // Silent errors
    }
  }

  private lastDetailedLog: number = 0;
  
  private parseMavlinkV2Message(msgId: number, payload: Buffer): void {
    try {
      switch (msgId) {
        case 0: // HEARTBEAT - 9 bytes
          if (payload.length >= 9) {
            const customMode = payload.readUInt32LE(0); // offset 0-3
            const type = payload[4]; // offset 4
            const autopilot = payload[5]; // offset 5
            const baseMode = payload[6]; // offset 6
            const systemStatus = payload[7]; // offset 7
            
            const wasArmed = this.droneState.armed;
            this.droneState.armed = (baseMode & 128) !== 0; // MAV_MODE_FLAG_SAFETY_ARMED
            
            // ArduCopter flight modes
            const modeNames: {[key: number]: string} = {
              0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
              5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 16: 'POSHOLD', 17: 'BRAKE'
            };
            const oldMode = this.droneState.mode;
            this.droneState.mode = modeNames[customMode] || `MODE_${customMode}`;
            
            // Log changes only
            if (wasArmed !== this.droneState.armed) {
              console.log(`[MAVLink] ${this.droneState.armed ? '✅ ARMED' : '❌ DISARMED'}`);
            }
            if (oldMode !== this.droneState.mode) {
              console.log(`[MAVLink] 🎮 MODE: ${this.droneState.mode}`);
            }
          }
          break;
        
        case 33: // GLOBAL_POSITION_INT - 27 bytes (adjusted for actual payload)
          if (payload.length >= 27) {
            const timeBootMs = payload.readUInt32LE(0);
            const lat = payload.readInt32LE(4) / 1e7;
            const lon = payload.readInt32LE(8) / 1e7;
            const alt = payload.readInt32LE(12) / 1000;
            const relAlt = payload.readInt32LE(16) / 1000;
            
            console.log(`[MAVLink] 📍 GPS: Lat=${lat.toFixed(6)}, Lon=${lon.toFixed(6)}, Alt=${relAlt.toFixed(2)}m`);
            
            this.droneState.lat = lat;
            this.droneState.lon = lon;
            this.droneState.alt = alt;
            this.droneState.relAlt = relAlt;
            
            this.emit('position', { lat, lon, alt, relative_alt: relAlt });
          } else {
            console.log(`[MAVLink] ⚠️ GLOBAL_POSITION payload too short: ${payload.length} bytes`);
          }
          break;
        
        case 74: // VFR_HUD - 17 bytes (actual payload size)
          if (payload.length >= 17) {
            const airspeed = payload.readFloatLE(0);
            const groundspeed = payload.readFloatLE(4);
            const heading = payload.readInt16LE(8);
            const throttle = payload.readUInt16LE(10);
            const alt = payload.readFloatLE(12);
            
            console.log(`[MAVLink] 🚁 Speed=${groundspeed.toFixed(1)}m/s, Heading=${heading}°, Throttle=${throttle}%`);
            
            this.droneState.airSpeed = airspeed;
            this.droneState.groundSpeed = groundspeed;
            this.droneState.heading = heading;
            this.droneState.throttle = throttle;
          } else {
            console.log(`[MAVLink] ⚠️ VFR_HUD payload too short: ${payload.length} bytes`);
          }
          break;
        
        case 24: // GPS_RAW_INT - 30+ bytes
          if (payload.length >= 30) {
            const lat = payload.readInt32LE(8) / 1e7;
            const lon = payload.readInt32LE(12) / 1e7;
            const satellites = payload[29];
            if (this.droneState.satellites !== satellites) {
              this.droneState.satellites = satellites;
              console.log(`[MAVLink] 🛰️  GPS: ${satellites} satellites`);
            }
          }
          break;
        
        case 147: // BATTERY_STATUS - 36+ bytes
          if (payload.length >= 36) {
            const batteryRemaining = payload[35];
            if (Math.abs(this.droneState.battery - batteryRemaining) > 5) {
              this.droneState.battery = batteryRemaining;
              console.log(`[MAVLink] 🔋 Battery: ${batteryRemaining}%`);
            }
          }
          break;
      }
      
      // Log full decoded telemetry every 2 seconds
      const now = Date.now();
      if (now - this.lastDetailedLog > 2000) {
        this.lastDetailedLog = now;
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 DECODED TELEMETRY DATA:');
        console.log('───────────────────────────────────────────────────────');
        console.log(`📍 GPS Position:`);
        console.log(`   Latitude:  ${this.droneState.lat.toFixed(7)}°`);
        console.log(`   Longitude: ${this.droneState.lon.toFixed(7)}°`);
        console.log(`   Altitude (MSL): ${this.droneState.alt.toFixed(2)}m`);
        console.log(`   Altitude (Rel): ${this.droneState.relAlt.toFixed(2)}m`);
        console.log(`🛰️  GPS Satellites: ${this.droneState.satellites}`);
        console.log(`───────────────────────────────────────────────────────`);
        console.log(`🚁 Flight Data:`);
        console.log(`   Ground Speed: ${this.droneState.groundSpeed.toFixed(2)} m/s`);
        console.log(`   Air Speed:    ${this.droneState.airSpeed.toFixed(2)} m/s`);
        console.log(`   Heading:      ${this.droneState.heading}°`);
        console.log(`   Throttle:     ${this.droneState.throttle}%`);
        console.log(`───────────────────────────────────────────────────────`);
        console.log(`⚡ Status:`);
        console.log(`   Armed:   ${this.droneState.armed ? '✅ YES' : '❌ NO'}`);
        console.log(`   Mode:    ${this.droneState.mode}`);
        console.log(`   Battery: ${this.droneState.battery}%`);
        console.log('═══════════════════════════════════════════════════════\n');
      }
      
      // Emit full state periodically
      this.emit('telemetry', this.droneState);
    } catch (e) {
      // Silent parse errors
    }
  }

  private setupMessageHandlers(): void {
    if (!this.connection) return;

    this.connection.on('data', (message: any) => {
      try {
        this.handleMessage(message);
      } catch (error) {
        console.error('[MAVLink] Error handling message:', error);
      }
    });

    this.connection.on('error', (error: any) => {
      console.error('[MAVLink] Connection error:', error);
      this.connected = false;
      this.emit('error', error);
      this.attemptReconnect();
    });
  }

  private handleMessage(message: any): void {
    const messageType = message.header?.msgid || message.msgid;

    switch (messageType) {
      case 0: // HEARTBEAT
        this.handleHeartbeat(message);
        break;
      case 33: // GLOBAL_POSITION_INT
        this.handleGlobalPosition(message);
        break;
      case 24: // GPS_RAW_INT
        this.handleGPSRaw(message);
        break;
      case 147: // BATTERY_STATUS
        this.handleBatteryStatus(message);
        break;
    }
  }

  private handleHeartbeat(message: any): void {
    const heartbeat: HeartbeatData = {
      type: message.type,
      autopilot: message.autopilot,
      base_mode: message.base_mode,
      custom_mode: message.custom_mode,
      system_status: message.system_status
    };

    this.systemId = message.header?.sysid || message.sysid || 0;
    this.componentId = message.header?.compid || message.compid || 0;

    this.emit('heartbeat', heartbeat);
  }

  private handleGlobalPosition(message: any): void {
    const position: DronePosition = {
      lat: message.lat / 1e7,
      lon: message.lon / 1e7,
      alt: message.alt / 1000,
      relative_alt: message.relative_alt / 1000,
      vx: message.vx / 100,
      vy: message.vy / 100,
      vz: message.vz / 100,
      hdg: message.hdg / 100,
      time_boot_ms: message.time_boot_ms
    };

    this.emit('position', position);
  }

  private handleGPSRaw(message: any): void {
    const gps: GPSData = {
      time_usec: message.time_usec,
      fix_type: message.fix_type,
      lat: message.lat / 1e7,
      lon: message.lon / 1e7,
      alt: message.alt / 1000,
      vel: message.vel / 100,
      satellites_visible: message.satellites_visible
    };

    this.emit('gps', gps);
  }

  private handleBatteryStatus(message: any): void {
    const battery: BatteryStatus = {
      id: message.id,
      battery_function: message.battery_function,
      type: message.type,
      temperature: message.temperature / 100,
      battery_remaining: message.battery_remaining
    };

    this.emit('battery', battery);
  }

  private waitForHeartbeat(timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.connection?.removeListener('data', heartbeatHandler);
        resolve(false);
      }, timeout);

      const heartbeatHandler = (message: any) => {
        const messageType = message.header?.msgid || message.msgid;
        if (messageType === 0) {
          clearTimeout(timeoutId);
          this.connection?.removeListener('data', heartbeatHandler);
          resolve(true);
        }
      };

      this.connection?.on('data', heartbeatHandler);
    });
  }

  private startDataStream(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      if (this.connected) {
        this.emit('update', this.getCurrentData());
      }
    }, 200);
  }

  public getCurrentData(): DroneData {
    return {
      connected: this.connected,
      timestamp: Date.now()
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectInterval) return;

    console.log('[MAVLink] Attempting to reconnect...');
    this.reconnectInterval = setInterval(async () => {
      if (!this.connected && this.connectionString) {
        const success = await this.connect(this.connectionString);
        if (success && this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      }
    }, 5000);
  }

  public disconnect(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }

    this.connected = false;
    this.emit('disconnected');
    console.log('[MAVLink] Disconnected from SITL');
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async arm(): Promise<boolean> {
    if (!this.connected || !this.connection) {
      return false;
    }

    try {
      await this.connection.send({
        type: 'COMMAND_LONG',
        target_system: this.systemId,
        target_component: this.componentId,
        command: 400,
        confirmation: 0,
        param1: 1,
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0
      });
      return true;
    } catch (error) {
      console.error('[MAVLink] Error arming:', error);
      return false;
    }
  }

  public async disarm(): Promise<boolean> {
    if (!this.connected || !this.connection) {
      return false;
    }

    try {
      await this.connection.send({
        type: 'COMMAND_LONG',
        target_system: this.systemId,
        target_component: this.componentId,
        command: 400,
        confirmation: 0,
        param1: 0,
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0
      });
      return true;
    } catch (error) {
      console.error('[MAVLink] Error disarming:', error);
      return false;
    }
  }
}

// Singleton instance
let mavlinkServiceInstance: MAVLinkService | null = null;

export function getMAVLinkService(): MAVLinkService {
  if (!mavlinkServiceInstance) {
    mavlinkServiceInstance = new MAVLinkService();
  }
  return mavlinkServiceInstance;
}

export default MAVLinkService;


