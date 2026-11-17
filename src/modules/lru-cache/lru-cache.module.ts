import { Module } from '@nestjs/common';
import { CacheManagerService } from './cache-manager.service';
import { LruCacheController } from './lru-cache.controller';

@Module({
  controllers: [LruCacheController],
  providers: [CacheManagerService],
})
export class LruCacheModule {}
