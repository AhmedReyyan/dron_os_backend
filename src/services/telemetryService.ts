/**
 * Telemetry Service - Database storage for drone telemetry data
 * Handles storing and retrieving telemetry data from the database
 */

import { prisma } from '../index';

export interface TelemetryData {
  userId: number;
  droneId: number;
  latitude: number;
  longitude: number;
  altitude: number;
  relativeAltitude: number;
  groundSpeed: number;
  airSpeed: number;
  heading: number;
  throttle: number;
  battery: number;
  satellites: number;
  armed: boolean;
  mode: string;
}

class TelemetryService {
  private static instance: TelemetryService;
  private batchSize = 10; // Store telemetry in batches
  private telemetryBuffer: TelemetryData[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;

  /**
   * Get singleton instance
   */
  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Store telemetry data in database
   * Uses batching to improve performance
   */
  public async storeTelemetry(data: TelemetryData): Promise<void> {
    try {
      // Add to buffer
      this.telemetryBuffer.push(data);

      // If buffer is full, flush immediately
      if (this.telemetryBuffer.length >= this.batchSize) {
        await this.flushBuffer();
      } else {
        // Set timeout to flush buffer after 1 second
        if (this.batchTimeout) {
          clearTimeout(this.batchTimeout);
        }
        this.batchTimeout = setTimeout(() => {
          this.flushBuffer();
        }, 1000);
      }
    } catch (error) {
      console.error('Error storing telemetry data:', error);
    }
  }

  /**
   * Flush telemetry buffer to database
   */
  private async flushBuffer(): Promise<void> {
    if (this.telemetryBuffer.length === 0) return;

    try {
      // Create telemetry records in batch
      await prisma.telemetryData.createMany({
        data: this.telemetryBuffer.map(data => ({
          userId: data.userId,
          droneId: data.droneId,
          latitude: data.latitude,
          longitude: data.longitude,
          altitude: data.altitude,
          relativeAltitude: data.relativeAltitude,
          groundSpeed: data.groundSpeed,
          airSpeed: data.airSpeed,
          heading: data.heading,
          throttle: data.throttle,
          battery: data.battery,
          satellites: data.satellites,
          armed: data.armed,
          mode: data.mode
        }))
      });

      // Clear buffer
      this.telemetryBuffer = [];

      // Clear timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }

      console.log(`📊 Stored ${this.batchSize} telemetry records in database`);
    } catch (error) {
      console.error('Error flushing telemetry buffer:', error);
    }
  }

  /**
   * Get telemetry data for a specific drone
   */
  public async getTelemetryData(droneId: number, limit: number = 100): Promise<any[]> {
    try {
      const telemetryData = await prisma.telemetryData.findMany({
        where: { droneId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return telemetryData;
    } catch (error) {
      console.error('Error fetching telemetry data:', error);
      return [];
    }
  }

  /**
   * Get telemetry data for a user
   */
  public async getUserTelemetryData(userId: number, limit: number = 100): Promise<any[]> {
    try {
      const telemetryData = await prisma.telemetryData.findMany({
        where: { userId },
        include: {
          drone: {
            select: { name: true, uin: true }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return telemetryData;
    } catch (error) {
      console.error('Error fetching user telemetry data:', error);
      return [];
    }
  }

  /**
   * Clean up old telemetry data (keep only last 1000 records per drone)
   */
  public async cleanupOldTelemetry(): Promise<void> {
    try {
      // Get all drones
      const drones = await prisma.drone.findMany({
        select: { id: true }
      });

      for (const drone of drones) {
        // Count total records for this drone
        const count = await prisma.telemetryData.count({
          where: { droneId: drone.id }
        });

        // If more than 1000 records, delete oldest ones
        if (count > 1000) {
          const recordsToDelete = count - 1000;
          
          // Get oldest records to delete
          const oldestRecords = await prisma.telemetryData.findMany({
            where: { droneId: drone.id },
            orderBy: { timestamp: 'asc' },
            take: recordsToDelete,
            select: { id: true }
          });

          // Delete oldest records
          await prisma.telemetryData.deleteMany({
            where: {
              id: {
                in: oldestRecords.map(record => record.id)
              }
            }
          });

          console.log(`🧹 Cleaned up ${recordsToDelete} old telemetry records for drone ${drone.id}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old telemetry data:', error);
    }
  }

  /**
   * Force flush buffer (useful for shutdown)
   */
  public async forceFlush(): Promise<void> {
    await this.flushBuffer();
  }
}

export const getTelemetryService = (): TelemetryService => {
  return TelemetryService.getInstance();
};

export default TelemetryService;
