import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateRuleDto, UpdateRuleDto } from './dto/rate-limit-rule.dto';
import { RateLimit } from './rate-limit.decorator';
import { RateLimiterService } from './rate-limiter.service';

@ApiTags('Rate Limiter')
@Controller('rate-limits')
export class RateLimiterController {
  constructor(private readonly service: RateLimiterService) {}

  @Post('rules')
  create(@Body() dto: CreateRuleDto) {
    return this.service.createRule(dto);
  }

  @Get('rules')
  list() {
    return this.service.listRules();
  }

  @Get('rules/:key')
  get(@Param('key') key: string) {
    return this.service.getRule(key);
  }

  @Patch('rules/:key')
  update(@Param('key') key: string, @Body() dto: UpdateRuleDto) {
    return this.service.updateRule(key, dto);
  }

  @Delete('rules/:key')
  remove(@Param('key') key: string) {
    return this.service.deleteRule(key);
  }

  /** Allowance left for a client, without using any of it. */
  @Get('usage/:clientId')
  usage(@Param('clientId') clientId: string, @Query('rule') rule = 'default') {
    return this.service.usage(rule, clientId);
  }
}

/** Demo endpoints. Send `x-client-id` to act as different clients. */
@ApiTags('Rate Limiter')
@Controller('limited')
@RateLimit('default')
export class LimitedDemoController {
  @Get('ping')
  ping() {
    return { pong: true };
  }

  /** Method-level metadata overrides the class-level 'default'. */
  @Get('search')
  @RateLimit('search')
  search(@Query('q') q = '') {
    return { q, results: [] };
  }
}
