/**
 * 데이터베이스 시드 스크립트
 * 개발 환경에서 초기 데이터 생성
 * 
 * @author DOCORE
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 데이터베이스 시드 시작...');

  try {
    // 기존 JSON 데이터 읽기
    const dataPath = join(process.cwd(), '../../assets/data/data.json');
    const jsonData = JSON.parse(readFileSync(dataPath, 'utf-8'));

    // 슈퍼어드민 데이터 시드
    if (jsonData.superadmin) {
      await prisma.superAdmin.upsert({
        where: { username: jsonData.superadmin.username },
        update: {
          passwordHash: jsonData.superadmin.password,
          lastModified: new Date(jsonData.superadmin.lastModified),
        },
        create: {
          username: jsonData.superadmin.username,
          passwordHash: jsonData.superadmin.password,
          createdAt: new Date(jsonData.superadmin.createdAt),
          lastModified: new Date(jsonData.superadmin.lastModified),
        },
      });
      console.log('✅ 슈퍼어드민 데이터 시드 완료');
    }

    // 가게 데이터 시드
    if (jsonData.stores && Array.isArray(jsonData.stores)) {
      for (const store of jsonData.stores) {
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

        // 가게 설정 데이터 시드
        if (jsonData.settings && jsonData.settings[store.id]) {
          const settings = jsonData.settings[store.id];
          await prisma.storeSettings.upsert({
            where: { storeId: store.id },
            update: {
              basic: settings.basic,
              discount: settings.discount,
              delivery: settings.delivery,
              pickup: settings.pickup,
              images: settings.images,
              businessHours: settings.businessHours,
              sectionOrder: settings.sectionOrder,
              qrCode: settings.qrCode,
              updatedAt: new Date(),
            },
            create: {
              storeId: store.id,
              basic: settings.basic,
              discount: settings.discount,
              delivery: settings.delivery,
              pickup: settings.pickup,
              images: settings.images,
              businessHours: settings.businessHours,
              sectionOrder: settings.sectionOrder,
              qrCode: settings.qrCode,
            },
          });
        }
      }
      console.log(`✅ ${jsonData.stores.length}개 가게 데이터 시드 완료`);
    }

    // 현재 선택된 가게 ID 저장 (별도 테이블 없이 환경변수로 관리)
    if (jsonData.currentStoreId) {
      console.log(`📌 현재 선택된 가게: ${jsonData.currentStoreId}`);
    }

    console.log('🎉 데이터베이스 시드 완료!');
  } catch (error) {
    console.error('❌ 시드 실행 중 오류:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
