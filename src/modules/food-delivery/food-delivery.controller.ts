import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AgentActionDto,
  AgentStatusDto,
  CancelFoodOrderDto,
  CreateAgentDto,
  CreateRestaurantDto,
  FoodOrdersQuery,
  GeoDto,
  NearbyQuery,
  PlaceFoodOrderDto,
  RestaurantActionDto,
  SetAvailabilityDto,
  SetOpenDto,
} from './dto/dto';
import { FoodDeliveryService } from './food-delivery.service';

@ApiTags('Food Delivery')
@Controller()
export class FoodDeliveryController {
  constructor(private readonly service: FoodDeliveryService) {}

  // ── Restaurants ──
  @Post('restaurants')
  createRestaurant(@Body() dto: CreateRestaurantDto) {
    return this.service.createRestaurant(dto);
  }

  @Get('restaurants')
  restaurants(@Query() q: NearbyQuery) {
    return this.service.listRestaurants(q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined);
  }

  @Get('restaurants/:id')
  restaurant(@Param('id') id: string) {
    return this.service.getRestaurant(id);
  }

  @Post('restaurants/:id/open')
  @HttpCode(200)
  setOpen(@Param('id') id: string, @Body() dto: SetOpenDto) {
    return this.service.setOpen(id, dto.isOpen);
  }

  @Patch('restaurants/:id/menu/:itemId')
  setItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: SetAvailabilityDto) {
    return this.service.setItemAvailability(id, itemId, dto.available);
  }

  @Get('restaurants/:id/orders')
  restaurantOrders(@Param('id') id: string, @Query() q: FoodOrdersQuery) {
    return this.service.restaurantOrders(id, q.status);
  }

  // ── Agents ──
  @Post('delivery-agents')
  createAgent(@Body() dto: CreateAgentDto) {
    return this.service.createAgent(dto);
  }

  @Get('delivery-agents')
  agents() {
    return this.service.listAgents();
  }

  @Post('delivery-agents/:id/status')
  @HttpCode(200)
  agentStatus(@Param('id') id: string, @Body() dto: AgentStatusDto) {
    return this.service.setAgentStatus(id, dto.status);
  }

  @Post('delivery-agents/:id/location')
  @HttpCode(200)
  agentLocation(@Param('id') id: string, @Body() dto: GeoDto) {
    return this.service.updateAgentLocation(id, dto);
  }

  // ── Orders ──
  @Post('food-orders')
  place(@Body() dto: PlaceFoodOrderDto) {
    return this.service.place(dto);
  }

  @Get('food-orders')
  list(@Query() q: FoodOrdersQuery) {
    return q.customerId ? this.service.listForCustomer(q.customerId, q.status) : [];
  }

  @Get('food-orders/waiting-for-agent')
  waiting() {
    return this.service.waitingQueue();
  }

  @Get('food-orders/:id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post('food-orders/:id/accept')
  @HttpCode(200)
  accept(@Param('id') id: string, @Body() dto: RestaurantActionDto) {
    return this.service.accept(id, dto.restaurantId);
  }

  @Post('food-orders/:id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: RestaurantActionDto) {
    return this.service.reject(id, dto.restaurantId, dto.reason);
  }

  @Post('food-orders/:id/ready')
  @HttpCode(200)
  ready(@Param('id') id: string, @Body() dto: RestaurantActionDto) {
    return this.service.ready(id, dto.restaurantId);
  }

  @Post('food-orders/:id/pick-up')
  @HttpCode(200)
  pickUp(@Param('id') id: string, @Body() dto: AgentActionDto) {
    return this.service.pickUp(id, dto.agentId);
  }

  @Post('food-orders/:id/deliver')
  @HttpCode(200)
  deliver(@Param('id') id: string, @Body() dto: AgentActionDto) {
    return this.service.deliver(id, dto.agentId);
  }

  @Post('food-orders/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelFoodOrderDto) {
    return this.service.cancel(id, dto);
  }
}
