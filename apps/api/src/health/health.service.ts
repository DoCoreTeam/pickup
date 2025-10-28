/**
 * 헬스체크 서비스
 * 시스템 상태 확인 및 보고
 * 
 * @author DOCORE
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { checkDatabaseConnection } from '@pickup/db';
import { createLogger } from '@pickup/shared';

const logger = createLogger('health-service');

@Injectable()
export class HealthService {
  constructor(private configService: ConfigService) {}

  async getHealthStatus() {
    const startTime = Date.now();
    
    try {
      // 데이터베이스 연결 상태 확인
      const dbConnected = await checkDatabaseConnection();
      
      // 환경변수 확인
      const dataBackend = this.configService.get('DATA_BACKEND', 'json');
      const nodeEnv = this.configService.get('NODE_ENV', 'development');
      
      const responseTime = Date.now() - startTime;
      
      const healthStatus = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        environment: {
          nodeEnv,
          dataBackend,
          version: process.env.npm_package_version || '1.0.0',
        },
        services: {
          database: dbConnected ? 'healthy' : 'unhealthy',
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
      };

      // 데이터베이스 연결 실패 시 상태 변경
      if (!dbConnected) {
        healthStatus.status = 'degraded';
        healthStatus.services.database = 'unhealthy';
      }

      logger.info('헬스체크 완료', {
        status: healthStatus.status,
        responseTime: `${responseTime}ms`,
        dbConnected,
      });

      return healthStatus;
    } catch (error) {
      logger.error('헬스체크 실패', error);
      
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: error.message,
        services: {
          database: 'unhealthy',
        },
      };
    }
  }
}
