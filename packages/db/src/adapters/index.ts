/**
 * 데이터 소스 어댑터 팩토리
 * DATA_BACKEND 환경변수에 따라 적절한 어댑터 반환
 * 
 * @author DOCORE
 */

import { DataAdapter, DataSource } from '@pickup/shared';
import { JsonAdapter } from './json-adapter';
import { PostgresAdapter } from './postgres-adapter';
import { prisma } from '../index';

export function createDataAdapter(): DataAdapter {
  const dataBackend = (process.env.DATA_BACKEND as DataSource) || 'json';
  
  switch (dataBackend) {
    case 'json':
      return new JsonAdapter();
    case 'postgres':
      return new PostgresAdapter(prisma);
    default:
      throw new Error(`지원하지 않는 데이터 백엔드: ${dataBackend}`);
  }
}

// 기본 어댑터 인스턴스
export const dataAdapter = createDataAdapter();

// 어댑터 타입 export
export { DataAdapter, JsonAdapter, PostgresAdapter };
