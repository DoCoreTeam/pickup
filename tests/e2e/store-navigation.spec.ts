/**
 * 가게 탐색 E2E 테스트
 * 가게 목록 조회 및 상세 페이지 접근 시나리오
 *
 * @author DOCORE
 */

import { test, expect } from '@playwright/test';

test.describe('가게 탐색', () => {
  test('가게 목록 페이지 접근', async ({ page }) => {
    await page.goto('/');

    // 가게 목록 확인
    await expect(page.locator('.store-list')).toBeVisible();
    await expect(page.locator('.store-item')).toHaveCount.greaterThan(0);

    // 가게 정보 확인
    const firstStore = page.locator('.store-item').first();
    await expect(firstStore.locator('.store-name')).toBeVisible();
    await expect(firstStore.locator('.store-address')).toBeVisible();
  });

  test('가게 상세 페이지 접근', async ({ page }) => {
    await page.goto('/');

    // 첫 번째 가게 클릭
    const firstStore = page.locator('.store-item').first();
    const storeName = await firstStore.locator('.store-name').textContent();
    
    await firstStore.click();

    // 가게 상세 페이지로 이동 확인
    await expect(page).toHaveURL(/.*store\.html/);
    
    // 가게 정보 확인
    await expect(page.locator('h1')).toContainText(storeName || '');
    await expect(page.locator('.store-details')).toBeVisible();
  });

  test('가게 검색 기능', async ({ page }) => {
    await page.goto('/');

    // 검색 입력
    const searchInput = page.locator('input[placeholder*="검색"]');
    await searchInput.fill('테스트');

    // 검색 결과 확인
    await expect(page.locator('.store-item')).toHaveCount.greaterThan(0);
  });

  test('가게 필터링 기능', async ({ page }) => {
    await page.goto('/');

    // 필터 버튼 클릭
    await page.click('button[data-filter="active"]');

    // 필터링된 결과 확인
    await expect(page.locator('.store-item')).toHaveCount.greaterThan(0);
  });

  test('반응형 디자인 (모바일)', async ({ page }) => {
    // 모바일 뷰포트 설정
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 모바일 레이아웃 확인
    await expect(page.locator('.mobile-header')).toBeVisible();
    await expect(page.locator('.store-list')).toBeVisible();

    // 햄버거 메뉴 확인
    await expect(page.locator('.hamburger-menu')).toBeVisible();
  });
});
