/**
 * PostgreSQL 기반 데이터 어댑터
 * Prisma를 사용한 데이터베이스 접근
 * 
 * @author DOCORE
 */

import { PrismaClient } from '@prisma/client';
import { DataAdapter } from '@pickup/shared';
import { createLogger } from '@pickup/shared';

const logger = createLogger('postgres-adapter');

export class PostgresAdapter implements DataAdapter {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // 가게 관련 메서드
  async getStores(): Promise<any[]> {
    try {
      const stores = await this.prisma.store.findMany({
        orderBy: { order: 'asc' }
      });
      return stores.map(store => ({
        ...store,
        createdAt: store.createdAt.toISOString(),
        lastModified: store.lastModified.toISOString(),
        pausedAt: store.pausedAt?.toISOString() || undefined
      }));
    } catch (error) {
      logger.error('가게 목록 조회 실패', error);
      throw error;
    }
  }

  async getStoreById(id: string): Promise<any | null> {
    try {
      const store = await this.prisma.store.findUnique({
        where: { id }
      });
      
      if (!store) return null;
      
      return {
        ...store,
        createdAt: store.createdAt.toISOString(),
        lastModified: store.lastModified.toISOString(),
        pausedAt: store.pausedAt?.toISOString() || undefined
      };
    } catch (error) {
      logger.error(`가게 조회 실패: ${id}`, error);
      throw error;
    }
  }

  async createStore(data: any): Promise<any> {
    try {
      const store = await this.prisma.store.create({
        data: {
          id: data.id,
          name: data.name,
          subtitle: data.subtitle,
          phone: data.phone,
          address: data.address,
          status: data.status || 'active',
          subdomain: data.subdomain,
          subdomainStatus: data.subdomainStatus,
          order: data.order || 0,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          lastModified: data.lastModified ? new Date(data.lastModified) : new Date(),
          pausedAt: data.pausedAt ? new Date(data.pausedAt) : null
        }
      });
      
      return {
        ...store,
        createdAt: store.createdAt.toISOString(),
        lastModified: store.lastModified.toISOString(),
        pausedAt: store.pausedAt?.toISOString() || undefined
      };
    } catch (error) {
      logger.error('가게 생성 실패', error);
      throw error;
    }
  }

