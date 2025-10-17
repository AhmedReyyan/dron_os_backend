/**
 * Analytics Routes
 * Provides comprehensive analytics data for the dashboard
 */

import { Router } from 'express';
import { prisma } from '../index';
import { getSessionService } from '../services/sessionService';

const analyticsRouter = Router();

/**
 * Get analytics metrics for a user
 * GET /analytics/metrics/:userId
 */
analyticsRouter.get('/metrics/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { startDate, endDate, droneIds } = req.query;

    // Build where clause for sessions
    const whereClause: any = { userId };
    
    if (startDate && endDate) {
      whereClause.startTime = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (droneIds && droneIds !== '') {
      const droneIdArray = (droneIds as string).split(',').map(id => parseInt(id));
      whereClause.droneId = { in: droneIdArray };
    }

    // Get sessions data (much faster than telemetry)
    const sessions = await prisma.droneSession.findMany({
      where: whereClause,
      include: {
        drone: { select: { name: true } }
      }
    });

    // Get missions data
    const missions = await prisma.mission.findMany({
      where: {
        userId,
        ...(startDate && endDate ? {
          startTime: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        } : {}),
        ...(droneIds && droneIds !== '' ? {
          droneId: { in: (droneIds as string).split(',').map(id => parseInt(id)) }
        } : {})
      }
    });

    // Calculate metrics from sessions (much faster)
    const totalFlights = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const successRate = totalFlights > 0 ? (completedSessions.length / totalFlights) * 100 : 0;
    
    const totalFlightHours = sessions.reduce((sum, s) => sum + (s.flightDuration || 0) / 3600, 0);
    const averageFlightDuration = totalFlights > 0 ? (totalFlightHours / totalFlights) * 60 : 0; // Convert to minutes

    // Calculate distance and speed from sessions
    const totalDistance = sessions.reduce((sum, s) => sum + (s.totalDistance || 0), 0);
    const averageSpeed = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + (s.avgSpeed || 0), 0) / sessions.length 
      : 0;

    // Calculate battery efficiency from sessions
    const batteryEfficiency = sessions.length > 0 
      ? sessions.reduce((sum, s) => {
          const batteryUsed = (s.startBattery || 0) - (s.endBattery || 0);
          const duration = s.flightDuration || 1; // Avoid division by zero
          return sum + (batteryUsed / duration) * 3600; // Battery per hour
        }, 0) / sessions.length 
      : 0;

    // Count zone violations from events
    const zoneViolations = await prisma.droneEvent.count({
      where: {
        userId,
        eventType: 'zone_violation',
        ...(startDate && endDate ? {
          timestamp: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        } : {})
      }
    });

    const metrics = {
      totalFlights,
      totalFlightHours,
      averageFlightDuration,
      successRate,
      totalDistance,
      averageSpeed,
      batteryEfficiency,
      zoneViolations
    };

    res.json({ success: true, metrics });
  } catch (error: any) {
    console.error('Error fetching analytics metrics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch analytics metrics' 
    });
  }
});

/**
 * Get flight data for visualization
 * GET /analytics/flights/:userId
 */
analyticsRouter.get('/flights/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { startDate, endDate, droneIds } = req.query;

    // Build where clause for sessions
    const whereClause: any = { userId };
    
    if (startDate && endDate) {
      whereClause.startTime = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (droneIds && droneIds !== '') {
      const droneIdArray = (droneIds as string).split(',').map(id => parseInt(id));
      whereClause.droneId = { in: droneIdArray };
    }

    // Get sessions with events (much faster than telemetry)
    const sessions = await prisma.droneSession.findMany({
      where: whereClause,
      include: {
        drone: { select: { name: true } },
        mission: { select: { name: true } },
        events: {
          orderBy: { timestamp: 'asc' }
        }
      },
      orderBy: { startTime: 'desc' }
    });

    // Convert sessions to flight data format
    const flights = sessions.map(session => {
      // Create path from events
      const path = session.events
        .filter(e => e.latitude && e.longitude)
        .map(e => ({
          lat: e.latitude!,
          lon: e.longitude!,
          alt: e.altitude || 0,
          timestamp: e.timestamp.toISOString()
        }));

      // Create battery usage from events
      const batteryUsage = session.events
        .filter(e => e.battery !== null)
        .map(e => ({
          timestamp: e.timestamp.toISOString(),
          level: e.battery!
        }));

      // Get violations from events
      const violations = session.events
        .filter(e => e.eventType === 'zone_violation')
        .map(e => ({
          timestamp: e.timestamp.toISOString(),
          zoneName: e.message || 'Unknown Zone',
          zoneType: 'red' // Would be determined from zone data
        }));

      return {
        id: `session-${session.id}`,
        droneId: session.droneId,
        droneName: session.drone?.name || 'Unknown',
        missionId: session.missionId,
        missionName: session.mission?.name || 'No Mission',
        startTime: session.startTime.toISOString(),
        endTime: session.endTime?.toISOString() || new Date().toISOString(),
        duration: (session.flightDuration || 0) * 1000, // Convert to milliseconds
        distance: session.totalDistance || 0,
        maxAltitude: session.maxAltitude || 0,
        averageSpeed: session.avgSpeed || 0,
        path,
        batteryUsage,
        violations
      };
    });

    res.json({ success: true, flights });
  } catch (error: any) {
    console.error('Error fetching flight data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch flight data' 
    });
  }
});

