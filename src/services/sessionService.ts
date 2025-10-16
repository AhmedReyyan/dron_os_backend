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
    return prisma.droneEvent.create({
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
    const events: EventData[] = [];

    // Check for takeoff
    if (telemetry.armed && telemetry.altitude && telemetry.altitude > 5) {
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
    }

    // Check for landing
    if (!telemetry.armed && telemetry.altitude && telemetry.altitude < 2) {
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
    }

    // Check for low battery
    if (telemetry.battery && telemetry.battery < 20) {
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
    }

    // Check for mode changes
    if (telemetry.mode && telemetry.mode !== 'UNKNOWN') {
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
    }

    // Log events
    for (const event of events) {
      const session = await prisma.droneSession.findFirst({
        where: { sessionId }
      });
      if (session) {
        event.sessionId = session.id;
        await this.logEvent(event);
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
