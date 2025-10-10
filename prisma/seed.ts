import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default admin user
  const adminHashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@drone.com' },
    update: {},
    create: {
      email: 'admin@drone.com',
      name: 'Admin User',
      password: adminHashedPassword,
      isAdmin: true,
    },
  });

  console.log('✅ Created admin user:', admin.email);
  console.log('   Password: admin123');
  console.log('');
  console.log('🎉 Database ready!');
  console.log('');
  console.log('📝 To create a new user:');
  console.log('   1. Go to http://localhost:3000/signup');
  console.log('   2. Fill in your details');
  console.log('   3. Login and start using the app!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
