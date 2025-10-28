/**
 * 404 체크 스크립트
 * 모든 API 엔드포인트의 404/5xx 에러 확인
 * 
 * @author DOCORE
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('check-404');

interface RouteInfo {
  method: string;
  path: string;
  description: string;
}

interface CheckResult {
  route: RouteInfo;
  status: number;
  success: boolean;
  error?: string;
  responseTime: number;
}

class RouteChecker {
  private baseUrl: string;
  private results: CheckResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async checkAllRoutes(): Promise<CheckResult[]> {
    logger.info('🔍 API 엔드포인트 404 체크 시작...');

    const routes = this.loadRoutesFromManifest();
    
    for (const route of routes) {
      await this.checkRoute(route);
    }

    this.printResults();
    return this.results;
  }

  private loadRoutesFromManifest(): RouteInfo[] {
    try {
      const manifestPath = join(process.cwd(), 'docs/route-manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      
      const routes: RouteInfo[] = [];
      
      for (const [path, methods] of Object.entries(manifest)) {
        for (const [method, info] of Object.entries(methods as any)) {
          routes.push({
            method: method.toUpperCase(),
            path: path,
            description: info.description || '',
          });
        }
      }

      return routes;
    } catch (error) {
      logger.warn('라우트 매니페스트를 읽을 수 없습니다. 기본 라우트를 사용합니다.');
      return this.getDefaultRoutes();
    }
  }

  private getDefaultRoutes(): RouteInfo[] {
    return [
      { method: 'GET', path: '/healthz', description: '헬스체크' },
      { method: 'GET', path: '/api/data', description: '전체 데이터 조회' },
      { method: 'GET', path: '/api/stores', description: '가게 목록 조회' },
      { method: 'GET', path: '/api/current-store', description: '현재 가게 조회' },
      { method: 'GET', path: '/api/settings', description: '설정 조회' },
      { method: 'GET', path: '/api/activity-logs', description: '활동 로그 조회' },
      { method: 'GET', path: '/api/release-notes', description: '릴리즈 노트 조회' },
      { method: 'GET', path: '/api/superadmin/info', description: '슈퍼어드민 정보 조회' },
    ];
  }

  private async checkRoute(route: RouteInfo): Promise<void> {
    const startTime = Date.now();
    
    try {
      const url = `${this.baseUrl}${route.path}`;
      const response = await fetch(url, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseTime = Date.now() - startTime;
      const success = response.status < 400;

      this.results.push({
        route,
        status: response.status,
        success,
        responseTime,
      });

      if (success) {
        logger.info(`✅ ${route.method} ${route.path} - ${response.status} (${responseTime}ms)`);
      } else {
        logger.error(`❌ ${route.method} ${route.path} - ${response.status} (${responseTime}ms)`);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.results.push({
        route,
        status: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });

      logger.error(`❌ ${route.method} ${route.path} - 연결 실패 (${responseTime}ms)`, error);
    }
  }

  private printResults(): void {
    const total = this.results.length;
    const success = this.results.filter(r => r.success).length;
    const failed = total - success;

    logger.info('📊 404 체크 결과:');
    logger.info(`   총 라우트: ${total}개`);
    logger.info(`   성공: ${success}개`);
    logger.info(`   실패: ${failed}개`);
    logger.info(`   성공률: ${((success / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      logger.error('❌ 실패한 라우트:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          logger.error(`   ${r.route.method} ${r.route.path} - ${r.status} ${r.error || ''}`);
        });
    }

    // 평균 응답 시간
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.responseTime, 0) / total;
    logger.info(`   평균 응답 시간: ${avgResponseTime.toFixed(0)}ms`);

    // 가장 느린 라우트
    const slowest = this.results.reduce((prev, current) => 
      prev.responseTime > current.responseTime ? prev : current
    );
    logger.info(`   가장 느린 라우트: ${slowest.route.method} ${slowest.route.path} (${slowest.responseTime}ms)`);
  }

  hasFailures(): boolean {
    return this.results.some(r => !r.success);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3001';

  logger.info(`🔍 API 엔드포인트 404 체크 시작 (${baseUrl})`);

  const checker = new RouteChecker(baseUrl);
  const results = await checker.checkAllRoutes();

  if (checker.hasFailures()) {
    logger.error('❌ 일부 라우트에서 404/5xx 에러가 발생했습니다.');
    process.exit(1);
  } else {
    logger.info('✅ 모든 라우트가 정상적으로 응답합니다.');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

export { RouteChecker };