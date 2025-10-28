/**
 * 어드민 플로우 E2E 테스트
 * 주요 어드민 기능 녹화 테스트
 * 
 * @author DOCORE
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 어드민 페이지로 이동
    await page.goto('/');
  });

  test('should display admin dashboard', async ({ page }) => {
    // 대시보드 제목 확인
    await expect(page.getByRole('heading', { name: '픽업 어드민 패널' })).toBeVisible();
    
    // 개발 중 메시지 확인
    await expect(page.getByText('개발 중')).toBeVisible();
    
    // 카드들 확인
    await expect(page.getByText('가게 관리')).toBeVisible();
    await expect(page.getByText('사용자 관리')).toBeVisible();
    await expect(page.getByText('분석 및 로그')).toBeVisible();
  });

  test('should handle responsive design', async ({ page }) => {
    // 데스크톱 뷰
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.getByRole('heading', { name: '픽업 어드민 패널' })).toBeVisible();

    // 태블릿 뷰
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByRole('heading', { name: '픽업 어드민 패널' })).toBeVisible();

    // 모바일 뷰
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: '픽업 어드민 패널' })).toBeVisible();
  });

  test('should load without errors', async ({ page }) => {
    // 콘솔 에러 확인
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 에러가 없어야 함
    expect(errors).toHaveLength(0);
  });

  test('should have proper meta tags', async ({ page }) => {
    await page.goto('/');

    // 제목 확인
    await expect(page).toHaveTitle('픽업 어드민');

    // 메타 설명 확인
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', '픽업 서비스 관리자 패널');
  });

  test('should handle API calls gracefully', async ({ page }) => {
    // 네트워크 요청 모니터링
    const requests: string[] = [];
    page.on('request', request => {
      requests.push(request.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // API 호출이 있다면 정상적으로 처리되어야 함
    const apiRequests = requests.filter(url => url.includes('/api/'));
    
    // API 요청이 있다면 200 응답을 받아야 함
    for (const url of apiRequests) {
      const response = await page.request.get(url);
      expect(response.status()).toBeLessThan(400);
    }
  });
});
