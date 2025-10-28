/**
 * API 엔드포인트 E2E 테스트
 * 주요 API 엔드포인트 응답 검증
 *
 * @author DOCORE
 */

import { test, expect } from '@playwright/test';

test.describe('API 엔드포인트', () => {
  test('GET /api/data - 전체 데이터 조회', async ({ request }) => {
    const response = await request.get('/api/data');
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('superadmin');
    expect(data).toHaveProperty('stores');
    expect(data).toHaveProperty('settings');
    expect(data).toHaveProperty('currentStoreId');
  });

  test('GET /api/stores - 가게 목록 조회', async ({ request }) => {
    const response = await request.get('/api/stores');
    
    expect(response.status()).toBe(200);
    
    const stores = await response.json();
    expect(Array.isArray(stores)).toBe(true);
    
    if (stores.length > 0) {
      expect(stores[0]).toHaveProperty('id');
      expect(stores[0]).toHaveProperty('name');
      expect(stores[0]).toHaveProperty('status');
    }
  });

  test('GET /api/current-store - 현재 가게 조회', async ({ request }) => {
    const response = await request.get('/api/current-store');
    
    expect(response.status()).toBe(200);
    
    const currentStore = await response.json();
    expect(currentStore).toHaveProperty('id');
    expect(currentStore).toHaveProperty('name');
  });

  test('GET /api/healthz - 헬스체크', async ({ request }) => {
    const response = await request.get('/api/healthz');
    
    expect(response.status()).toBe(200);
    
    const health = await response.json();
    expect(health).toHaveProperty('status', 'ok');
    expect(health).toHaveProperty('timestamp');
  });

  test('POST /api/admin/login - 관리자 로그인', async ({ request }) => {
    const response = await request.post('/api/admin/login', {
      data: {
        username: 'admin',
        password: 'admin123'
      }
    });
    
    expect(response.status()).toBe(200);
    
    const result = await response.json();
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('token');
  });

  test('POST /api/admin/login - 잘못된 자격증명', async ({ request }) => {
    const response = await request.post('/api/admin/login', {
      data: {
        username: 'wronguser',
        password: 'wrongpass'
      }
    });
    
    expect(response.status()).toBe(401);
    
    const result = await response.json();
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error');
  });

  test('CORS 헤더 확인', async ({ request }) => {
    const response = await request.options('/api/data');
    
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
    expect(response.headers()['access-control-allow-methods']).toBeDefined();
    expect(response.headers()['access-control-allow-headers']).toBeDefined();
  });

  test('Rate Limiting 확인', async ({ request }) => {
    // 여러 요청을 빠르게 보내서 Rate Limiting 테스트
    const promises = Array(10).fill(0).map(() => 
      request.get('/api/data')
    );
    
    const responses = await Promise.all(promises);
    
    // 모든 요청이 성공하거나 Rate Limit에 걸려야 함
    responses.forEach(response => {
      expect([200, 429]).toContain(response.status());
    });
  });
});
