require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
  // Password default buat tim frontend lo biar gampang diingat
  const hashedPassword = await bcrypt.hash('password123', 10);

  console.log('Sedang membuat data untuk tim frontend');

  // Akun untuk testing fitur FREE USER
  const user1 = await prisma.user.upsert({
    where: { email: 'user@test.com' },
    update: {},
    create: {
      email: 'user@test.com',
      username: 'frontend_user',
      passwordHash: hashedPassword,
      role: 'free',
    },
  });

  // Akun untuk testing fitur ADMIN
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      username: 'frontend_admin',
      passwordHash: hashedPassword,
      role: 'admin',
    },
  });

  console.log('✅ Beres Bro! Kasih tau tim frontend lo:');
  console.log('- User: user@test.com / password123');
  console.log('- Admin: admin@test.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Ada error pas bikin dummy:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });