import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config';
import { HoldBookingInput, Booking, PaymentMethod } from '../models/booking.model';

export interface UsageReportRow {
  courtId: number;
  totalBookings: number;
  totalRevenue: number;
}

export interface UsageReportFilters {
  startDate?: string;
  endDate?: string;
  courtId?: number;
  sport?: string;
}

export interface CreateManualBookingInput {
  courtId: number;
  customerEmail: string;
  start: string;
  end: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  constructor(private readonly http: HttpClient) {}

  hold(input: HoldBookingInput): Promise<Booking> {
    return firstValueFrom(this.http.post<Booking>(`${API_BASE_URL}/bookings`, input));
  }

  pay(id: number, paymentMethod: PaymentMethod): Promise<Booking> {
    return firstValueFrom(this.http.post<Booking>(`${API_BASE_URL}/bookings/${id}/pay`, { paymentMethod }));
  }

  cancel(id: number): Promise<Booking> {
    return firstValueFrom(this.http.delete<Booking>(`${API_BASE_URL}/bookings/${id}`));
  }

  history(): Promise<Booking[]> {
    return firstValueFrom(this.http.get<Booking[]>(`${API_BASE_URL}/bookings/history`));
  }

  listAll(): Promise<Booking[]> {
    return firstValueFrom(this.http.get<Booking[]>(`${API_BASE_URL}/bookings/admin`));
  }

  createManual(input: CreateManualBookingInput): Promise<Booking> {
    return firstValueFrom(this.http.post<Booking>(`${API_BASE_URL}/bookings/admin`, input));
  }

  markNoShow(id: number): Promise<Booking> {
    return firstValueFrom(this.http.patch<Booking>(`${API_BASE_URL}/bookings/${id}/no-show`, {}));
  }

  report(filters: UsageReportFilters = {}): Promise<UsageReportRow[]> {
    const params: Record<string, string> = {};
    if (filters.startDate) params['startDate'] = filters.startDate;
    if (filters.endDate) params['endDate'] = filters.endDate;
    if (filters.courtId) params['courtId'] = String(filters.courtId);
    if (filters.sport) params['sport'] = filters.sport;
    return firstValueFrom(this.http.get<UsageReportRow[]>(`${API_BASE_URL}/bookings/report`, { params }));
  }
}
