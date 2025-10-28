/**
 * 데이터 마이그레이션 스크립트
 * JSON 파일에서 PostgreSQL로 데이터 마이그레이션
 * 
 * @author DOCORE
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@pickup/shared';

const logger = createLogger('migrate-data');

interface JsonData {
  superadmin: {
    username: string;
    password: string;
    createdAt: string;
    lastModified: string;
  };
  stores: Array<{
    id: string;
    name: string;
    subtitle?: string;
    phone?: string;
    address?: string;
    status?: string;
    subdomain?: string;
    subdomainStatus?: string;
    order?: number;
    createdAt: string;
    lastModified: string;
    pausedAt?: string;
  }>;
  currentStoreId: string | null;
  settings: {
    [storeId: string]: any;
  };
  deliveryOrders: any;
  images: any;
}

class DataMigrator {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async migrate() {
    try {
      logger.info('🚀 데이터 마이그레이션 시작...');

      // JSON 데이터 읽기
      const dataPath = join(process.cwd(), 'assets/data/data.json');
      const jsonData: JsonData = JSON.parse(readFileSync(dataPath, 'utf-8'));

      // 1. 슈퍼어드민 데이터 마이그레이션
      await this.migrateSuperAdmin(jsonData.superadmin);

      // 2. 가게 데이터 마이그레이션
      await this.migrateStores(jsonData.stores);

      // 3. 가게 설정 데이터 마이그레이션
      await this.migrateStoreSettings(jsonData.settings);

      // 4. 현재 가게 ID 설정
      if (jsonData.currentStoreId) {
        process.env.CURRENT_STORE_ID = jsonData.currentStoreId;
        logger.info(`📌 현재 가게 ID 설정: ${jsonData.currentStoreId}`);
      }

      logger.info('✅ 데이터 마이그레이션 완료!');
    } catch (error) {
      logger.error('❌ 데이터 마이그레이션 실패', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async migrateSuperAdmin(superadmin: JsonData['superadmin']) {
    logger.info('👤 슈퍼어드민 데이터 마이그레이션...');

    await this.prisma.superAdmin.upsert({
      where: { username: superadmin.username },
      update: {
        passwordHash: superadmin.password, // 실제로는 해시 처리 필요
        lastModified: new Date(superadmin.lastModified),
      },
      create: {
        username: superadmin.username,
        passwordHash: superadmin.password, // 실제로는 해시 처리 필요
        createdAt: new Date(superadmin.createdAt),
        lastModified: new Date(superadmin.lastModified),
      },
    });

    logger.info('✅ 슈퍼어드민 데이터 마이그레이션 완료');
  }

  private async migrateStores(stores: JsonData['stores']) {
    logger.info(`🏪 ${stores.length}개 가게 데이터 마이그레이션...`);

    for (const store of stores) {
      await this.prisma.store.upsert({
        where: { id: store.id },
        update: {
          name: store.name,
          subtitle: store.subtitle,
          phone: store.phone,
          address: store.address,
          status: store.status || 'active',
          subdomain: store.subdomain,
          subdomainStatus: store.subdomainStatus,
          order: store.order || 0,
          lastModified: new Date(store.lastModified),
          pausedAt: store.pausedAt ? new Date(store.pausedAt) : null,
        },
        create: {
          id: store.id,
          name: store.name,
          subtitle: store.subtitle,
          phone: store.phone,
          address: store.address,
          status: store.status || 'active',
          subdomain: store.subdomain,
          subdomainStatus: store.subdomainStatus,
          order: store.order || 0,
          createdAt: new Date(store.createdAt),
          lastModified: new Date(store.lastModified),
          pausedAt: store.pausedAt ? new Date(store.pausedAt) : null,
        },
      });
    }

    logger.info('✅ 가게 데이터 마이그레이션 완료');
  }

  private async migrateStoreSettings(settings: JsonData['settings']) {
    logger.info(`⚙️  ${Object.keys(settings).length}개 가게 설정 데이터 마이그레이션...`);

    for (const [storeId, setting] of Object.entries(settings)) {
      await this.prisma.storeSettings.upsert({
        where: { storeId },
        update: {
          basic: setting.basic,
          discount: setting.discount,
          delivery: setting.delivery,
          pickup: setting.pickup,
          images: setting.images,
          businessHours: setting.businessHours,
          sectionOrder: setting.sectionOrder,
          qrCode: setting.qrCode,
          updatedAt: new Date(),
        },
        create: {
          storeId,
          basic: setting.basic,
          discount: setting.discount,
          delivery: setting.delivery,
          pickup: setting.pickup,
          images: setting.images,
          businessHours: setting.businessHours,
          sectionOrder: setting.sectionOrder,
          qrCode: setting.qrCode,
        },
      });
    }

    logger.info('✅ 가게 설정 데이터 마이그레이션 완료');
  }
}

async function main() {
  const migrator = new DataMigrator();
  await migrator.migrate();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { DataMigrator };
