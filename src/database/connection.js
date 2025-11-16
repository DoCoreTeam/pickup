/**
 * PostgreSQL 데이터베이스 연결 모듈
 * 기존 API 서버에서 사용할 데이터베이스 연결
 *
 * @author DOCORE
 */

const { Client } = require('pg');
const path = require('path');

// 환경 변수 로드 (파일이 없어도 에러 없이 계속 진행)
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../env.database') });
} catch (e) {
  // 파일이 없어도 계속 진행 (Railway 등 클라우드 환경)
}

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {
  // 파일이 없어도 계속 진행 (Railway 등 클라우드 환경)
}

// DATABASE_URL이 있으면 파싱하여 사용, 없으면 개별 환경 변수 사용
let dbConfig;

// 디버깅: 모든 환경 변수 확인 (Railway 디버깅용)
console.log('[DB] 환경 변수 확인:');
console.log('[DB] DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 50) + '...' : '없음');
console.log('[DB] DB_HOST:', process.env.DB_HOST || '없음');
console.log('[DB] DB_PORT:', process.env.DB_PORT || '없음');
console.log('[DB] DB_NAME:', process.env.DB_NAME || '없음');
console.log('[DB] DB_USER:', process.env.DB_USER || '없음');
console.log('[DB] NODE_ENV:', process.env.NODE_ENV || '없음');
console.log('[DB] DATA_BACKEND:', process.env.DATA_BACKEND || '없음');

if (process.env.DATABASE_URL) {
  // DATABASE_URL 파싱 (NEON 등 클라우드 DB용)
  const url = require('url');
  const dbUrl = new url.URL(process.env.DATABASE_URL);
  
  // NEON 등 클라우드 DB는 항상 SSL 필요 (sslmode=require가 URL에 포함되어 있으면 SSL 활성화)
  const needsSSL = dbUrl.searchParams.get('sslmode') === 'require' || 
                   process.env.NODE_ENV === 'production' ||
                   dbUrl.hostname.includes('neon.tech') ||
                   dbUrl.hostname.includes('aws.neon.tech');
  
  dbConfig = {
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port) || 5432,
    database: dbUrl.pathname.slice(1), // 첫 번째 '/' 제거
    user: dbUrl.username,
    password: dbUrl.password,
    ssl: needsSSL ? { rejectUnauthorized: false } : false,
  };
  
  console.log('[DB] DATABASE_URL 파싱 완료:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    ssl: !!dbConfig.ssl
  });
} else {
  // 개별 환경 변수 사용 (로컬 개발용)
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'pickup_db',
    user: process.env.DB_USER || 'pickup_user',
    password: process.env.DB_PASSWORD || 'pickup_password',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
}

// 연결 풀 설정 (성능 최적화)
const poolConfig = {
  ...dbConfig,
  max: parseInt(process.env.DB_POOL_MAX) || 10, // 최대 연결 수 (20 → 10으로 감소, 과도한 연결 방지)
  min: 2, // 최소 연결 수 (연결 풀 유지)
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000, // 유휴 연결 타임아웃 (30초 → 10초로 단축)
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 5000, // 연결 타임아웃 (2초 → 5초로 증가, 안정성 향상)
  statement_timeout: 30000, // 쿼리 타임아웃 (30초)
  query_timeout: 30000, // 쿼리 타임아웃
};

let client = null;
let pool = null;
let isConnecting = false;
let reconnectTimer = null;

