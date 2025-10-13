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
  private remoteAddress: string = ''; // Store the IP where telemetry comes FROM
  private remotePort: number = 14551; // Default SITL command port
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
          // Learn the remote address AND port from incoming telemetry
          if (!this.remoteAddress || this.remoteAddress !== rinfo.address) {
            this.remoteAddress = rinfo.address;
            this.remotePort = rinfo.port; // Learn the source port from SITL
            console.log(`[MAVLink] 📡 Detected telemetry from: ${rinfo.address}:${rinfo.port}`);
            console.log(`[MAVLink] 📤 Commands will be sent back to: ${this.remoteAddress}:${this.remotePort}`);
            console.log(`[MAVLink] ℹ️  If using SITL with --out=udp:, commands may need TCP connection to SITL port (e.g., 5792)`);
          }
          
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
              // Emit immediate update for armed state change
              this.emit('telemetry', this.droneState);
            }
            if (oldMode !== this.droneState.mode) {
              console.log(`[MAVLink] 🎮 MODE CHANGED: ${oldMode} → ${this.droneState.mode}`);
              // Emit immediate update for mode change
              this.emit('telemetry', this.droneState);
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

  /**
   * Build MAVLink v2 COMMAND_LONG packet
   */
  private buildCommandLongPacket(command: number, param1: number = 0, param2: number = 0, 
                                   param3: number = 0, param4: number = 0, param5: number = 0, 
                                   param6: number = 0, param7: number = 0): Buffer {
    const payload = Buffer.alloc(33);
    
    // COMMAND_LONG payload structure (33 bytes)
    payload.writeFloatLE(param1, 0);  // param1
    payload.writeFloatLE(param2, 4);  // param2
    payload.writeFloatLE(param3, 8);  // param3
    payload.writeFloatLE(param4, 12); // param4
    payload.writeFloatLE(param5, 16); // param5
    payload.writeFloatLE(param6, 20); // param6
    payload.writeFloatLE(param7, 24); // param7
    payload.writeUInt16LE(command, 28); // command
    payload.writeUInt8(this.systemId || 1, 30);    // target_system
    payload.writeUInt8(this.componentId || 1, 31); // target_component
    payload.writeUInt8(0, 32);        // confirmation
    
    return this.buildMavlinkV2Packet(76, payload); // MSG_ID 76 = COMMAND_LONG
  }

  /**
   * Build MAVLink v2 SET_MODE packet
   */
  private buildSetModePacket(customMode: number): Buffer {
    const payload = Buffer.alloc(6);
    
    // SET_MODE payload structure (6 bytes)
    payload.writeUInt32LE(customMode, 0); // custom_mode
    payload.writeUInt8(this.systemId || 1, 4); // target_system
    payload.writeUInt8(1, 5); // base_mode (MAV_MODE_FLAG_CUSTOM_MODE_ENABLED)
    
    return this.buildMavlinkV2Packet(11, payload); // MSG_ID 11 = SET_MODE
  }

  /**
   * Build MAVLink v2 packet with proper header and checksum
   */
  private buildMavlinkV2Packet(msgId: number, payload: Buffer): Buffer {
    const header = Buffer.alloc(10);
    const msgIdBytes = Buffer.alloc(3);
    
    // MAVLink v2 header
    header.writeUInt8(0xFD, 0);           // STX (start byte)
    header.writeUInt8(payload.length, 1); // Payload length
    header.writeUInt8(0, 2);              // Incompatibility flags
    header.writeUInt8(0, 3);              // Compatibility flags
    header.writeUInt8(0, 4);              // Packet sequence
    header.writeUInt8(255, 5);            // System ID (GCS)
    header.writeUInt8(190, 6);            // Component ID (MAV_COMP_ID_MISSIONPLANNER)
    
    // Message ID (24-bit, little-endian)
    msgIdBytes.writeUIntLE(msgId, 0, 3);
    header.writeUInt8(msgIdBytes[0], 7);
    header.writeUInt8(msgIdBytes[1], 8);
    header.writeUInt8(msgIdBytes[2], 9);
    
    // Combine header and payload
    const packet = Buffer.concat([header, payload]);
    
    // Calculate CRC (MAVLink X.25 CRC)
    const crc = this.calculateCRC(packet, msgId);
    const crcBuffer = Buffer.alloc(2);
    crcBuffer.writeUInt16LE(crc, 0);
    
    return Buffer.concat([packet, crcBuffer]);
  }

  /**
   * Calculate MAVLink CRC-16/MCRF4XX (X.25)
   */
  private calculateCRC(buffer: Buffer, msgId: number): number {
    // CRC extra bytes for common MAVLink messages
    const crcExtra: { [key: number]: number } = {
      11: 89,  // SET_MODE
      76: 152, // COMMAND_LONG
    };
    
    let crc = 0xFFFF;
    
    // Process buffer (skip magic byte)
    for (let i = 1; i < buffer.length; i++) {
      let tmp = buffer[i] ^ (crc & 0xFF);
      tmp ^= (tmp << 4) & 0xFF;
      crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
    }
    
    // Add CRC_EXTRA byte
    if (crcExtra[msgId] !== undefined) {
      let tmp = crcExtra[msgId] ^ (crc & 0xFF);
      tmp ^= (tmp << 4) & 0xFF;
      crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
    }
    
    return crc;
  }

  /**
   * Send MAVLink packet via UDP
   * IMPORTANT: This sends commands back to the SAME address where telemetry came from
   */
  private sendPacket(packet: Buffer): boolean {
    if (!this.connected || !this.connection) {
      return false;
    }

    try {
      // Use the address we learned from incoming telemetry
      if (!this.remoteAddress) {
        console.error('[MAVLink] ❌ Cannot send - no remote address learned yet. Wait for telemetry...');
        return false;
      }
      
      // For SITL Instance 3, send commands to port 5792 (available MAVLink port)
      // Port 5790 is used by console, so we use 5792
      const targetHost = this.remoteAddress;
      const targetPort = 5792; // SITL Instance 3 MAVLink command port
      
      console.log(`[MAVLink] 📤 Sending command to ${targetHost}:${targetPort} (SITL Instance 3)`);
      
      // Send packet via UDP
      this.connection.send(packet, 0, packet.length, targetPort, targetHost, (err: any) => {
        if (err) {
          console.error(`[MAVLink] ❌ Error sending packet to ${targetHost}:${targetPort}:`, err);
        } else {
          console.log(`[MAVLink] ✅ Packet sent successfully to ${targetHost}:${targetPort}`);
        }
      });
      
      return true;
    } catch (error) {
      console.error('[MAVLink] Error sending packet:', error);
      return false;
    }
  }

  public async arm(): Promise<boolean> {
    if (!this.connected || !this.connection) {
      console.error('[MAVLink] Cannot arm - not connected');
      return false;
    }

    try {
      console.log('[MAVLink] Sending ARM command...');
      
      // MAV_CMD_COMPONENT_ARM_DISARM (400)
      // param1: 1 = arm, 0 = disarm
      const packet = this.buildCommandLongPacket(400, 1);
      const success = this.sendPacket(packet);
      
      if (success) {
        console.log('[MAVLink] ✅ ARM command sent');
      }
      
      return success;
    } catch (error) {
      console.error('[MAVLink] Error arming:', error);
      return false;
    }
  }

  public async disarm(): Promise<boolean> {
    if (!this.connected || !this.connection) {
      console.error('[MAVLink] Cannot disarm - not connected');
      return false;
    }

    try {
      console.log('[MAVLink] Sending DISARM command...');
      
      // MAV_CMD_COMPONENT_ARM_DISARM (400)
      // param1: 0 = disarm, 1 = arm
      const packet = this.buildCommandLongPacket(400, 0);
      const success = this.sendPacket(packet);
      
      if (success) {
        console.log('[MAVLink] ✅ DISARM command sent');
      }
      
      return success;
    } catch (error) {
      console.error('[MAVLink] Error disarming:', error);
      return false;
    }
  }

  /**
   * Set flight mode
   * @param mode Flight mode name (e.g., 'STABILIZE', 'GUIDED', 'LOITER')
   */
  public async setMode(mode: string): Promise<boolean> {
    if (!this.connected || !this.connection) {
      console.error('[MAVLink] Cannot set mode - not connected');
      return false;
    }

    try {
      // ArduCopter flight mode mapping
      const modes: { [key: string]: number } = {
        'STABILIZE': 0,
        'ACRO': 1,
        'ALT_HOLD': 2,
        'AUTO': 3,
        'GUIDED': 4,
        'LOITER': 5,
        'RTL': 6,
        'CIRCLE': 7,
        'LAND': 9,
        'POSHOLD': 16,
        'BRAKE': 17
      };

      const customMode = modes[mode.toUpperCase()];
      
      if (customMode === undefined) {
        console.error(`[MAVLink] Unknown flight mode: ${mode}`);
        return false;
      }

      console.log(`[MAVLink] Setting mode to ${mode} (${customMode})...`);
      
      const packet = this.buildSetModePacket(customMode);
      const success = this.sendPacket(packet);
      
      if (success) {
        console.log(`[MAVLink] ✅ SET_MODE command sent: ${mode}`);
      }
      
      return success;
    } catch (error) {
      console.error('[MAVLink] Error setting mode:', error);
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


