/**
 * Session Service
 * Manages drone sessions and events instead of storing all telemetry
 */

import { prisma } from '../index';
import { DroneSession, DroneEvent } from '@prisma/client';

export interface SessionData {
  sessionId: string;
  userId: number;
  droneId: number;
  missionId?: number;
  startTime: Date;
  startBattery: number;
  startLatitude?: number;
  startLongitude?: number;
}

export interface EventData {
  sessionId: number;
  userId: number;
  droneId: number;
  missionId?: number;
  eventType: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  battery?: number;
  speed?: number;
  mode?: string;
  message?: string;
}

class SessionService {
  private activeSessions = new Map<string, SessionData>();
  // Per-session last event timestamps to throttle writes
  private lastEventTimestamps: Map<string, Record<string, number>> = new Map();
  private EVENT_COOLDOWN_MS = 3000; // 3s cooldown per event type

  /**
   * Start a new drone session
   */
  async startSession(data: SessionData): Promise<DroneSession> {
    const session = await prisma.droneSession.create({
      data: {
        sessionId: data.sessionId,
        userId: data.userId,
        droneId: data.droneId,
        missionId: data.missionId,
        startTime: data.startTime,
        startBattery: data.startBattery,
        startLatitude: data.startLatitude,
        startLongitude: data.startLongitude,
        status: 'active'
      }
    });

    // Store in memory for quick access
    this.activeSessions.set(data.sessionId, data);

    // Log session start event
    await this.logEvent({
      sessionId: session.id,
      userId: data.userId,
      droneId: data.droneId,
      missionId: data.missionId,
      eventType: 'session_started',
      latitude: data.startLatitude,
      longitude: data.startLongitude,
      battery: data.startBattery,
      message: `Drone session started with ${data.startBattery}% battery`
    });

    return session;
  }

  /**
   * End a drone session
   */
  async endSession(sessionId: string, endData: {
    endTime: Date;
    endBattery: number;
    endLatitude?: number;
    endLongitude?: number;
    totalDistance?: number;
    maxAltitude?: number;
    maxSpeed?: number;
    avgSpeed?: number;
  }): Promise<DroneSession | null> {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return null;

    const session = await prisma.droneSession.findFirst({
      where: { sessionId }
    });

    if (!session) return null;

    const batteryUsed = sessionData.startBattery - endData.endBattery;
    const flightDuration = Math.floor((endData.endTime.getTime() - session.startTime.getTime()) / 1000);

    const updatedSession = await prisma.droneSession.update({
      where: { id: session.id },
      data: {
        endTime: endData.endTime,
        endBattery: endData.endBattery,
        batteryUsed: batteryUsed,
        endLatitude: endData.endLatitude,
        endLongitude: endData.endLongitude,
        totalDistance: endData.totalDistance || 0,
        maxAltitude: endData.maxAltitude || 0,
        maxSpeed: endData.maxSpeed || 0,
        avgSpeed: endData.avgSpeed || 0,
        flightDuration: flightDuration,
        status: 'completed'
      }
    });

    // Remove from memory
    this.activeSessions.delete(sessionId);

    // Log session end event
    await this.logEvent({
      sessionId: session.id,
      userId: sessionData.userId,
      droneId: sessionData.droneId,
      missionId: sessionData.missionId,
      eventType: 'session_ended',
      latitude: endData.endLatitude,
      longitude: endData.endLongitude,
      battery: endData.endBattery,
      message: `Drone session ended with ${endData.endBattery}% battery (used ${batteryUsed}%)`
    });

    return updatedSession;
  }

  /**
   * Log a drone event
   */
  async logEvent(data: EventData): Promise<DroneEvent> {
    try {
      return await prisma.droneEvent.create({
        data: {
          sessionId: data.sessionId,
          userId: data.userId,
          droneId: data.droneId,
          missionId: data.missionId,
          eventType: data.eventType,
          latitude: data.latitude,
          longitude: data.longitude,
          altitude: data.altitude,
          battery: data.battery,
          speed: data.speed,
          mode: data.mode,
          message: data.message
        }
      });
    } catch (err: any) {
      // Swallow Prisma P1008 (SQLite timeout) to avoid crashing; caller throttles retries
      if (err?.code === 'P1008') {
        console.warn('[SessionService] Skipping event write due to DB timeout (P1008)');
        // @ts-ignore - Return a placeholder-like object if needed by callers
        return {} as DroneEvent;
      }
      throw err;
    }
  }

