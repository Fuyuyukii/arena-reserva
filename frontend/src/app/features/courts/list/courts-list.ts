import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourtService } from '../../../core/services/court.service';
import { Court } from '../../../core/models/court.model';

const SPORTS = ['Todos', 'Futsal', 'Vôlei'];

@Component({
  selector: 'app-courts-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './courts-list.html',
  styleUrl: './courts-list.scss',
})
export class CourtsList implements OnInit {
  readonly sports = SPORTS;
  filter = signal('Todos');
  courts = signal<Court[]>([]);
  loading = signal(true);

  constructor(private readonly courtService: CourtService) {}

  ngOnInit(): void {
    this.load();
  }

  async selectSport(sport: string): Promise<void> {
    this.filter.set(sport);
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const sport = this.filter() === 'Todos' ? undefined : this.filter();
      this.courts.set(await this.courtService.list(sport));
    } finally {
      this.loading.set(false);
    }
  }

  badgeClass(court: Court): string {
    if (court.sports.includes('Vôlei') && court.sports.length > 1) return 'badge-clay';
    if (court.sports.includes('Vôlei')) return 'badge-court';
    return 'badge-turf';
  }
}
