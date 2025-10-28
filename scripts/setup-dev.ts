/**
 * 개발 환경 설정 스크립트
 * 로컬 개발 환경 자동 설정
 * 
 * @author DOCORE
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('setup-dev');

interface SetupConfig {
  skipDocker: boolean;
  skipRedis: boolean;
  skipDatabase: boolean;
  skipEnv: boolean;
}

async function setupDevEnvironment(config: SetupConfig = {
  skipDocker: false,
  skipRedis: false,
  skipDatabase: false,
  skipEnv: false,
}) {
  logger.info('🚀 개발 환경 설정 시작...');

  try {
    // 1. 환경변수 파일 설정
    if (!config.skipEnv) {
      await setupEnvironmentFile();
    }

    // 2. Docker 컨테이너 시작
    if (!config.skipDocker) {
      await startDockerContainers();
    }

    // 3. 데이터베이스 설정
    if (!config.skipDatabase) {
      await setupDatabase();
    }

    // 4. Redis 설정 (선택사항)
    if (!config.skipRedis) {
      await setupRedis();
    }

    // 5. 의존성 설치
    await installDependencies();

    // 6. 빌드
    await buildProject();

    logger.info('✅ 개발 환경 설정 완료!');
    logger.info('📝 다음 명령어로 서버를 시작하세요:');
    logger.info('   npm run dev');

  } catch (error) {
    logger.error('❌ 개발 환경 설정 실패:', error);
    process.exit(1);
  }
}

async function setupEnvironmentFile() {
  logger.info('📝 환경변수 파일 설정...');

  const envExamplePath = join(process.cwd(), 'env.example');
  const envLocalPath = join(process.cwd(), '.env.local');

  if (!existsSync(envLocalPath)) {
    if (existsSync(envExamplePath)) {
      const envContent = readFileSync(envExamplePath, 'utf-8');
      writeFileSync(envLocalPath, envContent);
      logger.info('✅ .env.local 파일 생성 완료');
    } else {
      logger.warn('⚠️ env.example 파일이 없습니다. 수동으로 .env.local을 생성하세요.');
    }
  } else {
    logger.info('✅ .env.local 파일이 이미 존재합니다.');
  }
}

async function startDockerContainers() {
  logger.info('🐳 Docker 컨테이너 시작...');

  try {
    // Docker Compose 파일 확인
    const dockerComposePath = join(process.cwd(), 'docker-compose.yml');
    if (!existsSync(dockerComposePath)) {
      logger.warn('⚠️ docker-compose.yml 파일이 없습니다. Docker 컨테이너를 건너뜁니다.');
      return;
    }

    // PostgreSQL 컨테이너 시작
    execSync('docker compose up -d postgres', { stdio: 'inherit' });
    logger.info('✅ PostgreSQL 컨테이너 시작 완료');

    // Redis 컨테이너 시작 (선택사항)
    try {
      execSync('docker compose up -d redis', { stdio: 'inherit' });
      logger.info('✅ Redis 컨테이너 시작 완료');
    } catch (error) {
      logger.warn('⚠️ Redis 컨테이너 시작 실패 (선택사항)');
    }

  } catch (error) {
    logger.error('❌ Docker 컨테이너 시작 실패:', error);
    throw error;
  }
}

async function setupDatabase() {
  logger.info('🗄️ 데이터베이스 설정...');

  try {
    // Prisma 클라이언트 생성
    execSync('npm run db:generate', { stdio: 'inherit' });
    logger.info('✅ Prisma 클라이언트 생성 완료');

    // 데이터베이스 스키마 적용
    execSync('npm run db:push', { stdio: 'inherit' });
    logger.info('✅ 데이터베이스 스키마 적용 완료');

    // 시드 데이터 생성
    execSync('npm run db:seed', { stdio: 'inherit' });
    logger.info('✅ 시드 데이터 생성 완료');

  } catch (error) {
    logger.error('❌ 데이터베이스 설정 실패:', error);
    throw error;
  }
}

async function setupRedis() {
  logger.info('🔴 Redis 설정...');

  try {
    // Redis 연결 테스트
    execSync('redis-cli ping', { stdio: 'pipe' });
    logger.info('✅ Redis 연결 확인 완료');

  } catch (error) {
    logger.warn('⚠️ Redis 연결 실패. 캐시 기능이 비활성화됩니다.');
  }
}

async function installDependencies() {
  logger.info('📦 의존성 설치...');

  try {
    execSync('npm install', { stdio: 'inherit' });
    logger.info('✅ 의존성 설치 완료');

  } catch (error) {
    logger.error('❌ 의존성 설치 실패:', error);
    throw error;
  }
}

async function buildProject() {
  logger.info('🔨 프로젝트 빌드...');

  try {
    execSync('npm run build', { stdio: 'inherit' });
    logger.info('✅ 프로젝트 빌드 완료');

  } catch (error) {
    logger.error('❌ 프로젝트 빌드 실패:', error);
    throw error;
  }
}

// CLI 인터페이스
async function main() {
  const args = process.argv.slice(2);
  
  const config: SetupConfig = {
    skipDocker: args.includes('--skip-docker'),
    skipRedis: args.includes('--skip-redis'),
    skipDatabase: args.includes('--skip-database'),
    skipEnv: args.includes('--skip-env'),
  };

  if (args.includes('--help')) {
    console.log(`
개발 환경 설정 스크립트

사용법:
  npm run setup:dev [옵션]

옵션:
  --skip-docker     Docker 컨테이너 시작 건너뛰기
  --skip-redis      Redis 설정 건너뛰기
  --skip-database   데이터베이스 설정 건너뛰기
  --skip-env        환경변수 파일 설정 건너뛰기
  --help            도움말 표시

예시:
  npm run setup:dev
  npm run setup:dev --skip-docker
  npm run setup:dev --skip-redis --skip-database
`);
    process.exit(0);
  }

  await setupDevEnvironment(config);
}

if (require.main === module) {
  main();
}

export { setupDevEnvironment };