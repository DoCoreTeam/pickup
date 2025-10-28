/**
 * 상시 404 체커 스크립트
 * route-manifest.json을 읽어 각 라우트에 헬스 프로빙
 * 404/5xx 있으면 프로세스 실패
 * 
 * @author DOCORE
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('404-checker');

interface RouteManifest {
  routes: {
    GET: Array<{
      path: string;
      description: string;
      statusCode: number;
    }>;
    POST: Array<{
      path: string;
      description: string;
      statusCode: number;
    }>;
    PUT: Array<{
      path: string;
      description: string;
      statusCode: number;
    }>;
    DELETE: Array<{
      path: string;
      description: string;
      statusCode: number;
    }>;
  };
  baseUrl: string;
}

class RouteChecker {
  private baseUrl: string;
  private failedRoutes: Array<{ method: string; path: string; status: number; error: string }> = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async checkRoute(method: string, path: string, expectedStatus: number): Promise<boolean> {
    try {
      const url = `${this.baseUrl}${path}`;
      const startTime = Date.now();
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Pickup-404-Checker/1.0.0',
        },
        // 타임아웃 설정 (10초)
        signal: AbortSignal.timeout(10000),
      });

      const duration = Date.now() - startTime;
      const status = response.status;

      // 404 또는 5xx 에러 체크
      if (status === 404 || status >= 500) {
        this.failedRoutes.push({
          method,
          path,
          status,
          error: `HTTP ${status}`,
        });
        
        logger.error(`❌ ${method} ${path} - HTTP ${status} (${duration}ms)`);
        return false;
      }

      // 2xx 또는 3xx 성공
      if (status >= 200 && status < 400) {
        logger.info(`✅ ${method} ${path} - HTTP ${status} (${duration}ms)`);
        return true;
      }

      // 기타 상태 코드 (4xx 클라이언트 에러 등)
      logger.warn(`⚠️  ${method} ${path} - HTTP ${status} (${duration}ms)`);
      return true; // 4xx는 정상적인 응답으로 간주

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.failedRoutes.push({
        method,
        path,
        status: 0,
        error: errorMessage,
      });
      
      logger.error(`❌ ${method} ${path} - ${errorMessage}`);
      return false;
    }
  }

  async checkAllRoutes(manifest: RouteManifest): Promise<boolean> {
    logger.info('🔍 라우트 404 체크 시작...');
    logger.info(`📡 대상 서버: ${this.baseUrl}`);
    
    const allRoutes = [
      ...manifest.routes.GET.map(route => ({ method: 'GET', path: route.path, status: route.statusCode })),
      ...manifest.routes.POST.map(route => ({ method: 'POST', path: route.path, status: route.statusCode })),
      ...manifest.routes.PUT.map(route => ({ method: 'PUT', path: route.path, status: route.statusCode })),
      ...manifest.routes.DELETE.map(route => ({ method: 'DELETE', path: route.path, status: route.statusCode })),
    ];

    logger.info(`📊 총 ${allRoutes.length}개 라우트 체크 예정`);

    // 병렬로 체크 (최대 10개 동시)
    const batchSize = 10;
    for (let i = 0; i < allRoutes.length; i += batchSize) {
      const batch = allRoutes.slice(i, i + batchSize);
      await Promise.all(
        batch.map(route => 
          this.checkRoute(route.method, route.path, route.status)
        )
      );
      
      // 배치 간 잠시 대기 (서버 부하 방지)
      if (i + batchSize < allRoutes.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 결과 요약
    const successCount = allRoutes.length - this.failedRoutes.length;
    const failureCount = this.failedRoutes.length;

    logger.info('📋 체크 결과 요약:');
    logger.info(`✅ 성공: ${successCount}개`);
    logger.info(`❌ 실패: ${failureCount}개`);

    if (failureCount > 0) {
      logger.error('🚨 실패한 라우트 목록:');
      this.failedRoutes.forEach(route => {
        logger.error(`  - ${route.method} ${route.path}: ${route.error}`);
      });
    }

    return failureCount === 0;
  }

  getFailedRoutes() {
    return this.failedRoutes;
  }
}

async function main() {
  try {
    // route-manifest.json 읽기
    const manifestPath = join(process.cwd(), 'docs/route-manifest.json');
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest: RouteManifest = JSON.parse(manifestContent);

    // 서버 URL 설정
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    
    // 체커 실행
    const checker = new RouteChecker(baseUrl);
    const success = await checker.checkAllRoutes(manifest);

    if (success) {
      logger.info('🎉 모든 라우트 체크 완료 - 문제없음');
      process.exit(0);
    } else {
      logger.error('💥 라우트 체크 실패 - 404/5xx 발견');
      process.exit(1);
    }

  } catch (error) {
    logger.error('스크립트 실행 실패', error);
    process.exit(1);
  }
}

// 서버 시작 후 체크 실행
if (require.main === module) {
  main();
}

export { RouteChecker };
