/**
 * API 통합 테스트
 * JSON vs PostgreSQL 엔드포인트 응답 비교
 * 
 * @author DOCORE
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createLogger } from '@pickup/shared';

const logger = createLogger('api-comparison-test');

// 테스트 설정
const JSON_API_BASE = 'http://localhost:8081/api';
const POSTGRES_API_BASE = 'http://localhost:3001/api';

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: any;
  message?: string;
}

class ApiComparisonTester {
  private jsonApiBase: string;
  private postgresApiBase: string;

  constructor(jsonApiBase: string, postgresApiBase: string) {
    this.jsonApiBase = jsonApiBase;
    this.postgresApiBase = postgresApiBase;
  }

  async compareEndpoint(method: string, endpoint: string, body?: any): Promise<{
    jsonResponse: ApiResponse;
    postgresResponse: ApiResponse;
    matches: boolean;
    differences: string[];
  }> {
    logger.info(`🔍 엔드포인트 비교: ${method} ${endpoint}`);

    const [jsonResponse, postgresResponse] = await Promise.all([
      this.makeRequest(this.jsonApiBase + endpoint, method, body),
      this.makeRequest(this.postgresApiBase + endpoint, method, body),
    ]);

    const differences = this.findDifferences(jsonResponse, postgresResponse);
    const matches = differences.length === 0;

    return {
      jsonResponse,
      postgresResponse,
      matches,
      differences,
    };
  }

  private async makeRequest(url: string, method: string, body?: any): Promise<ApiResponse> {
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();

      return {
        success: response.ok,
        data: data.data || data,
        error: data.error,
        message: data.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private findDifferences(jsonResponse: ApiResponse, postgresResponse: ApiResponse): string[] {
    const differences: string[] = [];

    // success 상태 비교
    if (jsonResponse.success !== postgresResponse.success) {
      differences.push(`Success status: JSON=${jsonResponse.success}, PostgreSQL=${postgresResponse.success}`);
    }

    // 데이터 구조 비교
    if (jsonResponse.data && postgresResponse.data) {
      const dataDiff = this.compareObjects(jsonResponse.data, postgresResponse.data, 'data');
      differences.push(...dataDiff);
    }

    // 에러 메시지 비교
    if (jsonResponse.error && postgresResponse.error) {
      if (JSON.stringify(jsonResponse.error) !== JSON.stringify(postgresResponse.error)) {
        differences.push(`Error messages differ: JSON=${JSON.stringify(jsonResponse.error)}, PostgreSQL=${JSON.stringify(postgresResponse.error)}`);
      }
    }

    return differences;
  }

  private compareObjects(obj1: any, obj2: any, path: string = ''): string[] {
    const differences: string[] = [];

    if (typeof obj1 !== typeof obj2) {
      differences.push(`${path}: Type mismatch (${typeof obj1} vs ${typeof obj2})`);
      return differences;
    }

    if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
      if (obj1 !== obj2) {
        differences.push(`${path}: Value mismatch (${obj1} vs ${obj2})`);
      }
      return differences;
    }

    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) {
        differences.push(`${path}: Array length mismatch (${obj1.length} vs ${obj2.length})`);
      }

      const maxLength = Math.max(obj1.length, obj2.length);
      for (let i = 0; i < maxLength; i++) {
        const itemDiff = this.compareObjects(obj1[i], obj2[i], `${path}[${i}]`);
        differences.push(...itemDiff);
      }
    } else {
      const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
      
      for (const key of allKeys) {
        const keyPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj1)) {
          differences.push(`${keyPath}: Missing in JSON`);
        } else if (!(key in obj2)) {
          differences.push(`${keyPath}: Missing in PostgreSQL`);
        } else {
          const keyDiff = this.compareObjects(obj1[key], obj2[key], keyPath);
          differences.push(...keyDiff);
        }
      }
    }

    return differences;
  }
}

describe('API Integration Tests', () => {
  let tester: ApiComparisonTester;

  beforeAll(() => {
    tester = new ApiComparisonTester(JSON_API_BASE, POSTGRES_API_BASE);
  });

  describe('GET Endpoints', () => {
    it('should return same data for /api/data', async () => {
      const result = await tester.compareEndpoint('GET', '/data');
      
      expect(result.matches).toBe(true);
      if (!result.matches) {
        logger.error('GET /api/data differences:', result.differences);
      }
    });

    it('should return same data for /api/stores', async () => {
      const result = await tester.compareEndpoint('GET', '/stores');
      
      expect(result.matches).toBe(true);
      if (!result.matches) {
        logger.error('GET /api/stores differences:', result.differences);
      }
    });

    it('should return same data for /api/current-store', async () => {
      const result = await tester.compareEndpoint('GET', '/current-store');
      
      expect(result.matches).toBe(true);
      if (!result.matches) {
        logger.error('GET /api/current-store differences:', result.differences);
      }
    });

    it('should return same data for /api/superadmin/info', async () => {
      const result = await tester.compareEndpoint('GET', '/superadmin/info');
      
      expect(result.matches).toBe(true);
      if (!result.matches) {
        logger.error('GET /api/superadmin/info differences:', result.differences);
      }
    });

    it('should return same data for /api/activity-logs', async () => {
      const result = await tester.compareEndpoint('GET', '/activity-logs');
      
      expect(result.matches).toBe(true);
      if (!result.matches) {
        logger.error('GET /api/activity-logs differences:', result.differences);
      }
    });

    it('should return same data for /api/release-notes', async () => {
      const result = await tester.compareEndpoint('GET', '/release-notes');
      
      expect(result.matches).toBe(true);
      if (!result.matches) {
        logger.error('GET /api/release-notes differences:', result.differences);
      }
    });
  });

  describe('POST Endpoints', () => {
    it('should handle store creation consistently', async () => {
      const storeData = {
        id: 'test_store_' + Date.now(),
        name: '테스트 가게',
        subtitle: '테스트 부제목',
        phone: '010-1234-5678',
        address: '테스트 주소',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      };

      const result = await tester.compareEndpoint('POST', '/stores', storeData);
      
      // JSON 어댑터는 읽기 전용이므로 에러가 예상됨
      expect(result.jsonResponse.success).toBe(false);
      expect(result.postgresResponse.success).toBe(true);
    });

    it('should handle activity log creation consistently', async () => {
      const logData = {
        id: 'test_log_' + Date.now(),
        type: 'test',
        action: 'create',
        description: '테스트 로그',
        timestamp: new Date().toISOString(),
      };

      const result = await tester.compareEndpoint('POST', '/activity-logs', logData);
      
      // JSON 어댑터는 읽기 전용이므로 에러가 예상됨
      expect(result.jsonResponse.success).toBe(false);
      expect(result.postgresResponse.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors consistently', async () => {
      const result = await tester.compareEndpoint('GET', '/stores/nonexistent');
      
      // 둘 다 404 에러를 반환해야 함
      expect(result.jsonResponse.success).toBe(false);
      expect(result.postgresResponse.success).toBe(false);
    });

    it('should handle invalid data consistently', async () => {
      const invalidData = {
        // 필수 필드 누락
        invalid: 'data',
      };

      const result = await tester.compareEndpoint('POST', '/stores', invalidData);
      
      // 둘 다 유효성 검사 에러를 반환해야 함
      expect(result.jsonResponse.success).toBe(false);
      expect(result.postgresResponse.success).toBe(false);
    });
  });

  describe('Performance Comparison', () => {
    it('should have similar response times', async () => {
      const iterations = 10;
      const jsonTimes: number[] = [];
      const postgresTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // JSON API 응답 시간 측정
        const jsonStart = Date.now();
        await tester.makeRequest(JSON_API_BASE + '/stores', 'GET');
        jsonTimes.push(Date.now() - jsonStart);

        // PostgreSQL API 응답 시간 측정
        const postgresStart = Date.now();
        await tester.makeRequest(POSTGRES_API_BASE + '/stores', 'GET');
        postgresTimes.push(Date.now() - postgresStart);
      }

      const avgJsonTime = jsonTimes.reduce((a, b) => a + b, 0) / jsonTimes.length;
      const avgPostgresTime = postgresTimes.reduce((a, b) => a + b, 0) / postgresTimes.length;

      logger.info(`평균 응답 시간 - JSON: ${avgJsonTime}ms, PostgreSQL: ${avgPostgresTime}ms`);

      // PostgreSQL이 JSON보다 2배 이상 느리지 않아야 함
      expect(avgPostgresTime).toBeLessThan(avgJsonTime * 2);
    });
  });
});
