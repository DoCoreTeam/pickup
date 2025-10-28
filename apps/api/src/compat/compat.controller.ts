/**
 * 기존 API 호환 컨트롤러
 * route-manifest.json의 각 엔드포인트를 1:1 대응
 * 
 * @author DOCORE
 */

import { Controller, Get, Post, Put, Delete, Query, Param, Body, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { CompatService } from './compat.service';

@Controller()
export class CompatController {
  constructor(private readonly compatService: CompatService) {}

  // GET /api/data - 전체 데이터 조회
  @Get('data')
  async getData() {
    return await this.compatService.getData();
  }

  // GET /api/stores - 가게 목록 조회
  @Get('stores')
  async getStores() {
    return await this.compatService.getStores();
  }

  // GET /api/stores/{id} - 특정 가게 정보 조회
  @Get('stores/:id')
  async getStoreById(@Param('id') id: string) {
    return await this.compatService.getStoreById(id);
  }

  // GET /api/settings - 가게 설정 조회
  @Get('settings')
  async getStoreSettings(@Query('storeId') storeId: string) {
    if (!storeId) {
      throw new Error('storeId 쿼리 파라미터가 필요합니다');
    }
    return await this.compatService.getStoreSettings(storeId);
  }

  // GET /api/current-store - 현재 선택된 가게 조회
  @Get('current-store')
  async getCurrentStore() {
    return await this.compatService.getCurrentStore();
  }

  // GET /api/users/{id} - 사용자 정보 조회
  @Get('users/:id')
  async getUserById(@Param('id') id: string, @Res() res: Response) {
    try {
      const user = await this.compatService.getUserById(id);
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.json(user);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).json({
        error: 'User not found',
      });
    }
  }

  // GET /api/superadmin/info - 슈퍼어드민 정보 조회
  @Get('superadmin/info')
  async getSuperAdminInfo() {
    return await this.compatService.getSuperAdminInfo();
  }

  // GET /api/activity-logs - 활동 로그 조회
  @Get('activity-logs')
  async getActivityLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return await this.compatService.getActivityLogs(pageNum, limitNum);
  }

  // GET /api/release-notes - 릴리즈 노트 조회
  @Get('release-notes')
  async getReleaseNotes() {
    return await this.compatService.getReleaseNotes();
  }

  // GET /api/subdomain/check - 서브도메인 중복 체크
  @Get('subdomain/check')
  async checkSubdomainAvailability(@Query('subdomain') subdomain: string) {
    if (!subdomain) {
      throw new Error('subdomain 쿼리 파라미터가 필요합니다');
    }
    return await this.compatService.checkSubdomainAvailability(subdomain);
  }

  // GET /api/stores/bulk-export - 가게 데이터 내보내기
  @Get('stores/bulk-export')
  async exportStores(
    @Query('format') format?: string,
    @Res() res: Response,
  ) {
    const exportFormat = (format as 'json' | 'csv') || 'json';
    const result = await this.compatService.exportStores(exportFormat);
    
    if (exportFormat === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="stores.csv"',
      });
      res.send(result.data);
    } else {
      res.json(result);
    }
  }

  // POST /api/stores - 가게 생성
  @Post('stores')
  async createStore(@Body() data: any) {
    return await this.compatService.createStore(data);
  }

  // POST /api/settings - 가게 설정 저장
  @Post('settings')
  async updateStoreSettings(
    @Query('storeId') storeId: string,
    @Body() data: any,
  ) {
    if (!storeId) {
      throw new Error('storeId 쿼리 파라미터가 필요합니다');
    }
    return await this.compatService.updateStoreSettings(storeId, data);
  }

  // POST /api/current-store - 현재 가게 설정
  @Post('current-store')
  async setCurrentStore(@Body() data: { storeId?: string }) {
    return await this.compatService.setCurrentStore(data.storeId || null);
  }

  // POST /api/activity-logs - 활동 로그 추가
  @Post('activity-logs')
  async createActivityLog(@Body() data: any) {
    return await this.compatService.createActivityLog(data);
  }

  // PUT /api/stores/{id} - 가게 정보 수정
  @Put('stores/:id')
  async updateStore(@Param('id') id: string, @Body() data: any) {
    return await this.compatService.updateStore(id, data);
  }

  // DELETE /api/stores/{id} - 가게 삭제
  @Delete('stores/:id')
  async deleteStore(@Param('id') id: string) {
    return await this.compatService.deleteStore(id);
  }
}
