/**
 * 데이터베이스 시드 스크립트
 * 개발 환경에서 초기 데이터 생성
 * JSON 구조를 반영한 최소 스키마 시드
 * 
 * @author DOCORE
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('db-seed');
const prisma = new PrismaClient();

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
    subdomainCreatedAt?: string;
    subdomainLastModified?: string;
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

async function main() {
  logger.info('🌱 데이터베이스 시드 시작...');

  try {
    // 기존 JSON 데이터 읽기
    const dataPath = join(process.cwd(), '../../assets/data/data.json');
    const jsonData: JsonData = JSON.parse(readFileSync(dataPath, 'utf-8'));

    // 1. 슈퍼어드민 데이터 시드
    await seedSuperAdmin(jsonData.superadmin);

    // 2. 가게 데이터 시드
    await seedStores(jsonData.stores);

    // 3. 가게 설정 데이터 시드
    await seedStoreSettings(jsonData.settings);

    // 4. 현재 가게 ID 시드
    await seedCurrentStore(jsonData.currentStoreId);

    // 5. 활동 로그 시드 (기존 데이터가 있다면)
    await seedActivityLogs();

    // 6. 릴리즈 노트 시드 (기존 데이터가 있다면)
    await seedReleaseNotes();

    logger.info('🎉 데이터베이스 시드 완료!');
  } catch (error) {
    logger.error('❌ 시드 실행 중 오류:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedSuperAdmin(superadmin: JsonData['superadmin']) {
  if (!superadmin) return;

  logger.info('👤 슈퍼어드민 데이터 시드...');

  await prisma.superAdmin.upsert({
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

  logger.info('✅ 슈퍼어드민 데이터 시드 완료');
}

async function seedStores(stores: JsonData['stores']) {
  if (!stores || !Array.isArray(stores)) return;

  logger.info(`🏪 ${stores.length}개 가게 데이터 시드...`);

  for (const store of stores) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {
        name: store.name,
        subtitle: store.subtitle,
        phone: store.phone,
        address: store.address,
        status: store.status || 'active',
        subdomain: store.subdomain,
        subdomainStatus: store.subdomainStatus,
        subdomainCreatedAt: store.subdomainCreatedAt ? new Date(store.subdomainCreatedAt) : null,
        subdomainLastModified: store.subdomainLastModified ? new Date(store.subdomainLastModified) : null,
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
        subdomainCreatedAt: store.subdomainCreatedAt ? new Date(store.subdomainCreatedAt) : null,
        subdomainLastModified: store.subdomainLastModified ? new Date(store.subdomainLastModified) : null,
        order: store.order || 0,
        createdAt: new Date(store.createdAt),
        lastModified: new Date(store.lastModified),
        pausedAt: store.pausedAt ? new Date(store.pausedAt) : null,
      },
    });
  }

  logger.info(`✅ ${stores.length}개 가게 데이터 시드 완료`);
}

async function seedStoreSettings(settings: JsonData['settings']) {
  if (!settings) return;

  const storeIds = Object.keys(settings);
  logger.info(`⚙️  ${storeIds.length}개 가게 설정 데이터 시드...`);

  for (const storeId of storeIds) {
    const setting = settings[storeId];
    await prisma.storeSettings.upsert({
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

  logger.info(`✅ ${storeIds.length}개 가게 설정 데이터 시드 완료`);
}

async function seedCurrentStore(currentStoreId: string | null) {
  if (!currentStoreId) return;

  logger.info(`📌 현재 가게 ID 시드: ${currentStoreId}`);

  await prisma.currentStore.upsert({
    where: { id: 1 },
    update: {
      storeId: currentStoreId,
      updatedAt: new Date(),
    },
    create: {
      id: 1,
      storeId: currentStoreId,
    },
  });

  logger.info('✅ 현재 가게 ID 시드 완료');
}

async function seedActivityLogs() {
  try {
    const activityLogsPath = join(process.cwd(), '../../assets/data/activity_logs.json');
    if (require('fs').existsSync(activityLogsPath)) {
      const logs = JSON.parse(readFileSync(activityLogsPath, 'utf-8'));
      
      if (Array.isArray(logs) && logs.length > 0) {
        logger.info(`📝 ${logs.length}개 활동 로그 시드...`);
        
        for (const log of logs) {
          await prisma.activityLog.upsert({
            where: { id: log.id },
            update: {
              type: log.type,
              action: log.action,
              description: log.description,
              userId: log.userId,
              userName: log.userName,
              targetType: log.targetType,
              targetId: log.targetId,
              targetName: log.targetName,
              details: log.details,
              timestamp: new Date(log.timestamp),
            },
            create: {
              id: log.id,
              type: log.type,
              action: log.action,
              description: log.description,
              userId: log.userId,
              userName: log.userName,
              targetType: log.targetType,
              targetId: log.targetId,
              targetName: log.targetName,
              details: log.details,
              timestamp: new Date(log.timestamp),
            },
          });
        }
        
        logger.info(`✅ ${logs.length}개 활동 로그 시드 완료`);
      }
    }
  } catch (error) {
    logger.warn('활동 로그 시드 실패 (파일이 없거나 형식 오류)', error);
  }
}

async function seedReleaseNotes() {
  try {
    const releaseNotesPath = join(process.cwd(), '../../assets/data/release_notes.json');
    if (require('fs').existsSync(releaseNotesPath)) {
      const notes = JSON.parse(readFileSync(releaseNotesPath, 'utf-8'));
      
      if (Array.isArray(notes) && notes.length > 0) {
        logger.info(`📋 ${notes.length}개 릴리즈 노트 시드...`);
        
        for (const note of notes) {
          await prisma.releaseNote.upsert({
            where: { version: note.version },
            update: {
              codename: note.codename,
              releaseDate: new Date(note.releaseDate),
              title: note.title,
              highlights: note.highlights,
              features: note.features,
              bugFixes: note.bugFixes,
              technicalImprovements: note.technicalImprovements,
            },
            create: {
              version: note.version,
              codename: note.codename,
              releaseDate: new Date(note.releaseDate),
              title: note.title,
              highlights: note.highlights,
              features: note.features,
              bugFixes: note.bugFixes,
              technicalImprovements: note.technicalImprovements,
            },
          });
        }
        
        logger.info(`✅ ${notes.length}개 릴리즈 노트 시드 완료`);
      }
    }
  } catch (error) {
    logger.warn('릴리즈 노트 시드 실패 (파일이 없거나 형식 오류)', error);
  }
}

main()
  .catch((error) => {
    logger.error('시드 실행 실패', error);
    process.exit(1);
  });
