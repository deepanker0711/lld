import { Module } from '@nestjs/common';
import { Base62SequenceCodeGenerator, CODE_GENERATOR } from './domain/code-generator';
import { ShortUrlRepository } from './short-url.repository';
import { RedirectController, UrlShortenerController } from './url-shortener.controller';
import { UrlShortenerService } from './url-shortener.service';

@Module({
  controllers: [UrlShortenerController],
  providers: [
    UrlShortenerService,
    ShortUrlRepository,
    { provide: CODE_GENERATOR, useClass: Base62SequenceCodeGenerator },
  ],
  exports: [UrlShortenerService],
})
export class UrlShortenerModule {}

/** Import this LAST in AppModule: `GET /:code` matches any single path segment. */
@Module({
  imports: [UrlShortenerModule],
  controllers: [RedirectController],
})
export class UrlRedirectModule {}
