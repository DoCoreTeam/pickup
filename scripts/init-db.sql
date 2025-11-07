-- PostgreSQL 데이터베이스 초기화 스크립트
-- 픽업 서비스용 테이블 생성
--
-- @author DOCORE

-- 데이터베이스 생성 (이미 생성되어 있음)
-- CREATE DATABASE pickup_db;

-- 슈퍼어드민 테이블
CREATE TABLE IF NOT EXISTS superadmin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 가게 테이블
CREATE TABLE IF NOT EXISTS stores (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    status VARCHAR(50) DEFAULT 'active',
    subdomain VARCHAR(255) UNIQUE,
    subdomain_status VARCHAR(50),
    subdomain_created_at TIMESTAMP,
    subdomain_last_modified TIMESTAMP,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paused_at TIMESTAMP
);

-- 가게 사장님(점주) 계정 테이블
CREATE TABLE IF NOT EXISTS store_owners (
    id VARCHAR(255) PRIMARY KEY,
    store_id VARCHAR(255),
    owner_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    password_hash VARCHAR(255),
    request_message TEXT,
    request_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    last_login TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

-- 가게 설정 테이블
CREATE TABLE IF NOT EXISTS store_settings (
    id SERIAL PRIMARY KEY,
    store_id VARCHAR(255) UNIQUE NOT NULL,
    basic JSONB,
    discount JSONB,
    delivery JSONB,
    pickup JSONB,
    images JSONB,
    business_hours JSONB,
    section_order JSONB,
    qr_code JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- 활동 로그 테이블
CREATE TABLE IF NOT EXISTS activity_logs (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    user_id VARCHAR(255),
    user_name VARCHAR(255),
    target_type VARCHAR(100),
    target_id VARCHAR(255),
    target_name VARCHAR(255),
    details JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 분석 데이터 테이블
CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    site_visits JSONB,
    store_visits JSONB,
    phone_clicks JSONB,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 릴리즈 노트 테이블
CREATE TABLE IF NOT EXISTS release_notes (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    codename VARCHAR(100),
    release_date TIMESTAMP NOT NULL,
    title VARCHAR(255) NOT NULL,
    highlights JSONB,
    features JSONB,
    bug_fixes JSONB,
    technical_improvements JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 현재 가게 ID 저장 테이블
CREATE TABLE IF NOT EXISTS current_store (
    id INTEGER PRIMARY KEY DEFAULT 1,
    store_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
CREATE INDEX IF NOT EXISTS idx_stores_subdomain ON stores(subdomain);
CREATE INDEX IF NOT EXISTS idx_stores_created_at ON stores(created_at);
CREATE INDEX IF NOT EXISTS idx_store_owners_status ON store_owners(status);
CREATE INDEX IF NOT EXISTS idx_store_owners_store_id ON store_owners(store_id);
CREATE INDEX IF NOT EXISTS idx_store_settings_store_id ON store_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_release_notes_version ON release_notes(version);
CREATE INDEX IF NOT EXISTS idx_release_notes_release_date ON release_notes(release_date);

-- 초기 데이터 삽입 (기본 슈퍼어드민)
INSERT INTO superadmin (username, password_hash, created_at, last_modified)
VALUES ('admin', 'admin123', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO NOTHING;
