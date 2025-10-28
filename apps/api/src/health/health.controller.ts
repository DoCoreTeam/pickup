/**
 * 헬스체크 컨트롤러
 * /healthz 엔드포인트 제공
 * 
 * @author DOCORE
 */

import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    return this.healthService.getHealthStatus();
  }
}
