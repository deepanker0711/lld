import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateParkingLotDto } from './dto/create-parking-lot.dto';
import { ParkVehicleDto } from './dto/park-vehicle.dto';
import { UnparkVehicleDto } from './dto/unpark-vehicle.dto';
import { ParkingService } from './parking.service';

@ApiTags('Parking Lot')
@Controller('parking-lots')
export class ParkingLotsController {
  constructor(private readonly service: ParkingService) {}

  @Post()
  create(@Body() dto: CreateParkingLotDto) {
    return this.service.createLot(dto);
  }

  @Get()
  list() {
    return this.service.listLots();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getLot(id);
  }

  @Get(':id/availability')
  availability(@Param('id') id: string) {
    return this.service.availability(id);
  }

  /** 201: a ticket is created. */
  @Post(':id/park')
  park(@Param('id') id: string, @Body() dto: ParkVehicleDto) {
    return this.service.park(id, dto);
  }

  /** 200: an existing ticket is closed, nothing new is created. */
  @Post(':id/unpark')
  @HttpCode(200)
  unpark(@Param('id') id: string, @Body() dto: UnparkVehicleDto) {
    return this.service.unpark(id, dto.ticketId);
  }
}
