import { Transform } from 'class-transformer';
import { IsEnum, IsString, Matches } from 'class-validator';
import { VehicleType } from '../domain/vehicle-type';

export class ParkVehicleDto {
  /** "ka-01 ab 1234" → "KA01AB1234", so the same car can't sneak in twice with different spacing. */
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase()
      : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{4,12}$/, {
    message: 'vehicleNumber must be 4-12 letters or digits, e.g. KA01AB1234',
  })
  vehicleNumber: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;
}