/**
 * Get performance data
 * GET /analytics/performance/:userId
 */
analyticsRouter.get('/performance/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { startDate, endDate, droneIds } = req.query;

    const whereClause: any = { userId };
    
    if (startDate && endDate) {
      whereClause.timestamp = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (droneIds && droneIds !== '') {
      const droneIdArray = (droneIds as string).split(',').map(id => parseInt(id));
      whereClause.droneId = { in: droneIdArray };
    }

    // Get events instead of telemetry (much faster)
    const events = await prisma.droneEvent.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
      take: 1000
    });

    const performanceData = {
      speed: events
        .filter(e => e.speed !== null)
        .map(e => ({
          timestamp: e.timestamp.toISOString(),
          value: e.speed!
        })),
      altitude: events
        .filter(e => e.altitude !== null)
        .map(e => ({
          timestamp: e.timestamp.toISOString(),
          value: e.altitude!
        })),
      efficiency: events
        .filter(e => e.battery !== null)
        .map(e => ({
          timestamp: e.timestamp.toISOString(),
          value: e.battery! // Using battery as efficiency proxy
        }))
    };

    res.json({ success: true, data: performanceData });
  } catch (error: any) {
    console.error('Error fetching performance data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch performance data' 
    });
  }
});

/**
 * Get battery analysis data
 * GET /analytics/battery/:userId
 */
analyticsRouter.get('/battery/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { startDate, endDate, droneIds } = req.query;

    const whereClause: any = { userId };
    
    if (startDate && endDate) {
      whereClause.timestamp = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    if (droneIds && droneIds !== '') {
      const droneIdArray = (droneIds as string).split(',').map(id => parseInt(id));
      whereClause.droneId = { in: droneIdArray };
    }

    // Get battery events instead of all telemetry
    const batteryEvents = await prisma.droneEvent.findMany({
      where: {
        ...whereClause,
        battery: { not: null }
      },
      include: {
        drone: { select: { name: true } }
      },
      orderBy: { timestamp: 'asc' }
    });

    // Get sessions for efficiency calculation
    const sessions = await prisma.droneSession.findMany({
      where: {
        userId,
        ...(startDate && endDate ? {
          startTime: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        } : {}),
        ...(droneIds && droneIds !== '' ? {
          droneId: { in: (droneIds as string).split(',').map(id => parseInt(id)) }
        } : {})
      },
      include: {
        drone: { select: { name: true } }
      }
    });

    const usage = batteryEvents.map(e => ({
      timestamp: e.timestamp.toISOString(),
      level: e.battery!,
      droneId: e.droneId,
      droneName: e.drone?.name || `Drone ${e.droneId}`
    }));

    // Calculate efficiency from sessions
    const efficiency = sessions.map(session => {
      const batteryUsed = (session.startBattery || 0) - (session.endBattery || 0);
      const duration = session.flightDuration || 1; // Avoid division by zero
      const efficiency = duration > 0 ? (batteryUsed / duration) * 3600 : 0; // Battery per hour
      
      return {
        droneId: session.droneId,
        droneName: session.drone?.name || `Drone ${session.droneId}`,
        efficiency: Math.max(0, efficiency), // Ensure non-negative
        totalFlights: 1, // Each session is one flight
        totalHours: duration / 3600
      };
    });

    // Generate trends (daily averages from sessions)
    const trends: Array<{ date: string; averageLevel: number }> = [];
    const dailyData = new Map<string, number[]>();
    sessions.forEach(session => {
      const date = session.startTime.toISOString().split('T')[0];
      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)!.push(session.startBattery || 0);
    });

    dailyData.forEach((batteries: number[], date: string) => {
      const avgLevel = batteries.reduce((sum: number, level: number) => sum + level, 0) / batteries.length;
      trends.push({
        date,
        averageLevel: avgLevel
      });
    });

    const batteryData = {
      usage,
      efficiency,
      trends: trends.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    };

    res.json({ success: true, data: batteryData });
  } catch (error: any) {
    console.error('Error fetching battery data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch battery data' 
    });
  }
});

