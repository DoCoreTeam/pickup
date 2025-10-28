-- PostgreSQL 초기화 스크립트
-- 개발 환경용 데이터베이스 설정
-- 
-- @author DOCORE

-- 데이터베이스 생성 (이미 docker-compose에서 생성됨)
-- CREATE DATABASE pickup_dev;

-- 사용자 권한 설정
-- GRANT ALL PRIVILEGES ON DATABASE pickup_dev TO pickup_user;

-- 확장 기능 활성화 (필요시)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 개발용 설정
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1초 이상 쿼리 로깅
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';

-- 설정 적용을 위한 재시작 필요
-- SELECT pg_reload_conf();

-- 개발 환경용 통계 수집 활성화
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 연결 제한 설정 (개발 환경)
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- 설정 적용
SELECT pg_reload_conf();
