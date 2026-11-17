import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CreateShortUrlDto } from './dto/create-short-url.dto';
import { UrlShortenerService } from './url-shortener.service';

const baseUrlOf = (req: Request) => process.env.BASE_URL ?? `${req.protocol}://${req.get('host')}`;

@ApiTags('URL Shortener')
@Controller('urls')
export class UrlShortenerController {
  constructor(private readonly service: UrlShortenerService) {}

  /** 201 when a new code is created, 200 when an existing one is returned. */
  @Post()
  create(@Body() dto: CreateShortUrlDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { url, created } = this.service.create(dto, baseUrlOf(req));
    res.status(created ? 201 : 200);
    return url;
  }

  @Get(':code/stats')
  stats(@Param('code') code: string, @Req() req: Request) {
    return this.service.stats(code, baseUrlOf(req));
  }

  @Delete(':code')
  remove(@Param('code') code: string) {
    return this.service.remove(code);
  }
}

/**
 * Catch-all `GET /:code`. Lives in its own module that AppModule imports last,
 * so it can't shadow other routes like /health.
 */
@ApiTags('URL Shortener')
@Controller()
export class RedirectController {
  constructor(private readonly service: UrlShortenerService) {}

  /**
   * 302, not 301: browsers cache 301s forever, so later clicks would skip us
   * (no click counts, and deleting/expiring the link wouldn't take effect).
   */
  @Get(':code')
  redirect(@Param('code') code: string, @Res() res: Response) {
    const longUrl = this.service.resolve(code);
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.redirect(302, longUrl);
  }
}
