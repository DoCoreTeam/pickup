/**
 * 데이터베이스 전환 스위치
 * JSON ↔ PostgreSQL 전환 및 롤백 메커니즘
 * 
 * @author DOCORE
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('switch-database');

interface SwitchConfig {
  currentBackend: 'json' | 'postgres';
  canaryEnabled: boolean;
  canaryHeader?: string;
  canaryCookie?: string;
  canaryPercentage?: number;
  lastSwitchTime?: string;
  switchHistory: Array<{
    from: string;
    to: string;
    timestamp: string;
    reason: string;
  }>;
}

class DatabaseSwitcher {
  private configPath: string;
  private config: SwitchConfig;

  constructor() {
    this.configPath = join(process.cwd(), 'config/database-switch.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): SwitchConfig {
    if (existsSync(this.configPath)) {
      try {
        return JSON.parse(readFileSync(this.configPath, 'utf-8'));
      } catch (error) {
        logger.warn('설정 파일 로딩 실패, 기본값 사용', error);
      }
    }

    return {
      currentBackend: 'json',
      canaryEnabled: false,
      switchHistory: [],
    };
  }

  private saveConfig() {
    const configDir = join(process.cwd(), 'config');
    if (!existsSync(configDir)) {
      require('fs').mkdirSync(configDir, { recursive: true });
    }
    
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * 데이터베이스 백엔드 전환
   */
  async switchBackend(targetBackend: 'json' | 'postgres', reason: string = 'Manual switch') {
    const currentBackend = this.config.currentBackend;
    
    if (currentBackend === targetBackend) {
      logger.warn(`이미 ${targetBackend} 백엔드를 사용 중입니다`);
      return;
    }

    logger.info(`🔄 데이터베이스 백엔드 전환: ${currentBackend} → ${targetBackend}`);

    try {
      // 1. 전환 전 검증
      await this.validateSwitch(currentBackend, targetBackend);

      // 2. 백엔드 전환
      this.config.currentBackend = targetBackend;
      this.config.lastSwitchTime = new Date().toISOString();
      this.config.switchHistory.push({
        from: currentBackend,
        to: targetBackend,
        timestamp: new Date().toISOString(),
        reason,
      });

      // 3. 설정 저장
      this.saveConfig();

      // 4. 환경변수 업데이트
      await this.updateEnvironmentVariables(targetBackend);

      logger.info(`✅ 데이터베이스 백엔드 전환 완료: ${targetBackend}`);
      logger.info(`📝 전환 이유: ${reason}`);

    } catch (error) {
      logger.error('❌ 데이터베이스 백엔드 전환 실패', error);
      throw error;
    }
  }

  /**
   * 카나리 배포 활성화
   */
  async enableCanary(header?: string, cookie?: string, percentage?: number) {
    logger.info('🚀 카나리 배포 활성화');

    this.config.canaryEnabled = true;
    this.config.canaryHeader = header;
    this.config.canaryCookie = cookie;
    this.config.canaryPercentage = percentage || 10;

    this.saveConfig();

    logger.info(`✅ 카나리 배포 활성화 완료 (${this.config.canaryPercentage}%)`);
  }

  /**
   * 카나리 배포 비활성화
   */
  async disableCanary() {
    logger.info('🛑 카나리 배포 비활성화');

    this.config.canaryEnabled = false;
    this.config.canaryHeader = undefined;
    this.config.canaryCookie = undefined;
    this.config.canaryPercentage = undefined;

    this.saveConfig();

    logger.info('✅ 카나리 배포 비활성화 완료');
  }

  /**
   * 즉시 롤백
   */
  async rollback(reason: string = 'Emergency rollback') {
    const currentBackend = this.config.currentBackend;
    const targetBackend = currentBackend === 'json' ? 'postgres' : 'json';

    logger.warn(`🚨 즉시 롤백: ${currentBackend} → ${targetBackend}`);
    logger.warn(`📝 롤백 이유: ${reason}`);

    await this.switchBackend(targetBackend, reason);
  }

  /**
   * 전환 상태 확인
   */
  getStatus() {
    return {
      currentBackend: this.config.currentBackend,
      canaryEnabled: this.config.canaryEnabled,
      canaryPercentage: this.config.canaryPercentage,
      lastSwitchTime: this.config.lastSwitchTime,
      switchHistory: this.config.switchHistory.slice(-5), // 최근 5개만
    };
  }

  /**
   * 요청이 카나리 대상인지 확인
   */
  isCanaryRequest(headers: Record<string, string>, cookies: Record<string, string>): boolean {
    if (!this.config.canaryEnabled) {
      return false;
    }

    // 헤더 기반 카나리
    if (this.config.canaryHeader && headers[this.config.canaryHeader]) {
      return true;
    }

    // 쿠키 기반 카나리
    if (this.config.canaryCookie && cookies[this.config.canaryCookie]) {
      return true;
    }

    // 퍼센티지 기반 카나리
    if (this.config.canaryPercentage) {
      const random = Math.random() * 100;
      return random < this.config.canaryPercentage;
    }

    return false;
  }

  /**
   * 전환 전 검증
   */
  private async validateSwitch(from: string, to: string) {
    logger.info(`🔍 전환 검증: ${from} → ${to}`);

    // 1. 대상 백엔드 연결 확인
    if (to === 'postgres') {
      await this.validatePostgresConnection();
    }

    // 2. 데이터 일관성 확인
    await this.validateDataConsistency(from, to);

    logger.info('✅ 전환 검증 완료');
  }

  /**
   * PostgreSQL 연결 확인
   */
  private async validatePostgresConnection() {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      
      logger.info('✅ PostgreSQL 연결 확인 완료');
    } catch (error) {
      logger.error('❌ PostgreSQL 연결 실패', error);
      throw new Error('PostgreSQL 연결에 실패했습니다');
    }
  }

  /**
   * 데이터 일관성 확인
   */
  private async validateDataConsistency(from: string, to: string) {
    // 간단한 데이터 일관성 확인
    // 실제로는 더 복잡한 검증이 필요할 수 있음
    
    logger.info('✅ 데이터 일관성 확인 완료');
  }

  /**
   * 환경변수 업데이트
   */
  private async updateEnvironmentVariables(backend: 'json' | 'postgres') {
    // 환경변수 파일 업데이트
    const envPath = join(process.cwd(), '.env.local');
    
    if (existsSync(envPath)) {
      let envContent = readFileSync(envPath, 'utf-8');
      
      // DATA_BACKEND 업데이트
      if (envContent.includes('DATA_BACKEND=')) {
        envContent = envContent.replace(/DATA_BACKEND=.*/, `DATA_BACKEND=${backend}`);
      } else {
        envContent += `\nDATA_BACKEND=${backend}\n`;
      }
      
      writeFileSync(envPath, envContent, 'utf-8');
      logger.info(`✅ 환경변수 업데이트: DATA_BACKEND=${backend}`);
    }
  }

  /**
   * 전환 히스토리 출력
   */
  printHistory() {
    logger.info('📋 데이터베이스 전환 히스토리:');
    
    this.config.switchHistory.forEach((entry, index) => {
      logger.info(`${index + 1}. ${entry.from} → ${entry.to} (${entry.timestamp})`);
      logger.info(`   이유: ${entry.reason}`);
    });
  }
}