  /**
   * Update session with current telemetry (only for important events)
   */
  async updateSession(sessionId: string, telemetry: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    battery?: number;
    speed?: number;
    mode?: string;
    armed?: boolean;
  }): Promise<void> {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    // Only log important events, not every telemetry point
    // Throttle per event type per session
    const now = Date.now();
    if (!this.lastEventTimestamps.has(sessionId)) {
      this.lastEventTimestamps.set(sessionId, {});
    }
    const lastByType = this.lastEventTimestamps.get(sessionId)!;

    const events: EventData[] = [];

    // Check for takeoff
    if (telemetry.armed && telemetry.altitude && telemetry.altitude > 5) {
      const last = lastByType['takeoff'] || 0;
      if (now - last >= this.EVENT_COOLDOWN_MS) {
      events.push({
        sessionId: 0, // Will be updated
        userId: sessionData.userId,
        droneId: sessionData.droneId,
        missionId: sessionData.missionId,
        eventType: 'takeoff',
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        altitude: telemetry.altitude,
        battery: telemetry.battery,
        speed: telemetry.speed,
        mode: telemetry.mode,
        message: `Drone took off at ${telemetry.altitude}m altitude`
      });
        lastByType['takeoff'] = now;
      }
    }

    // Check for landing
    if (!telemetry.armed && telemetry.altitude && telemetry.altitude < 2) {
      const last = lastByType['landing'] || 0;
      if (now - last >= this.EVENT_COOLDOWN_MS) {
      events.push({
        sessionId: 0, // Will be updated
        userId: sessionData.userId,
        droneId: sessionData.droneId,
        missionId: sessionData.missionId,
        eventType: 'landing',
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        altitude: telemetry.altitude,
        battery: telemetry.battery,
        speed: telemetry.speed,
        mode: telemetry.mode,
        message: `Drone landed at ${telemetry.altitude}m altitude`
      });
        lastByType['landing'] = now;
      }
    }

    // Check for low battery
    if (telemetry.battery && telemetry.battery < 20) {
      const last = lastByType['battery_low'] || 0;
      if (now - last >= this.EVENT_COOLDOWN_MS) {
      events.push({
        sessionId: 0, // Will be updated
        userId: sessionData.userId,
        droneId: sessionData.droneId,
        missionId: sessionData.missionId,
        eventType: 'battery_low',
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        altitude: telemetry.altitude,
        battery: telemetry.battery,
        speed: telemetry.speed,
        mode: telemetry.mode,
        message: `Low battery warning: ${telemetry.battery}%`
      });
        lastByType['battery_low'] = now;
      }
    }

    // Check for mode changes
    if (telemetry.mode && telemetry.mode !== 'UNKNOWN') {
      const last = lastByType['mode_change'] || 0;
      if (now - last >= this.EVENT_COOLDOWN_MS) {
        events.push({
          sessionId: 0, // Will be updated
          userId: sessionData.userId,
          droneId: sessionData.droneId,
          missionId: sessionData.missionId,
          eventType: 'mode_change',
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          altitude: telemetry.altitude,
          battery: telemetry.battery,
          speed: telemetry.speed,
          mode: telemetry.mode,
          message: `Mode changed to ${telemetry.mode}`
        });
        lastByType['mode_change'] = now;
      }
    }

    // Log events
    for (const event of events) {
      const session = await prisma.droneSession.findFirst({ where: { sessionId } });
      if (!session) continue;
      event.sessionId = session.id;
      try {
        await this.logEvent(event);
      } catch (e) {
        // Already handled in logEvent; continue
      }
    }
  }

  /**
   * Get active session for a drone
   */
  getActiveSession(droneId: number): SessionData | null {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.droneId === droneId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Get session history for a user
   */
  async getUserSessions(userId: number, limit: number = 50): Promise<DroneSession[]> {
    return prisma.droneSession.findMany({
      where: { userId },
      include: {
        drone: { select: { name: true, uin: true } },
        mission: { select: { name: true } },
        events: {
          orderBy: { timestamp: 'asc' },
          take: 20
        }
      },
      orderBy: { startTime: 'desc' },
      take: limit
    });
  }

  /**
   * Get session details with events
   */
  async getSessionDetails(sessionId: string): Promise<DroneSession | null> {
    return prisma.droneSession.findFirst({
      where: { sessionId },
      include: {
        drone: { select: { name: true, uin: true, model: true } },
        mission: { select: { name: true, description: true } },
        events: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });
  }

  /**
   * Clean up old sessions (older than 30 days)
   */
  async cleanupOldSessions(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const { count } = await prisma.droneSession.deleteMany({
      where: {
        endTime: {
          lt: cutoffDate
        }
      }
    });

    return count;
  }
}

let sessionServiceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new SessionService();
  }
  return sessionServiceInstance;
}
