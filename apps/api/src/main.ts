/**
 * 픽업 서비스 API 서버 메인 엔트리포인트
 * NestJS + Prisma + Pino 로깅 + Helmet + CORS
 * 
 * @author DOCORE
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createLogger } from '@pickup/shared';

const logger = createLogger('api-main');

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);
    const port = configService.get('PORT', 3001);
    const apiPrefix = configService.get('API_PREFIX', 'api');

    // 글로벌 파이프 설정
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Helmet 보안 헤더 설정
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS 설정
    const corsOrigin = configService.get('CORS_ORIGIN', 'http://localhost:3000');
    app.enableCors({
      origin: corsOrigin.split(',').map(origin => origin.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });

    // API 프리픽스 설정
    app.setGlobalPrefix(apiPrefix);

    // 서버 시작
    await app.listen(port);
    
    logger.info(`🚀 픽업 API 서버가 포트 ${port}에서 시작되었습니다`);
    logger.info(`📡 API 엔드포인트: http://localhost:${port}/${apiPrefix}`);
    logger.info(`🏥 헬스체크: http://localhost:${port}/healthz`);
    logger.info(`🔧 데이터 백엔드: ${configService.get('DATA_BACKEND', 'json')}`);
    
  } catch (error) {
    logger.error('서버 시작 실패', error);
    process.exit(1);
  }
}

bootstrap();
