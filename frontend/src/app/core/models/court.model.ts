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

export interface CourtAvailability {
  date: string;
  slots: string[];
}

export interface CourtBlock {
  id: number;
  courtId: number;
  start: string;
  end: string;
  reason?: string | null;
}

export interface CreateBlockInput {
  start: string;
  end: string;
  reason?: string;
}
