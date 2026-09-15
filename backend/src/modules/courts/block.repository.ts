import { prisma } from '@/config/prisma';
import { BlockRepository } from './court.service';
import { CourtBlock, CreateBlockInput } from './court.types';

function toDomain(row: { id: number; courtId: number; startsAt: Date; endsAt: Date; reason: string | null }): CourtBlock {
  return { id: row.id, courtId: row.courtId, start: row.startsAt, end: row.endsAt, reason: row.reason };
}

export class PrismaBlockRepository implements BlockRepository {
  async create(courtId: number, input: CreateBlockInput): Promise<CourtBlock> {
    const row = await prisma.courtBlock.create({
      data: { courtId, startsAt: input.start, endsAt: input.end, reason: input.reason },
    });
    return toDomain(row);
  }

  async listByCourt(courtId: number): Promise<CourtBlock[]> {
    const rows = await prisma.courtBlock.findMany({ where: { courtId }, orderBy: { startsAt: 'asc' } });
    return rows.map(toDomain);
  }

  async findById(id: number): Promise<CourtBlock | null> {
    const row = await prisma.courtBlock.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async delete(id: number): Promise<void> {
    await prisma.courtBlock.delete({ where: { id } });
  }
}
