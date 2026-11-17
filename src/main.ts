import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = new DocumentBuilder().setTitle('LLD Practice').setVersion('1.0').build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API on http://localhost:${port}  |  Swagger on http://localhost:${port}/docs`, 'Bootstrap');
}
void bootstrap();
