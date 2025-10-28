/**
 * 환경변수 설정 및 검증
 * dotenv-safe를 사용한 필수 환경변수 검증
 * 
 * @author DOCORE
 */

import * as dotenvSafe from 'dotenv-safe';
import { createLogger } from './logger';

const logger = createLogger('env-config');

// .env 파일 로드 및 검증
dotenvSafe.config({
  allowEmptyValues: true,
  example: '.env.example',
});

// 환경변수 타입 정의
export interface EnvConfig {
  // 기본 설정
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  
  // 데이터 백엔드 설정
  DATA_BACKEND: 'json' | 'postgres';
  DUAL_WRITE: boolean;
  
  // 데이터베이스 설정
  DATABASE_URL: string;
  
  // OpenAI 설정
  OPENAI_API_KEY: string;
  
  // Rate Limiting 설정
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  
  // 로깅 설정
  ENABLE_REQUEST_LOGGING: boolean;
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
  
  // Redis 설정 (선택사항)
  REDIS_URL?: string;
  
  // Railway 배포 설정
  RAILWAY_ENVIRONMENT?: string;
  RAILWAY_PROJECT_ID?: string;
  RAILWAY_SERVICE_ID?: string;
  
  // 보안 설정
  JWT_SECRET?: string;
  SESSION_SECRET?: string;
  
  // 모니터링 설정
  SENTRY_DSN?: string;
  
  // 개발 설정
  DEBUG: boolean;
  VERBOSE_LOGGING: boolean;
}

// 환경변수 파싱 및 검증
function parseEnvConfig(): EnvConfig {
  const config: EnvConfig = {
    // 기본 설정
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    PORT: parseInt(process.env.PORT || '3001', 10),
    
    // 데이터 백엔드 설정
    DATA_BACKEND: (process.env.DATA_BACKEND as EnvConfig['DATA_BACKEND']) || 'json',
    DUAL_WRITE: process.env.DUAL_WRITE === 'true',
    
    // 데이터베이스 설정
    DATABASE_URL: process.env.DATABASE_URL || '',
    
    // OpenAI 설정
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    
    // Rate Limiting 설정
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    
    // 로깅 설정
    ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING === 'true',
    LOG_LEVEL: (process.env.LOG_LEVEL as EnvConfig['LOG_LEVEL']) || 'info',
    
    // Redis 설정 (선택사항)
    REDIS_URL: process.env.REDIS_URL,
    
    // Railway 배포 설정
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
    RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID,
    RAILWAY_SERVICE_ID: process.env.RAILWAY_SERVICE_ID,
    
    // 보안 설정
    JWT_SECRET: process.env.JWT_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET,
    
    // 모니터링 설정
    SENTRY_DSN: process.env.SENTRY_DSN,
    
    // 개발 설정
    DEBUG: process.env.DEBUG === 'true',
    VERBOSE_LOGGING: process.env.VERBOSE_LOGGING === 'true',
  };

  // 필수 환경변수 검증
  validateRequiredEnvVars(config);

  return config;
}

// 필수 환경변수 검증
function validateRequiredEnvVars(config: EnvConfig): void {
  const requiredVars = [
    'DATABASE_URL',
    'OPENAI_API_KEY',
  ];

  const missingVars: string[] = [];

  for (const varName of requiredVars) {
    if (!config[varName as keyof EnvConfig]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `필수 환경변수가 누락되었습니다: ${missingVars.join(', ')}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  // 데이터베이스 URL 형식 검증
  if (!config.DATABASE_URL.startsWith('postgresql://')) {
    logger.warn('DATABASE_URL이 PostgreSQL 형식이 아닙니다. Neon 또는 로컬 PostgreSQL을 사용하세요.');
  }

  // OpenAI API 키 형식 검증
  if (!config.OPENAI_API_KEY.startsWith('sk-')) {
    logger.warn('OPENAI_API_KEY이 올바른 형식이 아닙니다.');
  }

  logger.info('환경변수 검증 완료');
}

// 환경변수 설정 내보내기
export const envConfig = parseEnvConfig();

// 개발 환경 확인 헬퍼
export const isDevelopment = envConfig.NODE_ENV === 'development';
export const isProduction = envConfig.NODE_ENV === 'production';
export const isTest = envConfig.NODE_ENV === 'test';

// 데이터 백엔드 확인 헬퍼
export const isJsonBackend = envConfig.DATA_BACKEND === 'json';
export const isPostgresBackend = envConfig.DATA_BACKEND === 'postgres';
export const isDualWriteEnabled = envConfig.DUAL_WRITE;

// Redis 사용 가능 여부 확인
export const isRedisAvailable = !!envConfig.REDIS_URL;

// Railway 환경 확인
export const isRailwayEnvironment = !!envConfig.RAILWAY_ENVIRONMENT;

// 로깅 설정 확인
export const shouldLogRequests = envConfig.ENABLE_REQUEST_LOGGING;
export const isVerboseLogging = envConfig.VERBOSE_LOGGING;
