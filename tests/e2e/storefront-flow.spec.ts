/**
 * 가게페이지 플로우 E2E 테스트
 * 주요 가게페이지 기능 녹화 테스트
 * 
 * @author DOCORE
 */

import { test, expect } from '@playwright/test';

test.describe('Storefront Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 가게페이지로 이동
    await page.goto('http://localhost:3002');
  });

  test('should display store page', async ({ page }) => {
    // 가게페이지 제목 확인
    await expect(page.getByRole('heading', { name: '가게 정보 로딩 중...' })).toBeVisible();
    
    // 개발 중 메시지 확인
    await expect(page.getByText('개발 중')).toBeVisible();
    
    // 섹션들 확인
    await expect(page.getByText('배달 주문')).toBeVisible();
    await expect(page.getByText('할인 안내')).toBeVisible();
    await expect(page.getByText('주소 정보')).toBeVisible();
  });

  test('should handle mobile viewport', async ({ page }) => {
    // 모바일 뷰포트 설정
    await page.setViewportSize({ width: 375, height: 667 });
    
    // 가게페이지가 모바일에서 잘 보이는지 확인
    await expect(page.getByRole('heading', { name: '가게 정보 로딩 중...' })).toBeVisible();
    
    // 카드들이 세로로 잘 배치되는지 확인
    const cards = page.locator('.bg-white.rounded-lg');
    await expect(cards).toHaveCount(3);
  });

  test('should have proper mobile meta tags', async ({ page }) => {
    await page.goto('http://localhost:3002');

    // 뷰포트 메타 태그 확인
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute('content', 'width=480, initial-scale=1, maximum-scale=1, user-scalable=no');

    // 테마 컬러 확인
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#111827');

    // 캐시 방지 메타 태그 확인
    const cacheControl = page.locator('meta[http-equiv="Cache-Control"]');
    await expect(cacheControl).toHaveAttribute('content', 'no-cache, no-store, must-revalidate');
  });

  test('should load without JavaScript errors', async ({ page }) => {
    // 콘솔 에러 확인
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3002');
    await page.waitForLoadState('networkidle');

    // 에러가 없어야 함
    expect(errors).toHaveLength(0);
  });

  test('should handle API calls for store data', async ({ page }) => {
    // 네트워크 요청 모니터링
    const requests: string[] = [];
    page.on('request', request => {
      requests.push(request.url());
    });

    await page.goto('http://localhost:3002');
    await page.waitForLoadState('networkidle');

    // API 호출이 있다면 정상적으로 처리되어야 함
    const apiRequests = requests.filter(url => url.includes('/api/'));
    
    // API 요청이 있다면 200 응답을 받아야 함
    for (const url of apiRequests) {
      const response = await page.request.get(url);
      expect(response.status()).toBeLessThan(400);
    }
  });

  test('should handle different store IDs', async ({ page }) => {
    // URL 파라미터로 storeId 전달
    await page.goto('http://localhost:3002?storeId=test_store_123');
    
    // 페이지가 정상적으로 로드되어야 함
    await expect(page.getByRole('heading', { name: '가게 정보 로딩 중...' })).toBeVisible();
  });

  test('should handle subdomain routing', async ({ page }) => {
    // 서브도메인으로 접근 (실제로는 localhost에서 테스트)
    await page.goto('http://localhost:3002');
    
    // 페이지가 정상적으로 로드되어야 함
    await expect(page.getByRole('heading', { name: '가게 정보 로딩 중...' })).toBeVisible();
  });

  test('should be accessible', async ({ page }) => {
    await page.goto('http://localhost:3002');

    // 기본 접근성 확인
    const heading = page.getByRole('heading', { name: '가게 정보 로딩 중...' });
    await expect(heading).toBeVisible();

    // 키보드 네비게이션 확인
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // 포커스가 정상적으로 이동하는지 확인
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should handle slow network conditions', async ({ page }) => {
    // 네트워크 속도 제한
    await page.route('**/*', route => {
      // 1초 지연
      setTimeout(() => route.continue(), 1000);
    });

    await page.goto('http://localhost:3002');
    
    // 로딩 상태가 표시되어야 함
    await expect(page.getByRole('heading', { name: '가게 정보 로딩 중...' })).toBeVisible();
    
    // 최종적으로 페이지가 로드되어야 함
    await page.waitForLoadState('networkidle');
  });
});
