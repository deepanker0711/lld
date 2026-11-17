import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { ParkingLot } from './entities/parking-lot.entity';

@Injectable()
export class ParkingLotRepository extends InMemoryRepository<ParkingLot> {
  constructor() {
    super('Parking lot', 'lot');
  }
}
