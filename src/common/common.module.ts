import { Global, Module } from '@nestjs/common';
import { Clock } from './utils/clock';
import { SequenceGenerator } from './utils/id.generator';
import { KeyedMutex } from './utils/keyed-mutex';

/** Global so every feature module can inject these without importing. */
@Global()
@Module({
  providers: [Clock, SequenceGenerator, KeyedMutex],
  exports: [Clock, SequenceGenerator, KeyedMutex],
})
export class CommonModule {}
