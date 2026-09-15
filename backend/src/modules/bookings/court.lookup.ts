import { prisma } from '@/config/prisma';
import { CourtLookup } from './booking.service';

export class PrismaCourtLookup implements CourtLookup {
  async findById(id: number) {
    const court = await prisma.court.findUnique({ where: { id } });
    if (!court) return null;
    return { id: court.id, hourlyRate: Number(court.hourlyRate), status: court.status };
  }
}
