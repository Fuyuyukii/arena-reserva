import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BookingService, UsageReportRow } from '../../../core/services/booking.service';
import { CourtService } from '../../../core/services/court.service';
import { Court } from '../../../core/models/court.model';

interface ReportRow extends UsageReportRow {
  courtName: string;
}

function defaultFilters(): { startDate: string; endDate: string; courtId: number | null; sport: string } {
  return { startDate: '', endDate: '', courtId: null, sport: '' };
}

@Component({
  selector: 'app-admin-report',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-report.html',
  styleUrl: './admin-report.scss',
})
export class AdminReport implements OnInit {
  rows = signal<ReportRow[]>([]);
  courts = signal<Court[]>([]);
  loading = signal(true);
  filters = defaultFilters();

  get sportOptions(): string[] {
    return [...new Set(this.courts().flatMap((c) => c.sports))].sort();
  }

  get totalBookings(): number {
    return this.rows().reduce((sum, r) => sum + r.totalBookings, 0);
  }

  get totalRevenue(): number {
    return this.rows().reduce((sum, r) => sum + r.totalRevenue, 0);
  }

  constructor(
    private readonly bookingService: BookingService,
    private readonly courtService: CourtService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.courts.set(await this.courtService.listAll());
    await this.load();
  }

  async applyFilters(): Promise<void> {
    await this.load();
  }

  async clearFilters(): Promise<void> {
    this.filters = defaultFilters();
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const report = await this.bookingService.report({
        startDate: this.filters.startDate || undefined,
        endDate: this.filters.endDate || undefined,
        courtId: this.filters.courtId ?? undefined,
        sport: this.filters.sport || undefined,
      });
      const namesById = new Map(this.courts().map((c) => [c.id, c.name]));
      this.rows.set(
        report
          .map((row) => ({ ...row, courtName: namesById.get(row.courtId) ?? `Quadra #${row.courtId}` }))
          .sort((a, b) => b.totalRevenue - a.totalRevenue),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
