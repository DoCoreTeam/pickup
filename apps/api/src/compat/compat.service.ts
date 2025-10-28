/**
 * 기존 API 호환 서비스
 * route-manifest.json의 각 엔드포인트를 1:1 대응
 * 
 * @author DOCORE
 */

import { Injectable } from '@nestjs/common';
import { dataAdapter } from '@pickup/db';
import { createLogger } from '@pickup/shared';

const logger = createLogger('compat-service');

@Injectable()
export class CompatService {
  // GET /api/data - 전체 데이터 조회
  async getData() {
    try {
      const [stores, superadmin, currentStoreId] = await Promise.all([
        dataAdapter.getStores(),
        dataAdapter.getSuperAdmin(),
        dataAdapter.getCurrentStoreId(),
      ]);

      // 각 가게의 설정 정보도 함께 조회
      const settings: any = {};
      for (const store of stores) {
        const storeSettings = await dataAdapter.getStoreSettings(store.id);
        if (storeSettings) {
          settings[store.id] = storeSettings;
        }
      }

      return {
        superadmin,
        stores,
        currentStoreId,
        settings,
        deliveryOrders: {},
        images: {},
      };
    } catch (error) {
      logger.error('전체 데이터 조회 실패', error);
      throw error;
    }
  }

  // GET /api/stores - 가게 목록 조회
  async getStores() {
    try {
      return await dataAdapter.getStores();
    } catch (error) {
      logger.error('가게 목록 조회 실패', error);
      throw error;
    }
  }

  // GET /api/stores/{id} - 특정 가게 정보 조회
  async getStoreById(id: string) {
    try {
      const store = await dataAdapter.getStoreById(id);
      if (!store) {
        throw new Error('가게를 찾을 수 없습니다');
      }
      return store;
    } catch (error) {
      logger.error(`가게 조회 실패: ${id}`, error);
      throw error;
    }
  }

  // GET /api/settings?storeId={id} - 가게 설정 조회
  async getStoreSettings(storeId: string) {
    try {
      const settings = await dataAdapter.getStoreSettings(storeId);
      if (!settings) {
        // 설정이 없으면 가게 정보를 기반으로 기본값 생성
        const store = await dataAdapter.getStoreById(storeId);
        if (!store) {
          throw new Error('가게를 찾을 수 없습니다');
        }

        const defaultSettings = {
          basic: {
            storeName: store.name,
            storeSubtitle: store.subtitle || '',
            storePhone: store.phone || '',
            storeAddress: store.address || '',
          },
          discount: {
            enabled: false,
            title: '',
            description: '',
          },
          delivery: {
            ttaengUrl: '',
            baeminUrl: '',
            coupangUrl: '',
            yogiyoUrl: '',
            deliveryOrder: ['ttaeng', 'baemin', 'coupang', 'yogiyo'],
          },
          pickup: {
            enabled: false,
            title: '',
            description: '',
          },
          images: {
            mainLogo: '',
            menuImage: '',
          },
          businessHours: {
            mon: { enabled: true, open: '09:00', close: '22:00' },
            tue: { enabled: true, open: '09:00', close: '22:00' },
            wed: { enabled: true, open: '09:00', close: '22:00' },
            thu: { enabled: true, open: '09:00', close: '22:00' },
            fri: { enabled: true, open: '09:00', close: '22:00' },
            sat: { enabled: true, open: '09:00', close: '22:00' },
            sun: { enabled: true, open: '09:00', close: '22:00' },
          },
          sectionOrder: [
            { id: 'delivery', title: '배달 주문', icon: '🚚', description: '배달앱 주문 링크' },
            { id: 'discount', title: '할인 안내', icon: '🎉', description: '할인 이벤트 정보' },
            { id: 'address', title: '주소 정보', icon: '📍', description: '가게 주소 및 지도' },
          ],
          qrCode: {
            url: '',
            filepath: '',
            createdAt: '',
          },
        };

        // 기본 설정 저장 (JSON 어댑터에서는 읽기 전용이므로 에러 무시)
        try {
          await dataAdapter.updateStoreSettings(storeId, defaultSettings);
        } catch (updateError) {
          logger.warn('기본 설정 저장 실패 (읽기 전용 모드)', updateError);
        }

        return defaultSettings;
      }
      return settings;
    } catch (error) {
      logger.error(`가게 설정 조회 실패: ${storeId}`, error);
      throw error;
    }
  }

  // GET /api/current-store - 현재 선택된 가게 조회
  async getCurrentStore() {
    try {
      const currentStoreId = await dataAdapter.getCurrentStoreId();
      if (!currentStoreId) {
        return null;
      }
      return await dataAdapter.getStoreById(currentStoreId);
    } catch (error) {
      logger.error('현재 가게 조회 실패', error);
      throw error;
    }
  }

