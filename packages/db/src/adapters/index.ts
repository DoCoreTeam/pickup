/**
 * 데이터 소스 어댑터 팩토리
 * DATA_BACKEND 환경변수에 따라 적절한 어댑터 반환
 * DUAL_WRITE=true일 때 듀얼라이트 어댑터 사용
 * 
 * @author DOCORE
 */

import { DataAdapter, DataSource } from '@pickup/shared';
import { JsonAdapter } from './json-adapter';
import { PostgresAdapter } from './postgres-adapter';
import { DualWriteAdapter } from './dual-write-adapter';
import { prisma } from '../index';
import { createLogger } from '@pickup/shared';

const logger = createLogger('adapter-factory');

export function createDataAdapter(): DataAdapter {
  const dataBackend = (process.env.DATA_BACKEND as DataSource) || 'json';
  const dualWriteEnabled = process.env.DUAL_WRITE === 'true';
  
  // 듀얼라이트 모드인 경우
  if (dualWriteEnabled) {
    logger.info('🔄 듀얼라이트 모드 활성화');
    const jsonAdapter = new JsonAdapter();
    const postgresAdapter = new PostgresAdapter(prisma);
    return new DualWriteAdapter(jsonAdapter, postgresAdapter);
  }
  
  // 일반 모드
  switch (dataBackend) {
    case 'json':
      logger.info('📄 JSON 어댑터 사용');
      return new JsonAdapter();
    case 'postgres':
      logger.info('🐘 PostgreSQL 어댑터 사용');
      return new PostgresAdapter(prisma);
    default:
      throw new Error(`지원하지 않는 데이터 백엔드: ${dataBackend}`);
  }
}

// 기본 어댑터 인스턴스
export const dataAdapter = createDataAdapter();

// 어댑터 타입 export
export { DataAdapter, JsonAdapter, PostgresAdapter, DualWriteAdapter };
