import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { UnauthorizedExceptionFilter } from './common/filters/unauthorized-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  // Set global API prefix
  app.setGlobalPrefix('api');
  
  // Enable cookie parser
  app.use(cookieParser());
  
  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable global exception filter for unauthorized exceptions
  app.useGlobalFilters(new UnauthorizedExceptionFilter());
  
  // Note: WebSocket (Socket.IO) CORS is configured in WhiteboardGateway
  // The gateway is accessible at /whiteboard namespace
  
  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();