  // GET /api/users/{id} - 사용자 정보 조회
  async getUserById(id: string) {
    try {
      const store = await dataAdapter.getStoreById(id);
      if (!store) {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      return {
        id: store.id,
        name: store.name,
        subtitle: store.subtitle,
        phone: store.phone,
        address: store.address,
        status: store.status,
      };
    } catch (error) {
      logger.error(`사용자 조회 실패: ${id}`, error);
      throw error;
    }
  }

  // GET /api/superadmin/info - 슈퍼어드민 정보 조회
  async getSuperAdminInfo() {
    try {
      return await dataAdapter.getSuperAdmin();
    } catch (error) {
      logger.error('슈퍼어드민 정보 조회 실패', error);
      throw error;
    }
  }

  // GET /api/activity-logs - 활동 로그 조회
  async getActivityLogs(page: number = 1, limit: number = 50) {
    try {
      const { logs, total } = await dataAdapter.getActivityLogs(page, limit);
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      logger.error('활동 로그 조회 실패', error);
      throw error;
    }
  }

  // GET /api/release-notes - 릴리즈 노트 조회
  async getReleaseNotes() {
    try {
      const releaseNotes = await dataAdapter.getReleaseNotes();
      return {
        success: true,
        releaseNotes,
      };
    } catch (error) {
      logger.error('릴리즈 노트 조회 실패', error);
      throw error;
    }
  }

  // GET /api/subdomain/check - 서브도메인 중복 체크
  async checkSubdomainAvailability(subdomain: string) {
    try {
      const available = await dataAdapter.checkSubdomainAvailability(subdomain);
      return {
        available,
        message: available ? '사용 가능한 서브도메인입니다' : '이미 사용 중인 서브도메인입니다',
      };
    } catch (error) {
      logger.error(`서브도메인 체크 실패: ${subdomain}`, error);
      throw error;
    }
  }

  // GET /api/stores/bulk-export - 가게 데이터 내보내기
  async exportStores(format: 'json' | 'csv' = 'json') {
    try {
      const stores = await dataAdapter.getStores();
      
      if (format === 'csv') {
        // CSV 형식으로 변환
        const csvHeader = 'ID,Name,Subtitle,Phone,Address,Status,CreatedAt\n';
        const csvRows = stores.map(store => 
          `"${store.id}","${store.name}","${store.subtitle || ''}","${store.phone || ''}","${store.address || ''}","${store.status}","${store.createdAt}"`
        ).join('\n');
        
        return {
          success: true,
          data: csvHeader + csvRows,
          contentType: 'text/csv',
        };
      } else {
        // JSON 형식
        return {
          success: true,
          data: stores,
        };
      }
    } catch (error) {
      logger.error('가게 데이터 내보내기 실패', error);
      throw error;
    }
  }

  // POST /api/stores - 가게 생성
  async createStore(data: any) {
    try {
      const store = await dataAdapter.createStore(data);
      return {
        success: true,
        storeId: store.id,
        message: '가게가 성공적으로 생성되었습니다',
      };
    } catch (error) {
      logger.error('가게 생성 실패', error);
      throw error;
    }
  }

  // POST /api/settings - 가게 설정 저장
  async updateStoreSettings(storeId: string, data: any) {
    try {
      await dataAdapter.updateStoreSettings(storeId, data);
      return {
        success: true,
        message: '설정이 성공적으로 저장되었습니다',
      };
    } catch (error) {
      logger.error(`가게 설정 저장 실패: ${storeId}`, error);
      throw error;
    }
  }

  // POST /api/current-store - 현재 가게 설정
  async setCurrentStore(storeId: string | null) {
    try {
      await dataAdapter.setCurrentStoreId(storeId);
      return {
        success: true,
        message: '현재 가게가 설정되었습니다',
      };
    } catch (error) {
      logger.error('현재 가게 설정 실패', error);
      throw error;
    }
  }

  // POST /api/activity-logs - 활동 로그 추가
  async createActivityLog(data: any) {
    try {
      const log = await dataAdapter.createActivityLog(data);
      return {
        success: true,
        logId: log.id,
      };
    } catch (error) {
      logger.error('활동 로그 생성 실패', error);
      throw error;
    }
  }

  // PUT /api/stores/{id} - 가게 정보 수정
  async updateStore(id: string, data: any) {
    try {
      await dataAdapter.updateStore(id, data);
      return {
        success: true,
        message: '가게 정보가 성공적으로 수정되었습니다',
      };
    } catch (error) {
      logger.error(`가게 수정 실패: ${id}`, error);
      throw error;
    }
  }

  // DELETE /api/stores/{id} - 가게 삭제
  async deleteStore(id: string) {
    try {
      await dataAdapter.deleteStore(id);
      return {
        success: true,
        message: '가게가 성공적으로 삭제되었습니다',
      };
    } catch (error) {
      logger.error(`가게 삭제 실패: ${id}`, error);
      throw error;
    }
  }
}
