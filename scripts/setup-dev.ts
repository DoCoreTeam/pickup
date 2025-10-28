/**
 * 개발 환경 설정 스크립트
 * 로컬 개발 환경 초기 설정
 * 
 * @author DOCORE
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('setup-dev');

class DevSetup {
  async setup() {
    try {
      logger.info('🛠️  개발 환경 설정 시작...');

      // 1. 환경변수 파일 생성
      await this.createEnvFiles();

      // 2. 의존성 설치
      await this.installDependencies();

      // 3. 데이터베이스 설정
      await this.setupDatabase();

      // 4. Prisma 클라이언트 생성
      await this.generatePrismaClient();

      logger.info('✅ 개발 환경 설정 완료!');
      logger.info('🚀 다음 명령어로 개발 서버를 시작하세요:');
      logger.info('   npm run dev');
    } catch (error) {
      logger.error('❌ 개발 환경 설정 실패', error);
      throw error;
    }
  }

  private async createEnvFiles() {
    logger.info('📝 환경변수 파일 생성...');

    const envContent = `# 개발 환경 설정
NODE_ENV=development
DATA_BACKEND=json
PORT=3001
API_PREFIX=api

# 데이터베이스 설정 (PostgreSQL 사용 시)
# DATABASE_URL="postgresql://pickup_user:pickup_password@localhost:5432/pickup_dev?pgbouncer=true&connection_limit=1"

# OpenAI 설정 (AI 기능 사용 시)
# OPENAI_API_KEY=your_openai_api_key_here

# CORS 설정
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# 현재 가게 ID (선택사항)
# CURRENT_STORE_ID=store_1761395758410_e9454719b9
`;

    const envPath = join(process.cwd(), '.env.local');
    if (!existsSync(envPath)) {
      writeFileSync(envPath, envContent, 'utf-8');
      logger.info('✅ .env.local 파일 생성 완료');
    } else {
      logger.info('ℹ️  .env.local 파일이 이미 존재합니다');
    }
  }

  private async installDependencies() {
    logger.info('📦 의존성 설치...');

    try {
      execSync('npm install', { stdio: 'inherit' });
      logger.info('✅ 의존성 설치 완료');
    } catch (error) {
      logger.error('❌ 의존성 설치 실패', error);
      throw error;
    }
  }

  private async setupDatabase() {
    logger.info('🗄️  데이터베이스 설정...');

    try {
      // Docker Compose로 PostgreSQL 시작
      execSync('docker-compose up -d postgres', { stdio: 'inherit' });
      logger.info('✅ PostgreSQL 컨테이너 시작 완료');

      // 데이터베이스 연결 대기
      logger.info('⏳ 데이터베이스 연결 대기 중...');
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      logger.warn('⚠️  데이터베이스 설정 실패 (Docker가 설치되지 않았을 수 있음)', error);
      logger.info('💡 수동으로 PostgreSQL을 설정하거나 .env.local에서 DATA_BACKEND=json으로 설정하세요');
    }
  }

  private async generatePrismaClient() {
    logger.info('🔧 Prisma 클라이언트 생성...');

    try {
      execSync('npm run db:generate', { stdio: 'inherit' });
      logger.info('✅ Prisma 클라이언트 생성 완료');
    } catch (error) {
      logger.warn('⚠️  Prisma 클라이언트 생성 실패 (데이터베이스 연결 필요)', error);
    }
  }
}

async function main() {
  const setup = new DevSetup();
  await setup.setup();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { DevSetup };
