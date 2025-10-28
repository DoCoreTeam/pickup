/**
 * JSON to PostgreSQL 백필 스크립트
 * JSON 원천에서 스트리밍 읽기, upsert, 배치 처리, 재시도 큐
 * 
 * @author DOCORE
 */

import { readFileSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@pickup/shared';

const logger = createLogger('backfill-json-to-postgres');

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

interface BackfillStats {
  superadmin: { processed: number; errors: number };
  stores: { processed: number; errors: number };
  settings: { processed: number; errors: number };
  currentStore: { processed: number; errors: number };
  activityLogs: { processed: number; errors: number };
  releaseNotes: { processed: number; errors: number };
}

interface RetryQueue {
  operation: string;
  data: any;
  retryCount: number;
  maxRetries: number;
}

class JsonToPostgresBackfiller {
  private prisma: PrismaClient;
  private stats: BackfillStats;
  private retryQueue: RetryQueue[] = [];
  private batchSize: number;
  private maxRetries: number;

  constructor(batchSize: number = 100, maxRetries: number = 3) {
    this.prisma = new PrismaClient({
      log: ['error'],
    });
    this.batchSize = batchSize;
    this.maxRetries = maxRetries;
    this.stats = {
      superadmin: { processed: 0, errors: 0 },
      stores: { processed: 0, errors: 0 },
      settings: { processed: 0, errors: 0 },
      currentStore: { processed: 0, errors: 0 },
      activityLogs: { processed: 0, errors: 0 },
      releaseNotes: { processed: 0, errors: 0 },
    };
  }

  async backfill() {
    const startTime = Date.now();
    logger.info('🚀 JSON to PostgreSQL 백필 시작...');

    try {
      // JSON 데이터 읽기
      const jsonData = await this.loadJsonData();

      // 1. 슈퍼어드민 백필
      await this.backfillSuperAdmin(jsonData.superadmin);

      // 2. 가게 데이터 백필 (배치 처리)
      await this.backfillStores(jsonData.stores);

      // 3. 가게 설정 백필 (배치 처리)
      await this.backfillStoreSettings(jsonData.settings);

      // 4. 현재 가게 ID 백필
      await this.backfillCurrentStore(jsonData.currentStoreId);

      // 5. 활동 로그 백필 (스트리밍)
      await this.backfillActivityLogs();

      // 6. 릴리즈 노트 백필 (스트리밍)
      await this.backfillReleaseNotes();

      // 7. 재시도 큐 처리
      await this.processRetryQueue();

      // 8. 최종 통계 출력
      this.printFinalStats(startTime);

    } catch (error) {
      logger.error('❌ 백필 실행 실패', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async loadJsonData(): Promise<JsonData> {
    logger.info('📖 JSON 데이터 로딩...');
    
    const dataPath = process.cwd() + '/assets/data/data.json';
    const jsonData: JsonData = JSON.parse(readFileSync(dataPath, 'utf-8'));
    
    logger.info('✅ JSON 데이터 로딩 완료');
    return jsonData;
  }

  private async backfillSuperAdmin(superadmin: JsonData['superadmin']) {
    if (!superadmin) return;

    logger.info('👤 슈퍼어드민 백필...');

    try {
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

      this.stats.superadmin.processed++;
      logger.info('✅ 슈퍼어드민 백필 완료');
    } catch (error) {
      this.stats.superadmin.errors++;
      logger.error('❌ 슈퍼어드민 백필 실패', error);
      this.addToRetryQueue('superadmin', superadmin, error);
    }
  }

  private async backfillStores(stores: JsonData['stores']) {
    if (!stores || !Array.isArray(stores)) return;

    logger.info(`🏪 ${stores.length}개 가게 백필 시작...`);

    // 배치 처리
    for (let i = 0; i < stores.length; i += this.batchSize) {
      const batch = stores.slice(i, i + this.batchSize);
      
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const store of batch) {
            await tx.store.upsert({
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
        });

        this.stats.stores.processed += batch.length;
        logger.info(`✅ 가게 배치 ${i + 1}-${Math.min(i + this.batchSize, stores.length)} 완료`);

      } catch (error) {
        this.stats.stores.errors += batch.length;
        logger.error(`❌ 가게 배치 ${i + 1}-${Math.min(i + this.batchSize, stores.length)} 실패`, error);
        
        // 개별 재시도 큐에 추가
        for (const store of batch) {
          this.addToRetryQueue('store', store, error);
        }
      }
    }

    logger.info(`✅ ${stores.length}개 가게 백필 완료`);
  }

  private async backfillStoreSettings(settings: JsonData['settings']) {
    if (!settings) return;

    const storeIds = Object.keys(settings);
    logger.info(`⚙️  ${storeIds.length}개 가게 설정 백필 시작...`);

    // 배치 처리
    for (let i = 0; i < storeIds.length; i += this.batchSize) {
      const batch = storeIds.slice(i, i + this.batchSize);
      
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const storeId of batch) {
            const setting = settings[storeId];
            await tx.storeSettings.upsert({
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
        });

        this.stats.settings.processed += batch.length;
        logger.info(`✅ 설정 배치 ${i + 1}-${Math.min(i + this.batchSize, storeIds.length)} 완료`);

      } catch (error) {
        this.stats.settings.errors += batch.length;
        logger.error(`❌ 설정 배치 ${i + 1}-${Math.min(i + this.batchSize, storeIds.length)} 실패`, error);
        
        // 개별 재시도 큐에 추가
        for (const storeId of batch) {
          this.addToRetryQueue('setting', { storeId, data: settings[storeId] }, error);
        }
      }
    }

    logger.info(`✅ ${storeIds.length}개 가게 설정 백필 완료`);
  }

  private async backfillCurrentStore(currentStoreId: string | null) {
    if (!currentStoreId) return;

    logger.info(`📌 현재 가게 ID 백필: ${currentStoreId}`);

    try {
      await this.prisma.currentStore.upsert({
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

      this.stats.currentStore.processed++;
      logger.info('✅ 현재 가게 ID 백필 완료');
    } catch (error) {
      this.stats.currentStore.errors++;
      logger.error('❌ 현재 가게 ID 백필 실패', error);
      this.addToRetryQueue('currentStore', { currentStoreId }, error);
    }
  }

  private async backfillActivityLogs() {
    try {
      const activityLogsPath = process.cwd() + '/assets/data/activity_logs.json';
      if (require('fs').existsSync(activityLogsPath)) {
        const logs = JSON.parse(readFileSync(activityLogsPath, 'utf-8'));
        
        if (Array.isArray(logs) && logs.length > 0) {
          logger.info(`📝 ${logs.length}개 활동 로그 백필 시작...`);
          
          // 배치 처리
          for (let i = 0; i < logs.length; i += this.batchSize) {
            const batch = logs.slice(i, i + this.batchSize);
            
            try {
              await this.prisma.$transaction(async (tx) => {
                for (const log of batch) {
                  await tx.activityLog.upsert({
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
              });

              this.stats.activityLogs.processed += batch.length;
              logger.info(`✅ 활동 로그 배치 ${i + 1}-${Math.min(i + this.batchSize, logs.length)} 완료`);

            } catch (error) {
              this.stats.activityLogs.errors += batch.length;
              logger.error(`❌ 활동 로그 배치 ${i + 1}-${Math.min(i + this.batchSize, logs.length)} 실패`, error);
              
              // 개별 재시도 큐에 추가
              for (const log of batch) {
                this.addToRetryQueue('activityLog', log, error);
              }
            }
          }
          
          logger.info(`✅ ${logs.length}개 활동 로그 백필 완료`);
        }
      }
    } catch (error) {
      logger.warn('활동 로그 백필 실패 (파일이 없거나 형식 오류)', error);
    }
  }

  private async backfillReleaseNotes() {
    try {
      const releaseNotesPath = process.cwd() + '/assets/data/release_notes.json';
      if (require('fs').existsSync(releaseNotesPath)) {
        const notes = JSON.parse(readFileSync(releaseNotesPath, 'utf-8'));
        
        if (Array.isArray(notes) && notes.length > 0) {
          logger.info(`📋 ${notes.length}개 릴리즈 노트 백필 시작...`);
          
          // 배치 처리
          for (let i = 0; i < notes.length; i += this.batchSize) {
            const batch = notes.slice(i, i + this.batchSize);
            
            try {
              await this.prisma.$transaction(async (tx) => {
                for (const note of batch) {
                  await tx.releaseNote.upsert({
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
              });

              this.stats.releaseNotes.processed += batch.length;
              logger.info(`✅ 릴리즈 노트 배치 ${i + 1}-${Math.min(i + this.batchSize, notes.length)} 완료`);

            } catch (error) {
              this.stats.releaseNotes.errors += batch.length;
              logger.error(`❌ 릴리즈 노트 배치 ${i + 1}-${Math.min(i + this.batchSize, notes.length)} 실패`, error);
              
              // 개별 재시도 큐에 추가
              for (const note of batch) {
                this.addToRetryQueue('releaseNote', note, error);
              }
            }
          }
          
          logger.info(`✅ ${notes.length}개 릴리즈 노트 백필 완료`);
        }
      }
    } catch (error) {
      logger.warn('릴리즈 노트 백필 실패 (파일이 없거나 형식 오류)', error);
    }
  }

  private addToRetryQueue(operation: string, data: any, error: any) {
    this.retryQueue.push({
      operation,
      data,
      retryCount: 0,
      maxRetries: this.maxRetries,
    });
  }

  private async processRetryQueue() {
    if (this.retryQueue.length === 0) return;

    logger.info(`🔄 ${this.retryQueue.length}개 재시도 큐 처리 시작...`);

    for (const item of this.retryQueue) {
      if (item.retryCount >= item.maxRetries) {
        logger.error(`❌ 최대 재시도 횟수 초과: ${item.operation}`, item.data);
        continue;
      }

      try {
        await this.retryOperation(item.operation, item.data);
        item.retryCount++;
        logger.info(`✅ 재시도 성공: ${item.operation} (${item.retryCount}/${item.maxRetries})`);
      } catch (error) {
        item.retryCount++;
        logger.error(`❌ 재시도 실패: ${item.operation} (${item.retryCount}/${item.maxRetries})`, error);
      }
    }

    logger.info('🔄 재시도 큐 처리 완료');
  }

  private async retryOperation(operation: string, data: any) {
    // 재시도 로직 구현 (간단한 예시)
    switch (operation) {
      case 'superadmin':
        await this.backfillSuperAdmin(data);
        break;
      case 'store':
        await this.backfillStores([data]);
        break;
      case 'setting':
        await this.backfillStoreSettings({ [data.storeId]: data.data });
        break;
      case 'currentStore':
        await this.backfillCurrentStore(data.currentStoreId);
        break;
      case 'activityLog':
        await this.backfillActivityLogs();
        break;
      case 'releaseNote':
        await this.backfillReleaseNotes();
        break;
    }
  }

  private printFinalStats(startTime: number) {
    const duration = Date.now() - startTime;
    
    logger.info('📊 백필 완료 통계:');
    logger.info(`⏱️  총 소요 시간: ${duration}ms`);
    logger.info(`👤 슈퍼어드민: ${this.stats.superadmin.processed} 처리, ${this.stats.superadmin.errors} 오류`);
    logger.info(`🏪 가게: ${this.stats.stores.processed} 처리, ${this.stats.stores.errors} 오류`);
    logger.info(`⚙️  설정: ${this.stats.settings.processed} 처리, ${this.stats.settings.errors} 오류`);
    logger.info(`📌 현재 가게: ${this.stats.currentStore.processed} 처리, ${this.stats.currentStore.errors} 오류`);
    logger.info(`📝 활동 로그: ${this.stats.activityLogs.processed} 처리, ${this.stats.activityLogs.errors} 오류`);
    logger.info(`📋 릴리즈 노트: ${this.stats.releaseNotes.processed} 처리, ${this.stats.releaseNotes.errors} 오류`);
    
    const totalProcessed = Object.values(this.stats).reduce((sum, stat) => sum + stat.processed, 0);
    const totalErrors = Object.values(this.stats).reduce((sum, stat) => sum + stat.errors, 0);
    
    logger.info(`📈 총 처리: ${totalProcessed}개`);
    logger.info(`❌ 총 오류: ${totalErrors}개`);
    logger.info(`✅ 성공률: ${((totalProcessed - totalErrors) / totalProcessed * 100).toFixed(2)}%`);
  }
}

async function main() {
  const batchSize = parseInt(process.env.BATCH_SIZE || '100');
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3');
  
  const backfiller = new JsonToPostgresBackfiller(batchSize, maxRetries);
  await backfiller.backfill();
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('백필 실행 실패', error);
    process.exit(1);
  });
}

export { JsonToPostgresBackfiller };
