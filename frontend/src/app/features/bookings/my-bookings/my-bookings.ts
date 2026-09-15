import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingService } from '../../../core/services/booking.service';
import { Booking, BookingStatus } from '../../../core/models/booking.model';

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'pendente',
  CONFIRMED: 'confirmada',
  CANCELLED: 'cancelada',
  COMPLETED: 'concluída',
  NO_SHOW: 'não compareceu',
};

export function isUpcoming(booking: Booking): boolean {
  return (booking.status === 'PENDING' || booking.status === 'CONFIRMED') && new Date(booking.end) > new Date();
}

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './my-bookings.html',
  styleUrl: './my-bookings.scss',
})
export class MyBookings implements OnInit {
  bookings = signal<Booking[]>([]);
  loading = signal(true);
  cancelling = signal<number | null>(null);

  upcoming = computed(() =>
    this.bookings()
      .filter(isUpcoming)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
  );

  history = computed(() =>
    this.bookings()
      .filter((b) => !isUpcoming(b))
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
  );

  constructor(private readonly bookingService: BookingService) {}

  ngOnInit(): void {
    this.load();
  }

  label(status: BookingStatus): string {
    return STATUS_LABELS[status];
  }

  badgeClass(status: BookingStatus): string {
    if (status === 'CONFIRMED' || status === 'COMPLETED') return 'badge-ok';
    if (status === 'CANCELLED' || status === 'NO_SHOW') return 'badge-danger';
    return 'badge-warn';
  }

  canCancel(status: BookingStatus): boolean {
    return status === 'PENDING' || status === 'CONFIRMED';
  }

  async cancel(booking: Booking): Promise<void> {
    this.cancelling.set(booking.id);
    try {
      await this.bookingService.cancel(booking.id);
      await this.load();
    } finally {
      this.cancelling.set(null);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.bookings.set(await this.bookingService.history());
    } finally {
      this.loading.set(false);
    }
  }
}
