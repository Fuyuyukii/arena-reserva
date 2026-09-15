import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const sportsCenter = await prisma.sportsCenter.create({
    data: {
      name: 'Centro Esportivo Arena Sul',
      taxId: '12.345.678/0001-90',
      phone: '(41) 3333-4444',
      address: {
        create: {
          street: 'Rua das Palmeiras',
          number: '500',
          district: 'Centro',
          city: 'Curitiba',
          state: 'PR',
          postalCode: '80000-000',
        },
      },
    },
  });

  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      name: 'Administrador Arena',
      email: 'admin@arenareserva.com',
      passwordHash: adminPasswordHash,
      role: 'ADMINISTRATOR',
      administrator: {
        create: { jobTitle: 'Gerente', accessProfile: 'FULL', sportsCenterId: sportsCenter.id },
      },
    },
  });

  const futsal = await prisma.sport.create({ data: { name: 'Futsal' } });
  const volei = await prisma.sport.create({ data: { name: 'Vôlei' } });

  await prisma.court.create({
    data: {
      name: 'Quadra 1 - Society',
      surfaceType: 'Grama sintética',
      covered: false,
      capacity: 14,
      hourlyRate: 120,
      sportsCenterId: sportsCenter.id,
      sports: { create: [{ sportId: futsal.id }] },
      operatingHours: {
        create: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
          dayOfWeek,
          openingTime: '08:00',
          closingTime: '22:00',
        })),
      },
    },
  });

  await prisma.court.create({
    data: {
      name: 'Quadra 2 - Poliesportiva',
      surfaceType: 'Piso emborrachado',
      covered: true,
      capacity: 20,
      hourlyRate: 150,
      sportsCenterId: sportsCenter.id,
      sports: { create: [{ sportId: futsal.id }, { sportId: volei.id }] },
      operatingHours: {
        create: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
          dayOfWeek,
          openingTime: '08:00',
          closingTime: '22:00',
        })),
      },
    },
  });

  console.log('Seed concluído.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
