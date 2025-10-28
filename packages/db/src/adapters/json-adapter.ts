/**
 * JSON 파일 기반 데이터 어댑터
 * 기존 JSON 파일을 읽기 전용으로 접근 (atomic read)
 * Phase 3에서 듀얼라이트 옵션 추가 예정
 * 
 * @author DOCORE
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DataAdapter, JsonData } from '@pickup/shared';
import { createLogger } from '@pickup/shared';

const logger = createLogger('json-adapter');

export class JsonAdapter implements DataAdapter {
  private dataPath: string;
  private activityLogsPath: string;
  private releaseNotesPath: string;
  private analyticsPath: string;

  constructor() {
    this.dataPath = join(process.cwd(), '../../assets/data/data.json');
    this.activityLogsPath = join(process.cwd(), '../../assets/data/activity_logs.json');
    this.releaseNotesPath = join(process.cwd(), '../../assets/data/release_notes.json');
    this.analyticsPath = join(process.cwd(), '../../assets/data/analytics.json');
  }

  // 원자적 읽기 (atomic read)
  private readJsonFile<T>(filePath: string, defaultValue: T): T {
    try {
      if (!existsSync(filePath)) {
        logger.warn(`파일이 존재하지 않음: ${filePath}`);
        return defaultValue;
      }
      
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`JSON 파일 읽기 실패: ${filePath}`, error);
      return defaultValue;
    }
  }

  // 가게 관련 메서드
  async getStores(): Promise<any[]> {
    const data = this.readJsonFile<JsonData>(this.dataPath, { stores: [], superadmin: {} as any, currentStoreId: null, settings: {}, deliveryOrders: {}, images: {} });
    return data.stores || [];
  }

  async getStoreById(id: string): Promise<any | null> {
    const stores = await this.getStores();
    return stores.find(store => store.id === id) || null;
  }

  async createStore(data: any): Promise<any> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  async updateStore(id: string, data: any): Promise<any> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  async deleteStore(id: string): Promise<boolean> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  // 설정 관련 메서드
  async getStoreSettings(storeId: string): Promise<any | null> {
    const data = this.readJsonFile<JsonData>(this.dataPath, { stores: [], superadmin: {} as any, currentStoreId: null, settings: {}, deliveryOrders: {}, images: {} });
    return data.settings?.[storeId] || null;
  }

  async updateStoreSettings(storeId: string, data: any): Promise<any> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  // 슈퍼어드민 관련 메서드
  async getSuperAdmin(): Promise<any | null> {
    const data = this.readJsonFile<JsonData>(this.dataPath, { stores: [], superadmin: {} as any, currentStoreId: null, settings: {}, deliveryOrders: {}, images: {} });
    return data.superadmin || null;
  }

  async updateSuperAdmin(data: any): Promise<any> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  // 활동 로그 관련 메서드
  async getActivityLogs(page: number = 1, limit: number = 50): Promise<{ logs: any[]; total: number }> {
    const logs = this.readJsonFile<any[]>(this.activityLogsPath, []);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);
    
    return {
      logs: paginatedLogs,
      total: logs.length
    };
  }

  async createActivityLog(data: any): Promise<any> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  // 릴리즈 노트 관련 메서드
  async getReleaseNotes(): Promise<any[]> {
    return this.readJsonFile<any[]>(this.releaseNotesPath, []);
  }

  // 분석 데이터 관련 메서드
  async getAnalytics(): Promise<any | null> {
    return this.readJsonFile<any>(this.analyticsPath, null);
  }

  async updateAnalytics(data: any): Promise<any> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  // 현재 가게 ID 관련 메서드
  async getCurrentStoreId(): Promise<string | null> {
    const data = this.readJsonFile<JsonData>(this.dataPath, { stores: [], superadmin: {} as any, currentStoreId: null, settings: {}, deliveryOrders: {}, images: {} });
    return data.currentStoreId || null;
  }

  async setCurrentStoreId(storeId: string | null): Promise<void> {
    // Phase 3에서 구현 예정
    throw new Error('JSON 어댑터는 읽기 전용입니다. Phase 3에서 듀얼라이트 기능 추가 예정');
  }

  // 서브도메인 관련 메서드
  async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    const stores = await this.getStores();
    return !stores.some(store => store.subdomain === subdomain.toLowerCase());
  }

  async getStoreBySubdomain(subdomain: string): Promise<any | null> {
    const stores = await this.getStores();
    return stores.find(store => store.subdomain === subdomain.toLowerCase()) || null;
  }
}