  async updateStore(id: string, data: any): Promise<any> {
    try {
      const updateData: any = {};
      
      if (data.name !== undefined) updateData.name = data.name;
      if (data.subtitle !== undefined) updateData.subtitle = data.subtitle;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.subdomain !== undefined) updateData.subdomain = data.subdomain;
      if (data.subdomainStatus !== undefined) updateData.subdomainStatus = data.subdomainStatus;
      if (data.order !== undefined) updateData.order = data.order;
      if (data.lastModified !== undefined) updateData.lastModified = new Date(data.lastModified);
      if (data.pausedAt !== undefined) updateData.pausedAt = data.pausedAt ? new Date(data.pausedAt) : null;
      
      updateData.lastModified = new Date();
      
      const store = await this.prisma.store.update({
        where: { id },
        data: updateData
      });
      
      return {
        ...store,
        createdAt: store.createdAt.toISOString(),
        lastModified: store.lastModified.toISOString(),
        pausedAt: store.pausedAt?.toISOString() || undefined
      };
    } catch (error) {
      logger.error(`가게 업데이트 실패: ${id}`, error);
      throw error;
    }
  }

  async deleteStore(id: string): Promise<boolean> {
    try {
      await this.prisma.store.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      logger.error(`가게 삭제 실패: ${id}`, error);
      throw error;
    }
  }

  // 설정 관련 메서드
  async getStoreSettings(storeId: string): Promise<any | null> {
    try {
      const settings = await this.prisma.storeSettings.findUnique({
        where: { storeId }
      });
      
      if (!settings) return null;
      
      return {
        basic: settings.basic,
        discount: settings.discount,
        delivery: settings.delivery,
        pickup: settings.pickup,
        images: settings.images,
        businessHours: settings.businessHours,
        sectionOrder: settings.sectionOrder,
        qrCode: settings.qrCode
      };
    } catch (error) {
      logger.error(`가게 설정 조회 실패: ${storeId}`, error);
      throw error;
    }
  }

  async updateStoreSettings(storeId: string, data: any): Promise<any> {
    try {
      const settings = await this.prisma.storeSettings.upsert({
        where: { storeId },
        update: {
          basic: data.basic,
          discount: data.discount,
          delivery: data.delivery,
          pickup: data.pickup,
          images: data.images,
          businessHours: data.businessHours,
          sectionOrder: data.sectionOrder,
          qrCode: data.qrCode,
          updatedAt: new Date()
        },
        create: {
          storeId,
          basic: data.basic,
          discount: data.discount,
          delivery: data.delivery,
          pickup: data.pickup,
          images: data.images,
          businessHours: data.businessHours,
          sectionOrder: data.sectionOrder,
          qrCode: data.qrCode
        }
      });
      
      return {
        basic: settings.basic,
        discount: settings.discount,
        delivery: settings.delivery,
        pickup: settings.pickup,
        images: settings.images,
        businessHours: settings.businessHours,
        sectionOrder: settings.sectionOrder,
        qrCode: settings.qrCode
      };
    } catch (error) {
      logger.error(`가게 설정 업데이트 실패: ${storeId}`, error);
      throw error;
    }
  }

  // 슈퍼어드민 관련 메서드
  async getSuperAdmin(): Promise<any | null> {
    try {
      const superAdmin = await this.prisma.superAdmin.findFirst();
      
      if (!superAdmin) return null;
      
      return {
        username: superAdmin.username,
        password: superAdmin.passwordHash, // 실제로는 해시된 비밀번호
        createdAt: superAdmin.createdAt.toISOString(),
        lastModified: superAdmin.lastModified.toISOString()
      };
    } catch (error) {
      logger.error('슈퍼어드민 조회 실패', error);
      throw error;
    }
  }

  async updateSuperAdmin(data: any): Promise<any> {
    try {
      const updateData: any = {};
      
      if (data.username !== undefined) updateData.username = data.username;
      if (data.password !== undefined) updateData.passwordHash = data.password; // 실제로는 해시 처리 필요
      
      updateData.lastModified = new Date();
      
      const superAdmin = await this.prisma.superAdmin.updateMany({
        data: updateData
      });
      
      return await this.getSuperAdmin();
    } catch (error) {
      logger.error('슈퍼어드민 업데이트 실패', error);
      throw error;
    }
  }

  // 활동 로그 관련 메서드
  async getActivityLogs(page: number = 1, limit: number = 50): Promise<{ logs: any[]; total: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const [logs, total] = await Promise.all([
        this.prisma.activityLog.findMany({
          skip,
          take: limit,
          orderBy: { timestamp: 'desc' }
        }),
        this.prisma.activityLog.count()
      ]);
      
      return {
        logs: logs.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString()
        })),
        total
      };
    } catch (error) {
      logger.error('활동 로그 조회 실패', error);
      throw error;
    }
  }

  async createActivityLog(data: any): Promise<any> {
    try {
      const log = await this.prisma.activityLog.create({
        data: {
          id: data.id,
          type: data.type,
          action: data.action,
          description: data.description,
          userId: data.userId,
          userName: data.userName,
          targetType: data.targetType,
          targetId: data.targetId,
          targetName: data.targetName,
          details: data.details,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
        }
      });
      
      return {
        ...log,
        timestamp: log.timestamp.toISOString()
      };
    } catch (error) {
      logger.error('활동 로그 생성 실패', error);
      throw error;
    }
  }

  // 릴리즈 노트 관련 메서드
  async getReleaseNotes(): Promise<any[]> {
    try {
      const notes = await this.prisma.releaseNote.findMany({
        orderBy: { releaseDate: 'desc' }
      });
      
      return notes.map(note => ({
        ...note,
        releaseDate: note.releaseDate.toISOString().split('T')[0] // YYYY-MM-DD 형식
      }));
    } catch (error) {
      logger.error('릴리즈 노트 조회 실패', error);
      throw error;
    }
  }

  // 분석 데이터 관련 메서드
  async getAnalytics(): Promise<any | null> {
    try {
      const analytics = await this.prisma.analytics.findFirst();
      return analytics;
    } catch (error) {
      logger.error('분석 데이터 조회 실패', error);
      throw error;
    }
  }

  async updateAnalytics(data: any): Promise<any> {
    try {
      const analytics = await this.prisma.analytics.upsert({
        where: { id: 1 }, // 단일 분석 데이터 레코드 가정
        update: {
          siteVisits: data.siteVisits,
          storeVisits: data.storeVisits,
          phoneClicks: data.phoneClicks,
          lastUpdated: new Date()
        },
        create: {
          siteVisits: data.siteVisits,
          storeVisits: data.storeVisits,
          phoneClicks: data.phoneClicks
        }
      });
      
      return analytics;
    } catch (error) {
      logger.error('분석 데이터 업데이트 실패', error);
      throw error;
    }
  }

  // 현재 가게 ID 관련 메서드 (환경변수로 관리)
  async getCurrentStoreId(): Promise<string | null> {
    // 현재는 환경변수로 관리하거나 별도 테이블 필요
    return process.env.CURRENT_STORE_ID || null;
  }

  async setCurrentStoreId(storeId: string | null): Promise<void> {
    // 환경변수 업데이트는 런타임에서 제한적
    process.env.CURRENT_STORE_ID = storeId || '';
  }

  // 서브도메인 관련 메서드
  async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    try {
      const existingStore = await this.prisma.store.findFirst({
        where: { subdomain: subdomain.toLowerCase() }
      });
      
      return !existingStore;
    } catch (error) {
      logger.error(`서브도메인 중복 체크 실패: ${subdomain}`, error);
      throw error;
    }
  }

  async getStoreBySubdomain(subdomain: string): Promise<any | null> {
    try {
      const store = await this.prisma.store.findFirst({
        where: { subdomain: subdomain.toLowerCase() }
      });
      
      if (!store) return null;
      
      return {
        ...store,
        createdAt: store.createdAt.toISOString(),
        lastModified: store.lastModified.toISOString(),
        pausedAt: store.pausedAt?.toISOString() || undefined
      };
    } catch (error) {
      logger.error(`서브도메인으로 가게 조회 실패: ${subdomain}`, error);
      throw error;
    }
  }
}
