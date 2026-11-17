import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RawValue } from '../../../common/validators/raw-value';
import { FoodOrderStatus } from '../domain/order-status';
import { AgentStatus } from '../entities/entities';

export class GeoDto {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

export class MenuItemDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsInt() @Min(1) @Max(100_000_00) pricePaise: number;
}

export class CreateRestaurantDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;

  @ValidateNested() @Type(() => GeoDto) location: GeoDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menu: MenuItemDto[];
}

export class NearbyQuery {
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

export class SetOpenDto {
  @RawValue() @IsBoolean() isOpen: boolean;
}

export class SetAvailabilityDto {
  @RawValue() @IsBoolean() available: boolean;
}

export class CreateAgentDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @ValidateNested() @Type(() => GeoDto) location: GeoDto;
}

export class AgentStatusDto {
  /** BUSY is set by the system on assignment, never by the agent. */
  @IsEnum([AgentStatus.AVAILABLE, AgentStatus.OFFLINE], { message: 'status must be AVAILABLE or OFFLINE' })
  status: AgentStatus.AVAILABLE | AgentStatus.OFFLINE;
}

export class OrderLineDto {
  @IsString() @IsNotEmpty() menuItemId: string;
  @IsInt() @Min(1) @Max(20) qty: number;
}

export class PlaceFoodOrderDto {
  /** From the auth token in a real app. */
  @IsString() @IsNotEmpty() customerId: string;
  @IsString() @IsNotEmpty() restaurantId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];

  @ValidateNested() @Type(() => GeoDto) deliveryLocation: GeoDto;
}

export class RestaurantActionDto {
  @IsString() @IsNotEmpty() restaurantId: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class AgentActionDto {
  @IsString() @IsNotEmpty() agentId: string;
}

/** Exactly one of customerId / restaurantId: who is cancelling. */
export class CancelFoodOrderDto {
  @IsOptional() @IsString() @IsNotEmpty() customerId?: string;
  @IsOptional() @IsString() @IsNotEmpty() restaurantId?: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class FoodOrdersQuery {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsEnum(FoodOrderStatus) status?: FoodOrderStatus;
}
