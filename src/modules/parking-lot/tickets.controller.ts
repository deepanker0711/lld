import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParkingService } from './parking.service';

@ApiTags('Parking Lot')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly service: ParkingService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getTicket(id);
  }
}
