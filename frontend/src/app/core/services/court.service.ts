import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config';
import { CourtAvailability, Court, CourtBlock, CreateBlockInput } from '../models/court.model';

export interface CreateCourtInput {
  name: string;
  surfaceType: string;
  covered: boolean;
  capacity: number;
  hourlyRate: number;
  sportsCenterId: number;
  sports?: string[];
  openingTime?: string;
  closingTime?: string;
}

export interface UpdateCourtInput {
  name?: string;
  surfaceType?: string;
  covered?: boolean;
  capacity?: number;
  hourlyRate?: number;
  status?: Court['status'];
  sports?: string[];
  openingTime?: string;
  closingTime?: string;
}

@Injectable({ providedIn: 'root' })
export class CourtService {
  constructor(private readonly http: HttpClient) {}

  list(sport?: string): Promise<Court[]> {
    const params = sport ? { sport } : undefined;
    return firstValueFrom(this.http.get<Court[]>(`${API_BASE_URL}/courts`, { params }));
  }

  listAll(): Promise<Court[]> {
    return firstValueFrom(this.http.get<Court[]>(`${API_BASE_URL}/courts/admin`));
  }

  availability(courtId: number, date: string): Promise<CourtAvailability> {
    return firstValueFrom(
      this.http.get<CourtAvailability>(`${API_BASE_URL}/courts/${courtId}/availability`, { params: { date } }),
    );
  }

  create(input: CreateCourtInput): Promise<Court> {
    return firstValueFrom(this.http.post<Court>(`${API_BASE_URL}/courts`, input));
  }

  update(id: number, data: UpdateCourtInput): Promise<Court> {
    return firstValueFrom(this.http.put<Court>(`${API_BASE_URL}/courts/${id}`, data));
  }

  delete(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE_URL}/courts/${id}`));
  }

  listBlocks(courtId: number): Promise<CourtBlock[]> {
    return firstValueFrom(this.http.get<CourtBlock[]>(`${API_BASE_URL}/courts/${courtId}/blocks`));
  }

  createBlock(courtId: number, input: CreateBlockInput): Promise<CourtBlock> {
    return firstValueFrom(this.http.post<CourtBlock>(`${API_BASE_URL}/courts/${courtId}/blocks`, input));
  }

  deleteBlock(courtId: number, blockId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE_URL}/courts/${courtId}/blocks/${blockId}`));
  }
}
