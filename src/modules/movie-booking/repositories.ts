import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { Booking, Cinema, Movie, Screen, Show } from './entities/entities';

function indexPush(map: Map<string, string[]>, key: string, id: string) {
  map.set(key, [...(map.get(key) ?? []), id]);
}

@Injectable()
export class CinemaRepository extends InMemoryRepository<Cinema> {
  constructor() {
    super('Cinema', 'cin');
  }
}

@Injectable()
export class ScreenRepository extends InMemoryRepository<Screen> {
  private readonly byCinema = new Map<string, string[]>();
  constructor() {
    super('Screen', 'scr');
  }
  override create(data: CreateInput<Screen>): Screen {
    const s = super.create(data);
    indexPush(this.byCinema, s.cinemaId, s.id);
    return s;
  }
  findByCinema(cinemaId: string): Screen[] {
    return (this.byCinema.get(cinemaId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}

@Injectable()
export class MovieRepository extends InMemoryRepository<Movie> {
  constructor() {
    super('Movie', 'mov');
  }
}

@Injectable()
export class ShowRepository extends InMemoryRepository<Show> {
  private readonly byScreen = new Map<string, string[]>();
  constructor() {
    super('Show', 'shw');
  }
  override create(data: CreateInput<Show>): Show {
    const s = super.create(data);
    indexPush(this.byScreen, s.screenId, s.id);
    return s;
  }
  findByScreen(screenId: string): Show[] {
    return (this.byScreen.get(screenId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}

/**
 * Bookings, plus the seat map per show: showId → (seatCode → bookingId).
 * A seat is free when it has no entry. Only HELD/CONFIRMING/CONFIRMED bookings have entries.
 */
@Injectable()
export class BookingRepository extends InMemoryRepository<Booking> {
  private readonly seatOwners = new Map<string, Map<string, string>>();

  constructor() {
    super('Booking', 'bkg');
  }

  ownerOf(showId: string, seatCode: string): string | undefined {
    return this.seatOwners.get(showId)?.get(seatCode);
  }

  occupy(showId: string, seatCodes: string[], bookingId: string): void {
    const owners = this.seatOwners.get(showId) ?? new Map<string, string>();
    seatCodes.forEach((c) => owners.set(c, bookingId));
    this.seatOwners.set(showId, owners);
  }

  /** Frees only seats still owned by this booking. */
  free(showId: string, seatCodes: string[], bookingId: string): void {
    const owners = this.seatOwners.get(showId);
    seatCodes.forEach((c) => {
      if (owners?.get(c) === bookingId) owners.delete(c);
    });
  }
}
