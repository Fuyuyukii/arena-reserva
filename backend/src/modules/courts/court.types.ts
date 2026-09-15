export type CourtStatus = 'AVAILABLE' | 'UNDER_MAINTENANCE' | 'INACTIVE';

export interface OperatingHours {
  dayOfWeek: number;
  openingTime: string;
  closingTime: string;
}

export interface Court {
  id: number;
  name: string;
  surfaceType: string;
  covered: boolean;
  capacity: number;
  hourlyRate: number;
  status: CourtStatus;
  sports: string[];
  operatingHours: OperatingHours[];
}

export interface Occupancy {
  start: Date;
  end: Date;
}

export interface CreateCourtInput {
  name: string;
  surfaceType: string;
  covered: boolean;
  capacity: number;
  hourlyRate: number;
  sportsCenterId: number;
  sports?: string[];
  /** Applied to every day of the week; a court is unbookable until it has operating hours. */
  openingTime?: string;
  closingTime?: string;
}

export interface UpdateCourtInput {
  name?: string;
  surfaceType?: string;
  covered?: boolean;
  capacity?: number;
  hourlyRate?: number;
  status?: CourtStatus;
  sports?: string[];
  openingTime?: string;
  closingTime?: string;
}

export interface CourtBlock {
  id: number;
  courtId: number;
  start: Date;
  end: Date;
  reason?: string | null;
}

export interface CreateBlockInput {
  start: Date;
  end: Date;
  reason?: string;
}
