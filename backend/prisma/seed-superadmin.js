#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedSuperadmin() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('ERROR: SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables are required');
    console.error('Usage: SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD=yourpassword node seed-superadmin.js');
    process.exit(1);
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log(`User with email ${email} already exists. Skipping creation.`);
      return;
    }

    let superadminRole = await prisma.role.findFirst({
      where: { name: 'Super Admin' }
    });

    if (!superadminRole) {
      console.log('Creating Super Admin role...');
      superadminRole = await prisma.role.create({
        data: {
          name: 'Super Admin',
          description: 'Full system access with all permissions',
          fullAccess: true,
          isTeamManager: true,
          isSystem: true,
          permissions: {
            Pages: ['Dashboard', 'Clients', 'Users', 'Services', 'Activities', 'Settings'],
            Settings: [
              'Roles',
              'Autovation Clients',
              'Notifications',
              'System Maintenance Email',
              'SMTP Credentials',
              'Voicemail SFTP Credentials',
              'Vicidial Credentials',
              'Site Customization'
            ],
            Users: ['Create', 'Read', 'Update', 'Delete'],
            Clients: ['Create', 'Read', 'Update', 'Delete']
          }
        }
      });
      console.log('Super Admin role created');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: 'superadmin',
        isActive: true,
        customRoleId: superadminRole.id
      }
    });

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  Super Admin account created successfully!                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Email:    ${email}`);
    console.log(`  Name:     ${name}`);
    console.log(`  Role:     Super Admin`);
    console.log('');
    console.log('  You can now log in with these credentials.');
    console.log('');

  } catch (error) {
    console.error('Error creating superadmin:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedSuperadmin();
