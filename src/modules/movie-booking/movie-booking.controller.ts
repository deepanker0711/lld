import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { MovieCatalogService } from './catalog.service';
import {
  CancelBookingDto,
  ConfirmBookingDto,
  CreateCinemaDto,
  CreateMovieDto,
  CreateShowDto,
  HoldSeatsDto,
  ShowsQuery,
} from './dto/dto';

@ApiTags('Movie Booking')
@Controller()
export class MovieBookingController {
  constructor(
    private readonly catalog: MovieCatalogService,
    private readonly bookings: BookingService,
  ) {}

  @Post('cinemas')
  createCinema(@Body() dto: CreateCinemaDto) {
    return this.catalog.createCinema(dto);
  }

  @Get('cinemas')
  cinemas() {
    return this.catalog.listCinemas();
  }

  @Post('movies')
  createMovie(@Body() dto: CreateMovieDto) {
    return this.catalog.createMovie(dto);
  }

  @Get('movies')
  movies() {
    return this.catalog.listMovies();
  }

  @Post('shows')
  createShow(@Body() dto: CreateShowDto) {
    return this.catalog.createShow(dto);
  }

  @Get('shows')
  shows(@Query() q: ShowsQuery) {
    return this.catalog.listShows(q);
  }

  @Get('shows/:id/seats')
  seats(@Param('id') id: string) {
    return this.bookings.seatMap(id);
  }

  /** Hold seats for 5 minutes → 201 booking in HELD. */
  @Post('shows/:id/bookings')
  hold(@Param('id') id: string, @Body() dto: HoldSeatsDto) {
    return this.bookings.hold(id, dto);
  }

  @Get('bookings/:id')
  booking(@Param('id') id: string) {
    return this.bookings.get(id);
  }

  @Post('bookings/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id') id: string, @Body() dto: ConfirmBookingDto) {
    return this.bookings.confirm(id, dto.userId, dto.paymentToken);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookings.cancel(id, dto.userId);
  }
}
