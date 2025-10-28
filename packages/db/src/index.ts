/**
 * 픽업 서비스 데이터베이스 패키지
 * Prisma 클라이언트와 커넥션 관리
 * 
 * @author DOCORE
 */

import { PrismaClient } from '@prisma/client';

// Prisma 클라이언트 인스턴스
let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

// 개발 환경에서 Hot Reload 시 중복 인스턴스 방지
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
    // Neon/pgbouncer 전제: connection_limit=1
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }
  prisma = global.__prisma;
}

// 데이터베이스 연결 상태 확인
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('데이터베이스 연결 실패:', error);
    return false;
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

// Prisma 클라이언트 export
export { prisma };
export default prisma;

// 타입 export
export * from '@prisma/client';