// DB 쿼리 통계 추적 (NEON 비용 계산용)
const dbStats = {
  totalQueries: 0,
  totalBytes: 0,
  queriesByType: {}, // SELECT, INSERT, UPDATE, DELETE 등
  startTime: Date.now(),
  reset() {
    this.totalQueries = 0;
    this.totalBytes = 0;
    this.queriesByType = {};
    this.startTime = Date.now();
  },
  // 쿼리 타입 추출 (대략적)
  getQueryType(text) {
    const trimmed = text.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('ALTER')) return 'ALTER';
    if (trimmed.startsWith('DROP')) return 'DROP';
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) return 'TRANSACTION';
    return 'OTHER';
  },
  // 쿼리 크기 추정 (텍스트 + 파라미터)
  estimateQuerySize(text, params = []) {
    let size = Buffer.byteLength(text, 'utf8');
    // 파라미터 크기 추정 (대략적)
    params.forEach(param => {
      if (typeof param === 'string') {
        size += Buffer.byteLength(param, 'utf8');
      } else if (typeof param === 'number') {
        size += 8; // 숫자는 대략 8바이트
      } else if (Buffer.isBuffer(param)) {
        size += param.length;
      } else if (param !== null && typeof param === 'object') {
        size += Buffer.byteLength(JSON.stringify(param), 'utf8');
      }
    });
    return size;
  },
  // 응답 크기 추정 (대략적)
  estimateResponseSize(result) {
    if (!result || !result.rows) return 0;
    let size = 0;
    result.rows.forEach(row => {
      size += Buffer.byteLength(JSON.stringify(row), 'utf8');
    });
    return size;
  },
  // 통계 가져오기
  getStats() {
    const uptime = Date.now() - this.startTime;
    const uptimeHours = uptime / (1000 * 60 * 60);
    const queriesPerHour = uptimeHours > 0 ? this.totalQueries / uptimeHours : 0;
    
    // NEON Launch 플랜 기준 비용 계산
    // - 100 GB public network transfer 포함 (프로젝트당)
    // - Compute: $0.106 / CU per hour (쿼리 수로 추정 불가, 실제 사용량 필요)
    // - Storage: $0.35 / GB-month (스토리지 사용량 필요)
    const includedTransferGB = 100; // Launch 플랜 포함량
    const totalTransferGB = this.totalBytes / (1024 * 1024 * 1024);
    const transferOverGB = Math.max(0, totalTransferGB - includedTransferGB);
    
    // NEON 비용 추정 (네트워크 전송량만, 실제 Compute/Storage는 서버에서 확인 필요)
    // Launch 플랜: 100GB 포함, 초과 시 $0.20/GB-month
    // 서버 가동 시간을 기준으로 월간 추정 (실제로는 월 단위 청구)
    const monthlyTransferGB = transferOverGB;
    const transferCostPerMonth = monthlyTransferGB * 0.20; // $0.20 per GB-month
    
    return {
      totalQueries: this.totalQueries,
      totalBytes: this.totalBytes,
      totalTransferGB: totalTransferGB.toFixed(4),
      includedTransferGB,
      transferOverGB: transferOverGB.toFixed(4),
      queriesByType: { ...this.queriesByType },
      uptimeMs: uptime,
      uptimeHours: uptimeHours.toFixed(2),
      queriesPerHour: queriesPerHour.toFixed(2),
      // NEON 비용 추정
      estimatedCost: {
        transferCostPerMonth: transferCostPerMonth.toFixed(2),
        transferOverGB: monthlyTransferGB.toFixed(4),
        note: 'Compute 및 Storage 비용은 Neon 대시보드에서 확인하세요'
      }
    };
  }
};

// 단일 연결 클라이언트
function getClient() {
  if (!client) {
    client = new Client(dbConfig);
    
    // 에러 이벤트 핸들러 추가 (크래시 방지)
    client.on('error', (err) => {
      console.error('[DB] PostgreSQL 클라이언트 에러:', err.message);
      // 연결이 끊어진 경우 자동 재연결 시도
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message.includes('terminated')) {
        console.log('[DB] 연결이 끊어졌습니다. 재연결을 시도합니다...');
        // 클라이언트 상태를 끊어진 것으로 표시
        client._connectionError = true;
        scheduleReconnect();
      }
    });
    
    // 연결 종료 이벤트 핸들러
    client.on('end', () => {
      console.log('[DB] PostgreSQL 연결이 종료되었습니다.');
      // 연결이 정상적으로 종료된 경우가 아니라면 재연결 시도
      if (!isConnecting) {
        client._connectionError = true;
        scheduleReconnect();
      }
    });
  } else {
    // 기존 클라이언트가 있지만 연결이 끊어진 경우 재연결 시도
    if (client._ending || client._connectionError) {
      if (!isConnecting && !reconnectTimer) {
        scheduleReconnect();
      }
    }
  }
  return client;
}