/**
 * Get mission data
 * GET /analytics/missions/:userId
 */
analyticsRouter.get('/missions/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { startDate, endDate, droneIds } = req.query;

    const missions = await prisma.mission.findMany({
      where: {
        userId,
        ...(startDate && endDate ? {
          startTime: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        } : {}),
        ...(droneIds && droneIds !== '' ? {
          droneId: { in: (droneIds as string).split(',').map(id => parseInt(id)) }
        } : {})
      },
      include: {
        drone: { select: { name: true } }
      },
      orderBy: { startTime: 'desc' }
    });

    const missionData = missions.map(mission => ({
      id: mission.id,
      name: mission.name,
      status: mission.status,
      startTime: mission.startTime?.toISOString() || new Date().toISOString(),
      endTime: mission.endTime?.toISOString(),
      duration: mission.flightHours * 60, // Convert to minutes
      success: mission.success,
      droneName: mission.drone?.name || 'Unknown',
      flightHours: mission.flightHours
    }));

    res.json({ success: true, missions: missionData });
  } catch (error: any) {
    console.error('Error fetching mission data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch mission data' 
    });
  }
});

/**
 * Get fleet comparison data
 * GET /analytics/fleet/:userId
 */
analyticsRouter.get('/fleet/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get all drones for the user with sessions
    const drones = await prisma.drone.findMany({
      where: { userId },
      include: {
        sessions: {
          where: { status: 'completed' }
        },
        missions: {
          where: { status: 'completed' }
        }
      }
    });

    const fleetData = {
      drones: drones.map(drone => {
        const sessions = drone.sessions || [];
        const missions = drone.missions || [];
        
        const totalFlights = sessions.length;
        const totalHours = sessions.reduce((sum, s) => sum + (s.flightDuration || 0) / 3600, 0);
        const successRate = totalFlights > 0 
          ? (sessions.filter(s => s.status === 'completed').length / totalFlights) * 100 
          : 0;
        
        // Calculate battery efficiency from sessions
        const batteryEfficiency = sessions.length > 0 
          ? sessions.reduce((sum, s) => {
              const batteryUsed = (s.startBattery || 0) - (s.endBattery || 0);
              const duration = s.flightDuration || 1;
              return sum + (batteryUsed / duration) * 3600;
            }, 0) / sessions.length 
          : 0;

        return {
          id: drone.id,
          name: drone.name,
          totalFlights,
          totalHours,
          successRate,
          averageBatteryEfficiency: Math.max(0, batteryEfficiency),
          lastActive: drone.lastSeen?.toISOString() || drone.createdAt.toISOString()
        };
      }),
      comparison: [
        {
          metric: 'Total Flights',
          values: drones.map(drone => ({
            droneName: drone.name,
            value: (drone.sessions || []).length
          }))
        },
        {
          metric: 'Flight Hours',
          values: drones.map(drone => ({
            droneName: drone.name,
            value: (drone.sessions || []).reduce((sum, s) => sum + (s.flightDuration || 0) / 3600, 0)
          }))
        },
        {
          metric: 'Success Rate',
          values: drones.map(drone => {
            const sessions = drone.sessions || [];
            const successRate = sessions.length > 0 
              ? (sessions.filter(s => s.status === 'completed').length / sessions.length) * 100 
              : 0;
            return {
              droneName: drone.name,
              value: successRate
            };
          })
        }
      ]
    };

    res.json({ success: true, data: fleetData });
  } catch (error: any) {
    console.error('Error fetching fleet data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch fleet data' 
    });
  }
});

export { analyticsRouter };
