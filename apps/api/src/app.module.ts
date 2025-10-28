/**
 * 픽업 서비스 API 메인 모듈
 * 모든 모듈과 설정을 통합
 * 
 * @author DOCORE
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { CompatModule } from './compat/compat.module';
import { AiModule } from './ai/ai.module';
import { CacheModule } from './cache/cache.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    
    // 헬스체크 모듈
    HealthModule,
    
    // 기존 API 호환 레이어
    CompatModule,
    
    // AI 서비스 모듈
    AiModule,
    
    // 캐시 서비스 모듈
    CacheModule,
    
    // 서킷 브레이커 모듈
    CircuitBreakerModule,
  ],
})
export class AppModule {}