// 재연결 스케줄링 (지수 백오프)
function scheduleReconnect() {
  // 이미 재연결이 예약되어 있으면 무시
  if (reconnectTimer) {
    return;
  }
  
  // 연결 중이면 무시
  if (isConnecting) {
    return;
  }
  
  // 클라이언트가 이미 연결되어 있으면 무시
  if (client && !client._ending && !client._connectionError) {
    return;
  }
  
  // 5초 후 재연결 시도
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await attemptReconnect();
  }, 5000);
}

// 재연결 시도
async function attemptReconnect() {
  if (isConnecting) {
    return;
  }
  
  try {
    isConnecting = true;
    
    // 기존 클라이언트 정리
    if (client) {
      try {
        // 에러 핸들러 제거
        client.removeAllListeners('error');
        client.removeAllListeners('end');
        
        if (!client._ending) {
          await client.end();
        }
      } catch (err) {
        // 이미 종료된 경우 무시
      }
      client = null;
    }
    
    // 새 클라이언트 생성 및 연결
    const newClient = getClient();
    await newClient.connect();
    
    // 연결 성공 시 에러 플래그 초기화
    newClient._connectionError = false;
    
    console.log('✅ PostgreSQL 데이터베이스 재연결 성공');
  } catch (error) {
    console.error('❌ PostgreSQL 데이터베이스 재연결 실패:', error.message);
    // 재연결 실패 시 다시 시도
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
}

// 연결 풀 (향후 확장용)
function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool(poolConfig);
    
    // 연결 풀 에러 핸들러 추가
    pool.on('error', (err) => {
      console.error('[DB] PostgreSQL 연결 풀 에러:', err.message);
    });
  }
  return pool;
}

// 데이터베이스 연결
async function connect() {
  try {
    const client = getClient();
    await client.connect();
    
    // 연결 성공 시 에러 플래그 초기화
    client._connectionError = false;
    
    console.log('✅ PostgreSQL 데이터베이스 연결 성공');
    return client;
  } catch (error) {
    console.error('❌ PostgreSQL 데이터베이스 연결 실패:', error);
    throw error;
  }
}

// 데이터베이스 연결 해제
async function disconnect() {
  try {
    // 재연결 타이머 취소
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    if (client) {
      // 에러 핸들러 제거 (정상 종료 시 재연결 방지)
      client.removeAllListeners('error');
      client.removeAllListeners('end');
      
      try {
        await client.end();
      } catch (err) {
        // 이미 종료된 경우 무시
      }
      client = null;
    }
    if (pool) {
      await pool.end();
      pool = null;
    }
    console.log('✅ PostgreSQL 데이터베이스 연결 해제');
  } catch (error) {
    console.error('❌ PostgreSQL 데이터베이스 연결 해제 실패:', error);
  }
}

