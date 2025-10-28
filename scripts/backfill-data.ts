/**
 * 데이터 백필 스크립트
 * PostgreSQL에서 JSON 파일로 데이터 백필 (듀얼라이트)
 * 
 * @author DOCORE
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@pickup/shared';

const logger = createLogger('backfill-data');

class DataBackfiller {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async backfill() {
    try {
      logger.info('🔄 데이터 백필 시작...');

      // 1. 슈퍼어드민 데이터 백필
      const superadmin = await this.backfillSuperAdmin();

      // 2. 가게 데이터 백필
      const stores = await this.backfillStores();

      // 3. 가게 설정 데이터 백필
      const settings = await this.backfillStoreSettings();

      // 4. 현재 가게 ID 백필
      const currentStoreId = process.env.CURRENT_STORE_ID || null;

      // 5. JSON 파일 생성
      const jsonData = {
        superadmin,
        stores,
        currentStoreId,
        settings,
        deliveryOrders: {},
        images: {},
      };

      // assets/data 디렉토리 생성
      const dataDir = join(process.cwd(), 'assets/data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      // JSON 파일 저장
      const dataPath = join(dataDir, 'data.json');
      writeFileSync(dataPath, JSON.stringify(jsonData, null, 2), 'utf-8');

      logger.info('✅ 데이터 백필 완료!');
      logger.info(`📁 백필 파일: ${dataPath}`);
    } catch (error) {
      logger.error('❌ 데이터 백필 실패', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async backfillSuperAdmin() {
    logger.info('👤 슈퍼어드민 데이터 백필...');

    const superadmin = await this.prisma.superAdmin.findFirst();
    if (!superadmin) {
      throw new Error('슈퍼어드민 데이터를 찾을 수 없습니다');
    }

    return {
      username: superadmin.username,
      password: superadmin.passwordHash, // 실제로는 해시된 비밀번호
      createdAt: superadmin.createdAt.toISOString(),
      lastModified: superadmin.lastModified.toISOString(),
    };
  }

  private async backfillStores() {
    logger.info('🏪 가게 데이터 백필...');

    const stores = await this.prisma.store.findMany({
      orderBy: { order: 'asc' },
    });

    return stores.map(store => ({
      id: store.id,
      name: store.name,
      subtitle: store.subtitle,
      phone: store.phone,
      address: store.address,
      status: store.status,
      subdomain: store.subdomain,
      subdomainStatus: store.subdomainStatus,
      order: store.order,
      createdAt: store.createdAt.toISOString(),
      lastModified: store.lastModified.toISOString(),
      pausedAt: store.pausedAt?.toISOString(),
    }));
  }

  private async backfillStoreSettings() {
    logger.info('⚙️  가게 설정 데이터 백필...');

    const settings = await this.prisma.storeSettings.findMany({
      include: {
        store: true,
      },
    });

    const settingsMap: any = {};
    for (const setting of settings) {
      settingsMap[setting.storeId] = {
        basic: setting.basic,
        discount: setting.discount,
        delivery: setting.delivery,
        pickup: setting.pickup,
        images: setting.images,
        businessHours: setting.businessHours,
        sectionOrder: setting.sectionOrder,
        qrCode: setting.qrCode,
      };
    }

    return settingsMap;
  }
}

async function main() {
  const backfiller = new DataBackfiller();
  await backfiller.backfill();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { DataBackfiller };
