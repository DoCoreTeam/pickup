/**
 * 어댑터 유닛 테스트
 * JSON vs PostgreSQL 어댑터 결과 동치성 검증
 * 
 * @author DOCORE
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { JsonAdapter } from '../../packages/db/src/adapters/json-adapter';
import { PostgresAdapter } from '../../packages/db/src/adapters/postgres-adapter';
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    store: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    storeSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    superAdmin: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    activityLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    releaseNote: {
      findMany: jest.fn(),
    },
    analytics: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    currentStore: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    $disconnect: jest.fn(),
  })),
}));

describe('Adapter Tests', () => {
  let jsonAdapter: JsonAdapter;
  let postgresAdapter: PostgresAdapter;
  let mockPrisma: any;

  beforeEach(() => {
    jsonAdapter = new JsonAdapter();
    mockPrisma = new PrismaClient();
    postgresAdapter = new PostgresAdapter(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Store Operations', () => {
    const mockStore = {
      id: 'store_123',
      name: '테스트 가게',
      subtitle: '테스트 부제목',
      phone: '010-1234-5678',
      address: '테스트 주소',
      status: 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastModified: '2025-01-01T00:00:00.000Z',
    };

    it('should return same store data from both adapters', async () => {
      // JSON 어댑터는 실제 파일을 읽으므로 mock 필요
      jest.spyOn(jsonAdapter, 'getStoreById').mockResolvedValue(mockStore);
      
      // PostgreSQL 어댑터 mock
      mockPrisma.store.findUnique.mockResolvedValue({
        ...mockStore,
        createdAt: new Date(mockStore.createdAt),
        lastModified: new Date(mockStore.lastModified),
      });

      const jsonResult = await jsonAdapter.getStoreById('store_123');
      const postgresResult = await postgresAdapter.getStoreById('store_123');

      // 결과 비교 (날짜 형식 정규화)
      const normalizedJsonResult = {
        ...jsonResult,
        createdAt: new Date(jsonResult.createdAt).toISOString(),
        lastModified: new Date(jsonResult.lastModified).toISOString(),
      };

      const normalizedPostgresResult = {
        ...postgresResult,
        createdAt: new Date(postgresResult.createdAt).toISOString(),
        lastModified: new Date(postgresResult.lastModified).toISOString(),
      };

      expect(normalizedJsonResult).toEqual(normalizedPostgresResult);
    });

    it('should handle store creation consistently', async () => {
      const newStore = {
        id: 'store_456',
        name: '새 가게',
        subtitle: '새 부제목',
        phone: '010-9876-5432',
        address: '새 주소',
        status: 'active',
        createdAt: '2025-01-02T00:00:00.000Z',
        lastModified: '2025-01-02T00:00:00.000Z',
      };

      // JSON 어댑터는 읽기 전용이므로 에러 발생
      await expect(jsonAdapter.createStore(newStore)).rejects.toThrow();
      
      // PostgreSQL 어댑터는 정상 동작
      mockPrisma.store.create.mockResolvedValue({
        ...newStore,
        createdAt: new Date(newStore.createdAt),
        lastModified: new Date(newStore.lastModified),
      });

      const result = await postgresAdapter.createStore(newStore);
      expect(result).toBeDefined();
      expect(result.name).toBe(newStore.name);
    });
  });

  describe('Store Settings Operations', () => {
    const mockSettings = {
      basic: {
        storeName: '테스트 가게',
        storeSubtitle: '테스트 부제목',
        storePhone: '010-1234-5678',
        storeAddress: '테스트 주소',
      },
      discount: {
        enabled: true,
        title: '할인 이벤트',
        description: '특별 할인',
      },
      delivery: {
        ttaengUrl: 'https://ttaeng.com/test',
        baeminUrl: 'https://baemin.com/test',
        deliveryOrder: ['ttaeng', 'baemin'],
      },
    };

    it('should return same settings data from both adapters', async () => {
      // JSON 어댑터 mock
      jest.spyOn(jsonAdapter, 'getStoreSettings').mockResolvedValue(mockSettings);
      
      // PostgreSQL 어댑터 mock
      mockPrisma.storeSettings.findUnique.mockResolvedValue({
        storeId: 'store_123',
        basic: mockSettings.basic,
        discount: mockSettings.discount,
        delivery: mockSettings.delivery,
        pickup: null,
        images: null,
        businessHours: null,
        sectionOrder: null,
        qrCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const jsonResult = await jsonAdapter.getStoreSettings('store_123');
      const postgresResult = await postgresAdapter.getStoreSettings('store_123');

      // JSON 필드만 비교 (PostgreSQL의 추가 필드는 무시)
      const { basic, discount, delivery } = postgresResult;
      const normalizedPostgresResult = { basic, discount, delivery };

      expect(jsonResult).toEqual(normalizedPostgresResult);
    });
  });

  describe('SuperAdmin Operations', () => {
    const mockSuperAdmin = {
      username: 'testadmin',
      password: 'testpassword',
      createdAt: '2025-01-01T00:00:00.000Z',
      lastModified: '2025-01-01T00:00:00.000Z',
    };

    it('should return same superadmin data from both adapters', async () => {
      // JSON 어댑터 mock
      jest.spyOn(jsonAdapter, 'getSuperAdmin').mockResolvedValue(mockSuperAdmin);
      
      // PostgreSQL 어댑터 mock
      mockPrisma.superAdmin.findFirst.mockResolvedValue({
        id: 1,
        username: mockSuperAdmin.username,
        passwordHash: mockSuperAdmin.password,
        createdAt: new Date(mockSuperAdmin.createdAt),
        lastModified: new Date(mockSuperAdmin.lastModified),
      });

      const jsonResult = await jsonAdapter.getSuperAdmin();
      const postgresResult = await postgresAdapter.getSuperAdmin();

      // 결과 비교
      expect(jsonResult?.username).toBe(postgresResult?.username);
      expect(jsonResult?.password).toBe(postgresResult?.password);
    });
  });

  describe('Activity Logs Operations', () => {
    const mockLogs = [
      {
        id: 'log_1',
        type: 'store',
        action: 'create',
        description: '가게 생성',
        timestamp: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'log_2',
        type: 'store',
        action: 'update',
        description: '가게 수정',
        timestamp: '2025-01-01T01:00:00.000Z',
      },
    ];

    it('should return same activity logs from both adapters', async () => {
      // JSON 어댑터 mock
      jest.spyOn(jsonAdapter, 'getActivityLogs').mockResolvedValue({
        logs: mockLogs,
        total: mockLogs.length,
      });
      
      // PostgreSQL 어댑터 mock
      mockPrisma.activityLog.findMany.mockResolvedValue(
        mockLogs.map(log => ({
          ...log,
          timestamp: new Date(log.timestamp),
          userId: null,
          userName: null,
          targetType: null,
          targetId: null,
          targetName: null,
          details: null,
        }))
      );

      const jsonResult = await jsonAdapter.getActivityLogs(1, 50);
      const postgresResult = await postgresAdapter.getActivityLogs(1, 50);

      // 로그 개수 비교
      expect(jsonResult.logs.length).toBe(postgresResult.logs.length);
      expect(jsonResult.total).toBe(postgresResult.total);

      // 각 로그 비교
      jsonResult.logs.forEach((jsonLog, index) => {
        const postgresLog = postgresResult.logs[index];
        expect(jsonLog.id).toBe(postgresLog.id);
        expect(jsonLog.type).toBe(postgresLog.type);
        expect(jsonLog.action).toBe(postgresLog.action);
        expect(jsonLog.description).toBe(postgresLog.description);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON adapter read-only errors', async () => {
      const storeData = { id: 'test', name: 'test' };
      
      await expect(jsonAdapter.createStore(storeData)).rejects.toThrow('읽기 전용');
      await expect(jsonAdapter.updateStore('test', storeData)).rejects.toThrow('읽기 전용');
      await expect(jsonAdapter.deleteStore('test')).rejects.toThrow('읽기 전용');
    });

    it('should handle PostgreSQL adapter errors', async () => {
      mockPrisma.store.findUnique.mockRejectedValue(new Error('Database connection failed'));
      
      await expect(postgresAdapter.getStoreById('test')).rejects.toThrow('Database connection failed');
    });
  });
});
