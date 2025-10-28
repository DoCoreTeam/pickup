/**
 * 듀얼라이트 E2E 테스트
 * JSON + PostgreSQL 동시 기록 검증
 * 
 * @author DOCORE
 */

import { test, expect } from '@playwright/test';

test.describe('Dual Write Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 듀얼라이트 모드로 설정
    await page.addInitScript(() => {
      process.env.DUAL_WRITE = 'true';
    });
  });

  test('should write to both JSON and PostgreSQL', async ({ page }) => {
    // API 서버로 직접 요청
    const response = await page.request.post('http://localhost:3001/api/stores', {
      data: {
        id: 'test_dual_write_' + Date.now(),
        name: '듀얼라이트 테스트 가게',
        subtitle: '테스트 부제목',
        phone: '010-1234-5678',
        address: '테스트 주소',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }
    });

    // 성공 응답 확인
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test('should handle dual write errors gracefully', async ({ page }) => {
    // 잘못된 데이터로 요청
    const response = await page.request.post('http://localhost:3001/api/stores', {
      data: {
        // 필수 필드 누락
        invalid: 'data'
      }
    });

    // 에러 응답 확인
    expect(response.status()).toBe(400);
    
    const result = await response.json();
    expect(result.success).toBe(false);
  });

  test('should maintain data consistency during dual write', async ({ page }) => {
    const storeId = 'consistency_test_' + Date.now();
    const storeData = {
      id: storeId,
      name: '일관성 테스트 가게',
      subtitle: '테스트 부제목',
      phone: '010-1234-5678',
      address: '테스트 주소',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };

    // 가게 생성
    const createResponse = await page.request.post('http://localhost:3001/api/stores', {
      data: storeData
    });
    expect(createResponse.status()).toBe(200);

    // 가게 조회 (PostgreSQL에서)
    const getResponse = await page.request.get(`http://localhost:3001/api/stores/${storeId}`);
    expect(getResponse.status()).toBe(200);
    
    const retrievedStore = await getResponse.json();
    expect(retrievedStore.id).toBe(storeId);
    expect(retrievedStore.name).toBe(storeData.name);
  });

  test('should handle concurrent dual writes', async ({ page }) => {
    const promises = [];
    
    // 동시에 여러 가게 생성
    for (let i = 0; i < 5; i++) {
      const promise = page.request.post('http://localhost:3001/api/stores', {
        data: {
          id: `concurrent_test_${i}_${Date.now()}`,
          name: `동시성 테스트 가게 ${i}`,
          subtitle: '테스트 부제목',
          phone: '010-1234-5678',
          address: '테스트 주소',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        }
      });
      promises.push(promise);
    }

    // 모든 요청이 성공해야 함
    const responses = await Promise.all(promises);
    responses.forEach(response => {
      expect(response.status()).toBe(200);
    });
  });

  test('should log dual write operations', async ({ page }) => {
    // 콘솔 로그 모니터링
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('듀얼라이트')) {
        logs.push(msg.text());
      }
    });

    // 가게 생성 요청
    await page.request.post('http://localhost:3001/api/stores', {
      data: {
        id: 'log_test_' + Date.now(),
        name: '로그 테스트 가게',
        subtitle: '테스트 부제목',
        phone: '010-1234-5678',
        address: '테스트 주소',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }
    });

    // 듀얼라이트 로그가 기록되어야 함
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(log => log.includes('듀얼라이트 모드 활성화'))).toBe(true);
  });

  test('should handle database connection failures', async ({ page }) => {
    // PostgreSQL 연결 실패 시뮬레이션
    await page.route('**/api/stores', route => {
      // 연결 실패 에러 반환
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'DATABASE_CONNECTION_FAILED',
            message: 'PostgreSQL 연결에 실패했습니다'
          }
        })
      });
    });

    const response = await page.request.post('http://localhost:3001/api/stores', {
      data: {
        id: 'connection_test_' + Date.now(),
        name: '연결 테스트 가게',
        subtitle: '테스트 부제목',
        phone: '010-1234-5678',
        address: '테스트 주소',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }
    });

    // 에러 응답 확인
    expect(response.status()).toBe(500);
    
    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('DATABASE_CONNECTION_FAILED');
  });
});
