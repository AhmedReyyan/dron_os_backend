/**
 * Database Seed Script
 * Populates the database with initial data for testing
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    // Create sample users
    const user1 = await prisma.user.upsert({
        where: { email: 'pilot@example.com' },
        update: {},
        create: {
            email: 'pilot@example.com',
            name: 'John Pilot',
            password: 'hashedpassword123', // In real app, this would be properly hashed
            isAdmin: false,
        },
    });
    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            name: 'Admin User',
            password: 'hashedpassword123',
            isAdmin: true,
        },
    });
    console.log('✅ Created users');
    // Create sample drones
    const drone1 = await prisma.drone.upsert({
        where: { uin: 'UIN123456789' },
        update: {},
        create: {
            name: 'DJI Phantom 4',
            uin: 'UIN123456789',
            model: 'DJI Phantom 4 Pro',
            status: 'offline',
            batteryLevel: 85,
            userId: user1.id,
        },
    });
    const drone2 = await prisma.drone.upsert({
        where: { uin: 'UIN987654321' },
        update: {},
        create: {
            name: 'Custom Quadcopter',
            uin: 'UIN987654321',
            model: 'Custom Build',
            status: 'offline',
            batteryLevel: 92,
            userId: user1.id,
        },
    });
    console.log('✅ Created drones');
    // Create sample missions
    const mission1 = await prisma.mission.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'Survey Mission Alpha',
            description: 'Aerial survey of downtown area',
            status: 'completed',
            startTime: new Date('2024-01-15T10:00:00Z'),
            endTime: new Date('2024-01-15T11:30:00Z'),
            flightHours: 1.5,
            success: true,
            userId: user1.id,
            droneId: drone1.id,
        },
    });
    const mission2 = await prisma.mission.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: 'Emergency Response',
            description: 'Search and rescue operation',
            status: 'active',
            startTime: new Date(),
            flightHours: 0,
            success: false,
            userId: user1.id,
            droneId: drone2.id,
        },
    });
    console.log('✅ Created missions');
    // Create sample waypoints for mission1
    await prisma.waypoint.createMany({
        data: [
            {
                latitude: 12.9716,
                longitude: 77.5946,
                altitude: 100,
                order: 1,
                missionId: mission1.id,
            },
            {
                latitude: 12.9726,
                longitude: 77.5956,
                altitude: 120,
                order: 2,
                missionId: mission1.id,
            },
            {
                latitude: 12.9736,
                longitude: 77.5966,
                altitude: 110,
                order: 3,
                missionId: mission1.id,
            },
        ],
    });
    console.log('✅ Created waypoints');
    // Create sample activities
    await prisma.activity.createMany({
        data: [
            {
                type: 'drone_registered',
                title: 'Drone DJI Phantom 4 registered',
                description: 'Drone DJI Phantom 4 (UIN: UIN123456789) was registered successfully',
                status: 'success',
                userId: user1.id,
                droneId: drone1.id,
            },
            {
                type: 'mission_started',
                title: 'Survey Mission Alpha started',
                description: 'Mission Survey Mission Alpha was started with drone DJI Phantom 4',
                status: 'success',
                userId: user1.id,
                droneId: drone1.id,
                missionId: mission1.id,
            },
            {
                type: 'mission_completed',
                title: 'Survey Mission Alpha completed',
                description: 'Mission Survey Mission Alpha was completed successfully',
                status: 'success',
                userId: user1.id,
                droneId: drone1.id,
                missionId: mission1.id,
            },
            {
                type: 'drone_connected',
                title: 'Drone Custom Quadcopter connected',
                description: 'Drone Custom Quadcopter successfully connected to SITL',
                status: 'success',
                userId: user1.id,
                droneId: drone2.id,
            },
        ],
    });
    console.log('✅ Created activities');
    // Create sample drone sessions
    const session1 = await prisma.droneSession.create({
        data: {
            sessionId: `session_${drone1.id}_${Date.now() - 2 * 24 * 60 * 60 * 1000}`,
            userId: user1.id,
            droneId: drone1.id,
            missionId: mission1.id,
            startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
            endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600 * 1000), // 1 hour later
            startBattery: 95,
            endBattery: 75,
            batteryUsed: 20,
            startLatitude: 12.9716,
            startLongitude: 77.5946,
            endLatitude: 12.9816,
            endLongitude: 77.6046,
            totalDistance: 1500, // 1.5 km
            maxAltitude: 120,
            maxSpeed: 15.5,
            avgSpeed: 12.3,
            flightDuration: 3600, // 1 hour in seconds
            status: 'completed'
        }
    });
    const session2 = await prisma.droneSession.create({
        data: {
            sessionId: `session_${drone2.id}_${Date.now() - 1 * 60 * 60 * 1000}`,
            userId: user1.id,
            droneId: drone2.id,
            startTime: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
            endTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
            startBattery: 88,
            endBattery: 65,
            batteryUsed: 23,
            startLatitude: 12.9616,
            startLongitude: 77.5846,
            endLatitude: 12.9516,
            endLongitude: 77.5746,
            totalDistance: 800, // 0.8 km
            maxAltitude: 80,
            maxSpeed: 12.0,
            avgSpeed: 8.5,
            flightDuration: 1800, // 30 minutes in seconds
            status: 'completed'
        }
    });
    console.log('✅ Created drone sessions');
    // Create sample drone events
    await prisma.droneEvent.createMany({
        data: [
            // Session 1 events
            {
                userId: user1.id,
                droneId: drone1.id,
                sessionId: session1.id,
                missionId: mission1.id,
                eventType: 'session_started',
                latitude: 12.9716,
                longitude: 77.5946,
                battery: 95,
                message: 'Drone session started with 95% battery'
            },
            {
                userId: user1.id,
                droneId: drone1.id,
                sessionId: session1.id,
                missionId: mission1.id,
                eventType: 'takeoff',
                latitude: 12.9726,
                longitude: 77.5956,
                altitude: 10,
                battery: 94,
                speed: 2.5,
                mode: 'AUTO',
                message: 'Drone took off at 10m altitude'
            },
            {
                userId: user1.id,
                droneId: drone1.id,
                sessionId: session1.id,
                missionId: mission1.id,
                eventType: 'mode_change',
                latitude: 12.9756,
                longitude: 77.5986,
                altitude: 50,
                battery: 92,
                speed: 8.5,
                mode: 'GUIDED',
                message: 'Mode changed to GUIDED'
            },
            {
                userId: user1.id,
                droneId: drone1.id,
                sessionId: session1.id,
                missionId: mission1.id,
                eventType: 'landing',
                latitude: 12.9816,
                longitude: 77.6046,
                altitude: 5,
                battery: 75,
                speed: 1.2,
                mode: 'LAND',
                message: 'Drone landed at 5m altitude'
            },
            {
                userId: user1.id,
                droneId: drone1.id,
                sessionId: session1.id,
                missionId: mission1.id,
                eventType: 'session_ended',
                latitude: 12.9816,
                longitude: 77.6046,
                battery: 75,
                message: 'Drone session ended with 75% battery (used 20%)'
            },
            // Session 2 events
            {
                userId: user1.id,
                droneId: drone2.id,
                sessionId: session2.id,
                eventType: 'session_started',
                latitude: 12.9616,
                longitude: 77.5846,
                battery: 88,
                message: 'Drone session started with 88% battery'
            },
            {
                userId: user1.id,
                droneId: drone2.id,
                sessionId: session2.id,
                eventType: 'takeoff',
                latitude: 12.9626,
                longitude: 77.5856,
                altitude: 8,
                battery: 87,
                speed: 2.0,
                mode: 'AUTO',
                message: 'Drone took off at 8m altitude'
            },
            {
                userId: user1.id,
                droneId: drone2.id,
                sessionId: session2.id,
                eventType: 'zone_violation',
                latitude: 12.9556,
                longitude: 77.5786,
                altitude: 45,
                battery: 78,
                speed: 10.5,
                message: 'Drone entered restricted zone near airport'
            },
            {
                userId: user1.id,
                droneId: drone2.id,
                sessionId: session2.id,
                eventType: 'battery_low',
                latitude: 12.9526,
                longitude: 77.5766,
                altitude: 35,
                battery: 20,
                speed: 5.5,
                message: 'Low battery warning: 20%'
            },
            {
                userId: user1.id,
                droneId: drone2.id,
                sessionId: session2.id,
                eventType: 'landing',
                latitude: 12.9516,
                longitude: 77.5746,
                altitude: 3,
                battery: 65,
                speed: 0.8,
                mode: 'LAND',
                message: 'Drone landed at 3m altitude'
            },
            {
                userId: user1.id,
                droneId: drone2.id,
                sessionId: session2.id,
                eventType: 'session_ended',
                latitude: 12.9516,
                longitude: 77.5746,
                battery: 65,
                message: 'Drone session ended with 65% battery (used 23%)'
            }
        ]
    });
    console.log('✅ Created drone events');
    // Create sample zones
    await prisma.zone.createMany({
        data: [
            {
                name: 'Airport Restricted Zone',
                city: 'bangalore',
                type: 'red',
                geometry: JSON.stringify({
                    type: 'Polygon',
                    coordinates: [[
                            [77.5800, 12.9500],
                            [77.5900, 12.9500],
                            [77.5900, 12.9600],
                            [77.5800, 12.9600],
                            [77.5800, 12.9500]
                        ]]
                }),
                isActive: true,
            },
            {
                name: 'City Center Zone',
                city: 'bangalore',
                type: 'yellow',
                geometry: JSON.stringify({
                    type: 'Polygon',
                    coordinates: [[
                            [77.5900, 12.9700],
                            [77.6000, 12.9700],
                            [77.6000, 12.9800],
                            [77.5900, 12.9800],
                            [77.5900, 12.9700]
                        ]]
                }),
                isActive: true,
            },
            {
                name: 'Safe Flying Zone',
                city: 'bangalore',
                type: 'green',
                geometry: JSON.stringify({
                    type: 'Polygon',
                    coordinates: [[
                            [77.6000, 12.9800],
                            [77.6100, 12.9800],
                            [77.6100, 12.9900],
                            [77.6000, 12.9900],
                            [77.6000, 12.9800]
                        ]]
                }),
                isActive: true,
            },
        ],
    });
    console.log('✅ Created zones');
    console.log('🎉 Database seed completed successfully!');
}
main()
    .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
