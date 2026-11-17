import { IsNotEmpty, IsString } from 'class-validator';

export class UnparkVehicleDto {
  @IsString()
  @IsNotEmpty()
  ticketId: string;
}
