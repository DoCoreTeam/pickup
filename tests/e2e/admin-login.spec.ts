/**
 * 관리자 로그인 E2E 테스트
 * 슈퍼어드민 로그인 시나리오 검증
 *
 * @author DOCORE
 */

import { test, expect } from '@playwright/test';

test.describe('관리자 로그인', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login.html');
  });

  test('올바른 자격증명으로 로그인 성공', async ({ page }) => {
    // 로그인 폼 확인
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // 로그인 정보 입력
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');

    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');

    // 대시보드로 리다이렉트 확인
    await expect(page).toHaveURL(/.*admin\/dashboard\.html/);
    
    // 대시보드 요소 확인
    await expect(page.locator('h1')).toContainText('관리자 대시보드');
  });

  test('잘못된 자격증명으로 로그인 실패', async ({ page }) => {
    // 잘못된 로그인 정보 입력
    await page.fill('input[name="username"]', 'wronguser');
    await page.fill('input[name="password"]', 'wrongpass');

    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');

    // 에러 메시지 확인
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('로그인 실패');
  });

  test('빈 필드로 로그인 시도', async ({ page }) => {
    // 빈 필드로 로그인 시도
    await page.click('button[type="submit"]');

    // 유효성 검사 메시지 확인
    await expect(page.locator('input[name="username"]:invalid')).toBeVisible();
    await expect(page.locator('input[name="password"]:invalid')).toBeVisible();
  });

  test('로그인 후 로그아웃', async ({ page }) => {
    // 로그인
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // 대시보드 확인
    await expect(page).toHaveURL(/.*admin\/dashboard\.html/);

    // 로그아웃 버튼 클릭
    await page.click('button[data-action="logout"]');

    // 로그인 페이지로 리다이렉트 확인
    await expect(page).toHaveURL(/.*admin\/login\.html/);
  });
});