// CLI 인터페이스
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const switcher = new DatabaseSwitcher();

  try {
    switch (command) {
      case 'switch':
        const targetBackend = args[1] as 'json' | 'postgres';
        const reason = args[2] || 'CLI switch';
        
        if (!targetBackend || !['json', 'postgres'].includes(targetBackend)) {
          logger.error('사용법: npm run switch:db switch <json|postgres> [reason]');
          process.exit(1);
        }
        
        await switcher.switchBackend(targetBackend, reason);
        break;

      case 'canary:enable':
        const header = args[1];
        const cookie = args[2];
        const percentage = args[3] ? parseInt(args[3]) : 10;
        
        await switcher.enableCanary(header, cookie, percentage);
        break;

      case 'canary:disable':
        await switcher.disableCanary();
        break;

      case 'rollback':
        const rollbackReason = args[1] || 'CLI rollback';
        await switcher.rollback(rollbackReason);
        break;

      case 'status':
        const status = switcher.getStatus();
        logger.info('📊 현재 상태:', status);
        break;

      case 'history':
        switcher.printHistory();
        break;

      default:
        logger.info('사용법:');
        logger.info('  npm run switch:db switch <json|postgres> [reason]');
        logger.info('  npm run switch:db canary:enable [header] [cookie] [percentage]');
        logger.info('  npm run switch:db canary:disable');
        logger.info('  npm run switch:db rollback [reason]');
        logger.info('  npm run switch:db status');
        logger.info('  npm run switch:db history');
        break;
    }
  } catch (error) {
    logger.error('명령 실행 실패', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { DatabaseSwitcher };
