/**
 * 헬스체크 모듈
 * /healthz 엔드포인트 제공
 * 
 * @author DOCORE
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
