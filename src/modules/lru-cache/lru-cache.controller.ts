import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CacheManagerService } from './cache-manager.service';
import { CreateCacheDto } from './dto/create-cache.dto';
import { PutValueDto } from './dto/put-value.dto';

@ApiTags('LRU Cache')
@Controller('caches')
export class LruCacheController {
  constructor(private readonly caches: CacheManagerService) {}

  @Post()
  create(@Body() dto: CreateCacheDto) {
    return this.caches.create(dto);
  }

  @Get()
  list() {
    return this.caches.list();
  }

  @Get(':name')
  describe(@Param('name') name: string) {
    return this.caches.describe(name);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.caches.remove(name);
  }

  @Get(':name/stats')
  stats(@Param('name') name: string) {
    return this.caches.stats(name);
  }

  /** Entries ordered most -> least recently used. Does not change recency. */
  @Get(':name/keys')
  entries(@Param('name') name: string) {
    return this.caches.entries(name);
  }

  @Put(':name/keys/:key')
  @HttpCode(200)
  put(@Param('name') name: string, @Param('key') key: string, @Body() dto: PutValueDto) {
    return this.caches.put(name, key, dto.value, dto.ttlMs);
  }

  @Get(':name/keys/:key')
  get(@Param('name') name: string, @Param('key') key: string) {
    return this.caches.get(name, key);
  }

  @Delete(':name/keys/:key')
  deleteKey(@Param('name') name: string, @Param('key') key: string) {
    return this.caches.deleteKey(name, key);
  }
}
