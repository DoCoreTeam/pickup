/**
 * PostgreSQL 데이터베이스 연결 모듈
 * 기존 API 서버에서 사용할 데이터베이스 연결
 *
 * @author DOCORE
 */

const { Client } = require('pg');
const path = require('path');

// 환경 변수 로드
require('dotenv').config({ path: path.resolve(__dirname, '../../env.database') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// DATABASE_URL이 있으면 파싱하여 사용, 없으면 개별 환경 변수 사용
let dbConfig;

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

// 연결 풀 설정
const poolConfig = {
  ...dbConfig,
  max: 20, // 최대 연결 수
  idleTimeoutMillis: 30000, // 유휴 연결 타임아웃
  connectionTimeoutMillis: 2000, // 연결 타임아웃
};

let client = null;
let pool = null;

// 단일 연결 클라이언트
function getClient() {
  if (!client) {
    client = new Client(dbConfig);
  }
  return client;
}

// 연결 풀 (향후 확장용)
function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool(poolConfig);
  }
  return pool;
}

// 데이터베이스 연결
async function connect() {
  try {
    const client = getClient();
    await client.connect();
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
    if (client) {
      await client.end();
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
  const client = getClient();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ 쿼리 실행 실패:', error);
    throw error;
  }
}

// 트랜잭션 실행
async function transaction(callback) {
  const client = getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
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
  getPool
};
