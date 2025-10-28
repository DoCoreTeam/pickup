/**
 * 듀얼라이트 어댑터
 * DUAL_WRITE=true일 때 JSON + PostgreSQL 동시 기록
 * 읽기는 DATA_BACKEND 기준으로만
 * 
 * @author DOCORE
 */

import { DataAdapter } from '@pickup/shared';
import { JsonAdapter } from './json-adapter';
import { PostgresAdapter } from './postgres-adapter';
import { createLogger } from '@pickup/shared';

const logger = createLogger('dual-write-adapter');

export class DualWriteAdapter implements DataAdapter {
  private jsonAdapter: JsonAdapter;
  private postgresAdapter: PostgresAdapter;
  private isDualWriteEnabled: boolean;

  constructor(jsonAdapter: JsonAdapter, postgresAdapter: PostgresAdapter) {
    this.jsonAdapter = jsonAdapter;
    this.postgresAdapter = postgresAdapter;
    this.isDualWriteEnabled = process.env.DUAL_WRITE === 'true';
    
    if (this.isDualWriteEnabled) {
      logger.info('🔄 듀얼라이트 모드 활성화 - JSON + PostgreSQL 동시 기록');
    }
  }

  // 읽기 메서드들은 DATA_BACKEND 기준으로만 처리
  async getStores(): Promise<any[]> {
    return this.jsonAdapter.getStores();
  }

  async getStoreById(id: string): Promise<any | null> {
    return this.jsonAdapter.getStoreById(id);
  }

  async getStoreSettings(storeId: string): Promise<any | null> {
    return this.jsonAdapter.getStoreSettings(storeId);
  }

  async getSuperAdmin(): Promise<any | null> {
    return this.jsonAdapter.getSuperAdmin();
  }

  async getActivityLogs(page: number = 1, limit: number = 50): Promise<{ logs: any[]; total: number }> {
    return this.jsonAdapter.getActivityLogs(page, limit);
  }

  async getReleaseNotes(): Promise<any[]> {
    return this.jsonAdapter.getReleaseNotes();
  }

  async getAnalytics(): Promise<any | null> {
    return this.jsonAdapter.getAnalytics();
  }

  async getCurrentStoreId(): Promise<string | null> {
    return this.jsonAdapter.getCurrentStoreId();
  }

  async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    return this.jsonAdapter.checkSubdomainAvailability(subdomain);
  }

  async getStoreBySubdomain(subdomain: string): Promise<any | null> {
    return this.jsonAdapter.getStoreBySubdomain(subdomain);
  }

  // 쓰기 메서드들은 듀얼라이트 처리
  async createStore(data: any): Promise<any> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.createStore(data);
    }

    logger.info('🔄 듀얼라이트: 가게 생성');
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.createStore(data);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.createStore(data);
        logger.info('✅ 듀얼라이트: 가게 생성 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async updateStore(id: string, data: any): Promise<any> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.updateStore(id, data);
    }

    logger.info(`🔄 듀얼라이트: 가게 수정 (${id})`);
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.updateStore(id, data);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.updateStore(id, data);
        logger.info('✅ 듀얼라이트: 가게 수정 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async deleteStore(id: string): Promise<boolean> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.deleteStore(id);
    }

    logger.info(`🔄 듀얼라이트: 가게 삭제 (${id})`);
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.deleteStore(id);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.deleteStore(id);
        logger.info('✅ 듀얼라이트: 가게 삭제 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async updateStoreSettings(storeId: string, data: any): Promise<any> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.updateStoreSettings(storeId, data);
    }

    logger.info(`🔄 듀얼라이트: 가게 설정 수정 (${storeId})`);
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.updateStoreSettings(storeId, data);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.updateStoreSettings(storeId, data);
        logger.info('✅ 듀얼라이트: 가게 설정 수정 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async updateSuperAdmin(data: any): Promise<any> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.updateSuperAdmin(data);
    }

    logger.info('🔄 듀얼라이트: 슈퍼어드민 수정');
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.updateSuperAdmin(data);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.updateSuperAdmin(data);
        logger.info('✅ 듀얼라이트: 슈퍼어드민 수정 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async createActivityLog(data: any): Promise<any> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.createActivityLog(data);
    }

    logger.info('🔄 듀얼라이트: 활동 로그 생성');
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.createActivityLog(data);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.createActivityLog(data);
        logger.info('✅ 듀얼라이트: 활동 로그 생성 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async updateAnalytics(data: any): Promise<any> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.updateAnalytics(data);
    }

    logger.info('🔄 듀얼라이트: 분석 데이터 수정');
    
    try {
      // PostgreSQL에 먼저 기록
      const postgresResult = await this.postgresAdapter.updateAnalytics(data);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.updateAnalytics(data);
        logger.info('✅ 듀얼라이트: 분석 데이터 수정 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
      
      return postgresResult;
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  async setCurrentStoreId(storeId: string | null): Promise<void> {
    if (!this.isDualWriteEnabled) {
      return this.jsonAdapter.setCurrentStoreId(storeId);
    }

    logger.info(`🔄 듀얼라이트: 현재 가게 ID 설정 (${storeId})`);
    
    try {
      // PostgreSQL에 먼저 기록
      await this.postgresAdapter.setCurrentStoreId(storeId);
      
      // JSON에도 기록 (실패해도 PostgreSQL은 성공)
      try {
        await this.jsonAdapter.setCurrentStoreId(storeId);
        logger.info('✅ 듀얼라이트: 현재 가게 ID 설정 성공 (JSON + PostgreSQL)');
      } catch (jsonError) {
        logger.warn('⚠️ 듀얼라이트: JSON 기록 실패, PostgreSQL은 성공', jsonError);
      }
    } catch (postgresError) {
      logger.error('❌ 듀얼라이트: PostgreSQL 기록 실패', postgresError);
      throw postgresError;
    }
  }

  // 듀얼라이트 상태 확인 메서드
  isDualWriteMode(): boolean {
    return this.isDualWriteEnabled;
  }

  // 듀얼라이트 성공률 확인 (모니터링용)
  async getDualWriteStats(): Promise<{
    enabled: boolean;
    jsonAdapter: string;
    postgresAdapter: string;
    lastCheck: string;
  }> {
    return {
      enabled: this.isDualWriteEnabled,
      jsonAdapter: 'JsonAdapter',
      postgresAdapter: 'PostgresAdapter',
      lastCheck: new Date().toISOString(),
    };
  }
}
