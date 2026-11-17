import { Inject, Injectable } from '@nestjs/common';
import { BadRequestError, ConflictError } from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { BOOKING_OPTIONS, type BookingOptions } from './domain/booking-options';
import { expandLayout, SeatType } from './domain/seat';
import { CreateCinemaDto, CreateMovieDto, CreateShowDto, ShowsQuery } from './dto/dto';
import { Cinema, Movie, Screen, Show } from './entities/entities';
import { CinemaRepository, MovieRepository, ScreenRepository, ShowRepository } from './repositories';

@Injectable()
export class MovieCatalogService {
  constructor(
    private readonly cinemas: CinemaRepository,
    private readonly screens: ScreenRepository,
    private readonly movies: MovieRepository,
    private readonly shows: ShowRepository,
    private readonly clock: Clock,
    @Inject(BOOKING_OPTIONS) private readonly options: BookingOptions,
  ) {}

  createCinema(dto: CreateCinemaDto): Cinema & { screens: Screen[] } {
    for (const s of dto.screens) {
      const rows = s.rows.map((r) => r.row);
      if (new Set(rows).size !== rows.length) throw new BadRequestError(`Screen '${s.name}' repeats a row letter`);
    }
    const cinema = this.cinemas.create({ name: dto.name, city: dto.city.trim() });
    const screens = dto.screens.map((s) =>
      this.screens.create({
        cinemaId: cinema.id,
        name: s.name,
        layout: s.rows.map((r) => ({ ...r })),
        seats: expandLayout(s.rows),
      }),
    );
    return { ...cinema, screens };
  }

  listCinemas(): (Cinema & { screens: { id: string; name: string; seats: number }[] })[] {
    return this.cinemas.findAll().map((c) => ({
      ...c,
      screens: this.screens.findByCinema(c.id).map((s) => ({ id: s.id, name: s.name, seats: s.seats.length })),
    }));
  }

  createMovie(dto: CreateMovieDto): Movie {
    return this.movies.create({ ...dto });
  }

  listMovies(): Movie[] {
    return this.movies.findAll();
  }

  /** A screen runs one show at a time, with a cleaning gap after each. */
  createShow(dto: CreateShowDto): Show {
    const movie = this.movies.findByIdOrThrow(dto.movieId);
    const screen = this.screens.findByIdOrThrow(dto.screenId);
    const startsAt = new Date(dto.startsAt);
    if (startsAt.getTime() <= this.clock.now()) throw new BadRequestError('startsAt must be in the future');

    const typesOnScreen = [...new Set(screen.seats.map((s) => s.type))];
    const missing = typesOnScreen.filter((t) => !dto.prices[t]);
    if (missing.length) throw new BadRequestError(`Missing prices for seat types: ${missing.join(', ')}`);

    const endsAt = new Date(startsAt.getTime() + movie.durationMin * 60_000);
    const busyUntil = (s: Show) => s.endsAt.getTime() + this.options.turnaroundMs;
    const clash = this.shows
      .findByScreen(screen.id)
      .find((s) => s.startsAt.getTime() < endsAt.getTime() + this.options.turnaroundMs && startsAt.getTime() < busyUntil(s));
    if (clash) {
      throw new ConflictError(`Screen is busy: show '${clash.id}' runs ${clash.startsAt.toISOString()}–${clash.endsAt.toISOString()} (+ cleaning)`, {
        showId: clash.id,
      });
    }

    const prices = Object.fromEntries(
      Object.values(SeatType).map((t) => [t, dto.prices[t] ?? 0]),
    ) as Record<SeatType, number>;
    return this.shows.create({ movieId: movie.id, screenId: screen.id, cinemaId: screen.cinemaId, startsAt, endsAt, prices });
  }

  listShows(q: ShowsQuery): (Show & { movieTitle: string; cinemaName: string; city: string })[] {
    const now = this.clock.now();
    return this.shows
      .findAll((s) => s.startsAt.getTime() > now && (!q.movieId || s.movieId === q.movieId))
      .map((s) => {
        const cinema = this.cinemas.findByIdOrThrow(s.cinemaId);
        return { ...s, movieTitle: this.movies.findByIdOrThrow(s.movieId).title, cinemaName: cinema.name, city: cinema.city };
      })
      .filter((s) => !q.city || s.city.toLowerCase() === q.city.toLowerCase())
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
}
