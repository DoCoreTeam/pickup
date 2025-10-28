/**
 * 마이그레이션 검증 스크립트
 * JSON vs PostgreSQL 데이터 일관성 검증
 * 
 * @author DOCORE
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('validate-migration');

interface ValidationResult {
  table: string;
  jsonCount: number;
  postgresCount: number;
  matches: boolean;
  differences: any[];
}

class MigrationValidator {
  private prisma: PrismaClient;
  private jsonData: any;

  constructor() {
    this.prisma = new PrismaClient({
      log: ['error'],
    });
  }

  async validate() {
    logger.info('🔍 마이그레이션 검증 시작...');

    try {
      // JSON 데이터 로딩
      await this.loadJsonData();

      // 각 테이블별 검증
      const results: ValidationResult[] = [];

      results.push(await this.validateSuperAdmin());
      results.push(await this.validateStores());
      results.push(await this.validateStoreSettings());
      results.push(await this.validateCurrentStore());
      results.push(await this.validateActivityLogs());
      results.push(await this.validateReleaseNotes());

      // 결과 출력
      this.printResults(results);

      // 전체 성공 여부 확인
      const allMatches = results.every(result => result.matches);
      
      if (allMatches) {
        logger.info('✅ 모든 검증 통과 - 마이그레이션 성공');
        process.exit(0);
      } else {
        logger.error('❌ 일부 검증 실패 - 마이그레이션 문제 있음');
        process.exit(1);
      }

    } catch (error) {
      logger.error('❌ 검증 실행 실패', error);
      process.exit(1);
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async loadJsonData() {
    const dataPath = join(process.cwd(), 'assets/data/data.json');
    this.jsonData = JSON.parse(readFileSync(dataPath, 'utf-8'));
    logger.info('✅ JSON 데이터 로딩 완료');
  }

  private async validateSuperAdmin(): Promise<ValidationResult> {
    logger.info('👤 슈퍼어드민 검증...');

    const jsonSuperAdmin = this.jsonData.superadmin;
    const postgresSuperAdmin = await this.prisma.superAdmin.findFirst();

    const jsonCount = jsonSuperAdmin ? 1 : 0;
    const postgresCount = postgresSuperAdmin ? 1 : 0;

    const matches = jsonCount === postgresCount && 
      (!jsonSuperAdmin || !postgresSuperAdmin || 
       jsonSuperAdmin.username === postgresSuperAdmin.username);

    return {
      table: 'superadmin',
      jsonCount,
      postgresCount,
      matches,
      differences: matches ? [] : [{ field: 'username', json: jsonSuperAdmin?.username, postgres: postgresSuperAdmin?.username }]
    };
  }

  private async validateStores(): Promise<ValidationResult> {
    logger.info('🏪 가게 검증...');

    const jsonStores = this.jsonData.stores || [];
    const postgresStores = await this.prisma.store.findMany();

    const jsonCount = jsonStores.length;
    const postgresCount = postgresStores.length;

    // ID 기준으로 매칭 확인
    const jsonIds = new Set(jsonStores.map((store: any) => store.id));
    const postgresIds = new Set(postgresStores.map(store => store.id));

    const matches = jsonCount === postgresCount && 
      jsonStores.every((jsonStore: any) => postgresIds.has(jsonStore.id)) &&
      postgresStores.every(postgresStore => jsonIds.has(postgresStore.id));

    const differences = [];
    if (!matches) {
      const missingInPostgres = jsonStores.filter((store: any) => !postgresIds.has(store.id));
      const missingInJson = postgresStores.filter(store => !jsonIds.has(store.id));
      
      if (missingInPostgres.length > 0) {
        differences.push({ type: 'missing_in_postgres', ids: missingInPostgres.map((s: any) => s.id) });
      }
      if (missingInJson.length > 0) {
        differences.push({ type: 'missing_in_json', ids: missingInJson.map(s => s.id) });
      }
    }

    return {
      table: 'stores',
      jsonCount,
      postgresCount,
      matches,
      differences
    };
  }

  private async validateStoreSettings(): Promise<ValidationResult> {
    logger.info('⚙️  가게 설정 검증...');

    const jsonSettings = this.jsonData.settings || {};
    const postgresSettings = await this.prisma.storeSettings.findMany();

    const jsonCount = Object.keys(jsonSettings).length;
    const postgresCount = postgresSettings.length;

    // StoreId 기준으로 매칭 확인
    const jsonStoreIds = new Set(Object.keys(jsonSettings));
    const postgresStoreIds = new Set(postgresSettings.map(s => s.storeId));

    const matches = jsonCount === postgresCount && 
      Object.keys(jsonSettings).every(storeId => postgresStoreIds.has(storeId)) &&
      postgresSettings.every(setting => jsonStoreIds.has(setting.storeId));

    const differences = [];
    if (!matches) {
      const missingInPostgres = Object.keys(jsonSettings).filter(storeId => !postgresStoreIds.has(storeId));
      const missingInJson = postgresSettings.filter(setting => !jsonStoreIds.has(setting.storeId));
      
      if (missingInPostgres.length > 0) {
        differences.push({ type: 'missing_in_postgres', storeIds: missingInPostgres });
      }
      if (missingInJson.length > 0) {
        differences.push({ type: 'missing_in_json', storeIds: missingInJson.map(s => s.storeId) });
      }
    }

    return {
      table: 'store_settings',
      jsonCount,
      postgresCount,
      matches,
      differences
    };
  }

  private async validateCurrentStore(): Promise<ValidationResult> {
    logger.info('📌 현재 가게 ID 검증...');

    const jsonCurrentStoreId = this.jsonData.currentStoreId;
    const postgresCurrentStore = await this.prisma.currentStore.findFirst();

    const jsonCount = jsonCurrentStoreId ? 1 : 0;
    const postgresCount = postgresCurrentStore ? 1 : 0;

    const matches = jsonCount === postgresCount && 
      (!jsonCurrentStoreId || !postgresCurrentStore || 
       jsonCurrentStoreId === postgresCurrentStore.storeId);

    return {
      table: 'current_store',
      jsonCount,
      postgresCount,
      matches,
      differences: matches ? [] : [{ field: 'storeId', json: jsonCurrentStoreId, postgres: postgresCurrentStore?.storeId }]
    };
  }

  private async validateActivityLogs(): Promise<ValidationResult> {
    logger.info('📝 활동 로그 검증...');

    let jsonLogs = [];
    try {
      const activityLogsPath = join(process.cwd(), 'assets/data/activity_logs.json');
      if (require('fs').existsSync(activityLogsPath)) {
        jsonLogs = JSON.parse(readFileSync(activityLogsPath, 'utf-8'));
      }
    } catch (error) {
      logger.warn('활동 로그 파일 로딩 실패', error);
    }

    const postgresLogs = await this.prisma.activityLog.findMany();

    const jsonCount = jsonLogs.length;
    const postgresCount = postgresLogs.length;

    // ID 기준으로 매칭 확인
    const jsonIds = new Set(jsonLogs.map((log: any) => log.id));
    const postgresIds = new Set(postgresLogs.map(log => log.id));

    const matches = jsonCount === postgresCount && 
      jsonLogs.every((jsonLog: any) => postgresIds.has(jsonLog.id)) &&
      postgresLogs.every(postgresLog => jsonIds.has(postgresLog.id));

    const differences = [];
    if (!matches) {
      const missingInPostgres = jsonLogs.filter((log: any) => !postgresIds.has(log.id));
      const missingInJson = postgresLogs.filter(log => !jsonIds.has(log.id));
      
      if (missingInPostgres.length > 0) {
        differences.push({ type: 'missing_in_postgres', count: missingInPostgres.length });
      }
      if (missingInJson.length > 0) {
        differences.push({ type: 'missing_in_json', count: missingInJson.length });
      }
    }

    return {
      table: 'activity_logs',
      jsonCount,
      postgresCount,
      matches,
      differences
    };
  }

  private async validateReleaseNotes(): Promise<ValidationResult> {
    logger.info('📋 릴리즈 노트 검증...');

    let jsonNotes = [];
    try {
      const releaseNotesPath = join(process.cwd(), 'assets/data/release_notes.json');
      if (require('fs').existsSync(releaseNotesPath)) {
        jsonNotes = JSON.parse(readFileSync(releaseNotesPath, 'utf-8'));
      }
    } catch (error) {
      logger.warn('릴리즈 노트 파일 로딩 실패', error);
    }

    const postgresNotes = await this.prisma.releaseNote.findMany();

    const jsonCount = jsonNotes.length;
    const postgresCount = postgresNotes.length;

    // Version 기준으로 매칭 확인
    const jsonVersions = new Set(jsonNotes.map((note: any) => note.version));
    const postgresVersions = new Set(postgresNotes.map(note => note.version));

    const matches = jsonCount === postgresCount && 
      jsonNotes.every((jsonNote: any) => postgresVersions.has(jsonNote.version)) &&
      postgresNotes.every(postgresNote => jsonVersions.has(postgresNote.version));

    const differences = [];
    if (!matches) {
      const missingInPostgres = jsonNotes.filter((note: any) => !postgresVersions.has(note.version));
      const missingInJson = postgresNotes.filter(note => !jsonVersions.has(note.version));
      
      if (missingInPostgres.length > 0) {
        differences.push({ type: 'missing_in_postgres', count: missingInPostgres.length });
      }
      if (missingInJson.length > 0) {
        differences.push({ type: 'missing_in_json', count: missingInJson.length });
      }
    }

    return {
      table: 'release_notes',
      jsonCount,
      postgresCount,
      matches,
      differences
    };
  }

  private printResults(results: ValidationResult[]) {
    logger.info('📊 검증 결과:');
    logger.info('=====================================');

    let totalMatches = 0;
    let totalMismatches = 0;

    results.forEach(result => {
      const status = result.matches ? '✅' : '❌';
      logger.info(`${status} ${result.table}: ${result.jsonCount} (JSON) vs ${result.postgresCount} (PostgreSQL)`);
      
      if (!result.matches) {
        logger.error(`   차이점:`, result.differences);
        totalMismatches++;
      } else {
        totalMatches++;
      }
    });

    logger.info('=====================================');
    logger.info(`✅ 일치: ${totalMatches}개 테이블`);
    logger.info(`❌ 불일치: ${totalMismatches}개 테이블`);
  }
}

async function main() {
  const validator = new MigrationValidator();
  await validator.validate();
}

if (require.main === module) {
  main();
}

export { MigrationValidator };