// 쿼리 실행 (단일 연결)
async function query(text, params = []) {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const client = getClient();
      
      // 연결 상태 확인 및 재연결
      if (client._ending || client._connectionError) {
        console.log('[DB] 연결이 끊어진 것으로 감지되었습니다. 재연결을 시도합니다...');
        await attemptReconnect();
        continue;
      }
      
      const queryStartTime = Date.now();
      const result = await client.query(text, params);
      const queryDuration = Date.now() - queryStartTime;
      
      // 느린 쿼리 로깅 (1초 이상 소요되는 쿼리)
      if (queryDuration > 1000) {
        console.warn(`[느린 쿼리] ${queryDuration}ms 소요:`, text.substring(0, 100), params);
      }
      
      // 통계 추적
      const queryType = dbStats.getQueryType(text);
      const querySize = dbStats.estimateQuerySize(text, params);
      const responseSize = dbStats.estimateResponseSize(result);
      const totalSize = querySize + responseSize;
      
      dbStats.totalQueries++;
      dbStats.totalBytes += totalSize;
      dbStats.queriesByType[queryType] = (dbStats.queriesByType[queryType] || 0) + 1;
      
      return result;
    } catch (error) {
      // 연결 관련 에러 또는 프로토콜 파서 에러인 경우 재연결 시도
      const isConnectionError = error.code === 'ECONNRESET' || 
                                error.code === 'EPIPE' || 
                                error.message?.includes('terminated') ||
                                error.message?.includes('Connection') ||
                                error.message?.includes('pg-protocol') ||
                                error.message?.includes('Parser') ||
                                error.severity === 'ERROR';
      
      if (isConnectionError) {
        console.error(`❌ 쿼리 실행 실패 (에러 코드: ${error.code}, 재시도 ${retries + 1}/${maxRetries}):`, error.message);
        retries++;
        
        if (retries < maxRetries) {
          await attemptReconnect();
          // 재연결 후 잠시 대기
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
      
      console.error('❌ 쿼리 실행 실패:', error);
      throw error;
    }
  }
  
  throw new Error('쿼리 실행 실패: 최대 재시도 횟수 초과');
}

// 트랜잭션 실행
async function transaction(callback) {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    let client;
    try {
      client = getClient();
      
      // 연결 상태 확인 및 재연결
      if (client._ending || client._connectionError) {
        console.log('[DB] 트랜잭션 시작 전 연결 상태 확인 및 재연결 시도...');
        await attemptReconnect();
        client = getClient();
      }
      
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      // 롤백 시도 (에러가 발생해도 롤백은 시도)
      if (client) {
        try {
          // 클라이언트가 살아있고 연결되어 있으면 롤백 시도
          if (!client._ending && !client._connectionError) {
            await client.query('ROLLBACK').catch(() => {
              // 롤백 실패는 무시 (이미 연결이 끊어진 경우)
            });
          }
        } catch (rollbackError) {
          // 롤백 실패는 무시 (연결이 끊어진 경우)
          console.error('[DB] 롤백 실패 (무시됨):', rollbackError.message);
        }
      }
      
      // 연결 관련 에러 또는 프로토콜 파서 에러인 경우 재연결 시도
      const isConnectionError = error.code === 'ECONNRESET' || 
                                error.code === 'EPIPE' || 
                                error.message?.includes('terminated') ||
                                error.message?.includes('Connection') ||
                                error.message?.includes('pg-protocol') ||
                                error.message?.includes('Parser') ||
                                error.severity === 'ERROR';
      
      if (isConnectionError && retries < maxRetries - 1) {
        console.error(`[DB] 트랜잭션 실행 실패 (에러 코드: ${error.code}, 재시도 ${retries + 1}/${maxRetries}):`, error.message);
        retries++;
        
        // 클라이언트 정리 후 재연결
        if (client) {
          try {
            client.removeAllListeners('error');
            client.removeAllListeners('end');
            if (!client._ending) {
              await client.end().catch(() => {});
            }
          } catch (cleanupError) {
            // 정리 실패는 무시
          }
          client = null;
        }
        
        await attemptReconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('트랜잭션 실행 실패: 최대 재시도 횟수 초과');
}

// 헬스체크
async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as current_time');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      database: dbConfig.database
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      database: dbConfig.database
    };
  }
}

module.exports = {
  connect,
  disconnect,
  query,
  transaction,
  healthCheck,
  getClient,
  getPool,
  getDbStats: () => dbStats.getStats(),
  resetDbStats: () => dbStats.reset()
};
