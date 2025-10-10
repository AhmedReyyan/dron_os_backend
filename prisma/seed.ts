import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create a test user
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'test@drone.com' },
    update: {},
    create: {
      email: 'test@drone.com',
      name: 'Test Pilot',
      password: hashedPassword,
      isAdmin: false,
    },
  });

  console.log('✅ Created user:', user.email);

  // Create test drones
  const drone1 = await prisma.drone.upsert({
    where: { uin: 'DRONE-001' },
    update: {},
    create: {
      userId: user.id,
      name: 'Drone Alpha-01',
      uin: 'DRONE-001',
      connectionString: 'udp:localhost:14550',
      ipAddress: 'localhost',
      port: 14550,
      isConnected: true,
      latitude: 13.1959,
      longitude: 77.6968,
      altitude: 120.5,
    },
  });

  const drone2 = await prisma.drone.upsert({
    where: { uin: 'DRONE-002' },
    update: {},
    create: {
      userId: user.id,
      name: 'Drone Beta-02',
      uin: 'DRONE-002',
      connectionString: 'udp:localhost:14551',
      ipAddress: 'localhost',
      port: 14551,
      isConnected: false, // Disconnected drone - won't show on map
      latitude: 13.1960,
      longitude: 77.6969,
      altitude: 0,
    },
  });

  console.log('✅ Created drones:', drone1.name, drone2.name);

  // Create test missions
  const mission1 = await prisma.mission.create({
    data: {
      userId: user.id,
      droneId: drone1.id,
      name: 'Site Survey Mission #DR-2024-001',
      status: 'completed',
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      waypoints: JSON.stringify([
        { lat: 13.1959, lon: 77.6968 },
        { lat: 13.1960, lon: 77.6970 },
      ]),
    },
  });

  const mission2 = await prisma.mission.create({
    data: {
      userId: user.id,
      droneId: drone1.id,
      name: 'Perimeter Inspection',
      status: 'active',
      startedAt: new Date(),
    },
  });

  const mission3 = await prisma.mission.create({
    data: {
      userId: user.id,
      name: 'Aerial Photography Session',
      status: 'planning',
    },
  });

  console.log('✅ Created missions:', mission1.name, mission2.name, mission3.name);

  // Create test flight logs
  const flightLog1 = await prisma.flightLog.create({
    data: {
      userId: user.id,
      droneId: drone1.id,
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
      duration: 3600, // 1 hour in seconds
      maxAltitude: 150.5,
      maxSpeed: 18.3,
      distance: 5.2,
      batteryStart: 100,
      batteryEnd: 72,
      status: 'completed',
      missionId: 'DR-2024-001',
    },
  });

  const flightLog2 = await prisma.flightLog.create({
    data: {
      userId: user.id,
      droneId: drone1.id,
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 10), // 10 hours ago
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
      duration: 7200, // 2 hours in seconds
      maxAltitude: 200.0,
      maxSpeed: 20.5,
      distance: 12.8,
      batteryStart: 100,
      batteryEnd: 45,
      status: 'completed',
      missionId: 'DR-2024-002',
    },
  });

  const flightLog3 = await prisma.flightLog.create({
    data: {
      userId: user.id,
      droneId: drone1.id,
      startTime: new Date(),
      maxAltitude: 120.5,
      maxSpeed: 15.2,
      distance: 2.1,
      batteryStart: 95,
      status: 'in_progress',
    },
  });

  console.log('✅ Created flight logs');

  console.log('\n🎉 Seeding completed successfully!');
  console.log('\n📝 Test credentials:');
  console.log('   Email: test@drone.com');
  console.log('   Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


