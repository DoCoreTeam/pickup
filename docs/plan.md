# 픽업 서비스 모노레포 마이그레이션 계획서

## 📋 개요

현재 Python HTTP 서버 + JSON 파일 기반의 픽업 서비스를 NestJS(백엔드) + Prisma + PostgreSQL, Next.js(프론트엔드/어드민) 기반 모노레포로 점진적으로 전환하는 상세 계획서입니다.

## 🎯 목표

- **100% 호환성 유지**: 기존 API 엔드포인트, 응답 형식, 라우트 구조 완전 보존
- **점진적 마이그레이션**: 서비스 중단 없이 단계별 전환
- **성능 향상**: JSON 파일 → PostgreSQL, 동기 I/O → 비동기 처리
- **확장성 확보**: 모노레포 구조로 유지보수성 및 개발 효율성 향상

## 🏗️ 현재 아키텍처 분석

### 백엔드 (Python HTTP Server)
- **서버**: Python 내장 HTTP 서버 (BaseHTTPRequestHandler)
- **데이터**: JSON 파일 기반 (`assets/data/*.json`)
- **포트**: 8081 (개발), Railway 배포
- **주요 기능**: 가게 관리, 설정 관리, QR 코드 생성, AI 콘텐츠 생성

### 프론트엔드
- **가게 페이지**: `store.html` (반응형 모바일 최적화)
- **어드민**: `admin/dashboard.html` (웹 기반 관리자 인터페이스)
- **정적 파일**: HTML, CSS, JavaScript (바닐라)

### 데이터 구조
- **메인 데이터**: `assets/data/data.json` (가게, 설정, 슈퍼어드민)
- **활동 로그**: `assets/data/activity_logs.json`
- **분석 데이터**: `assets/data/analytics.json`
- **릴리즈 노트**: `assets/data/release_notes.json`

## 📊 API 엔드포인트 분석

### GET 엔드포인트
- `/api/data` - 전체 데이터 조회
- `/api/stores` - 가게 목록
- `/api/stores/{id}` - 특정 가게 정보
- `/api/settings?storeId={id}` - 가게 설정
- `/api/current-store` - 현재 선택된 가게
- `/api/users/{id}` - 사용자 정보
- `/api/superadmin/info` - 슈퍼어드민 정보
- `/api/activity-logs` - 활동 로그 (페이지네이션)
- `/api/release-notes` - 릴리즈 노트
- `/api/subdomain/check` - 서브도메인 중복 체크
- `/api/stores/bulk-export` - 가게 데이터 내보내기 (JSON/CSV)

### POST 엔드포인트
- `/api/stores` - 가게 생성
- `/api/stores/{id}/pause` - 가게 중지
- `/api/stores/{id}/resume` - 가게 재개
- `/api/stores/{id}/subdomain` - 서브도메인 설정
- `/api/settings?storeId={id}` - 설정 저장
- `/api/current-store` - 현재 가게 설정
- `/api/superadmin/update` - 슈퍼어드민 정보 수정
- `/api/activity-logs` - 활동 로그 추가
- `/api/ai/generate-content` - AI 콘텐츠 생성
- `/api/qr/generate` - QR 코드 생성

### PUT/DELETE 엔드포인트
- `/api/stores/{id}` - 가게 정보 수정/삭제
- `/api/qr/{storeId}` - QR 코드 삭제

## 🚀 마이그레이션 단계별 계획

### Phase 1: 인프라 구축 및 데이터베이스 설계 (2주)

#### 1.1 모노레포 구조 생성
```
pickup-monorepo/
├── apps/
│   ├── api/                 # NestJS 백엔드
│   ├── web/                 # Next.js 프론트엔드 (가게 페이지)
│   └── admin/               # Next.js 어드민
├── packages/
│   ├── database/            # Prisma 스키마 및 마이그레이션
│   ├── shared/              # 공통 타입 및 유틸리티
│   └── ui/                  # 공통 UI 컴포넌트
├── tools/
│   └── migration/           # 데이터 마이그레이션 스크립트
└── docs/
```

#### 1.2 데이터베이스 스키마 설계
```sql
-- 가게 테이블
CREATE TABLE stores (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subtitle TEXT,
  phone VARCHAR(50),
  address TEXT,
  status VARCHAR(20) DEFAULT 'active',
  subdomain VARCHAR(100) UNIQUE,
  subdomain_status VARCHAR(20),
  order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  last_modified TIMESTAMP DEFAULT NOW(),
  paused_at TIMESTAMP
);

-- 가게 설정 테이블
CREATE TABLE store_settings (
  id SERIAL PRIMARY KEY,
  store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
  basic JSONB,
  discount JSONB,
  delivery JSONB,
  pickup JSONB,
  images JSONB,
  business_hours JSONB,
  section_order JSONB,
  qr_code JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 슈퍼어드민 테이블
CREATE TABLE superadmin (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_modified TIMESTAMP DEFAULT NOW()
);

-- 활동 로그 테이블
CREATE TABLE activity_logs (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  user_id VARCHAR(255),
  user_name VARCHAR(255),
  target_type VARCHAR(50),
  target_id VARCHAR(255),
  target_name VARCHAR(255),
  details JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- 분석 데이터 테이블
CREATE TABLE analytics (
  id SERIAL PRIMARY KEY,
  site_visits JSONB,
  store_visits JSONB,
  phone_clicks JSONB,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- 릴리즈 노트 테이블
CREATE TABLE release_notes (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  codename VARCHAR(255),
  release_date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  highlights JSONB,
  features JSONB,
  bug_fixes JSONB,
  technical_improvements JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 1.3 NestJS 백엔드 기본 구조
- **모듈**: StoresModule, SettingsModule, AuthModule, ActivityLogsModule, AnalyticsModule
- **서비스**: 각 모듈별 비즈니스 로직
- **컨트롤러**: 기존 API 엔드포인트와 100% 동일한 인터페이스
- **DTO**: 요청/응답 검증 및 변환
- **가드**: 인증/인가 (슈퍼어드민)

#### 1.4 Next.js 프론트엔드 구조
- **가게 페이지**: `apps/web/` - 기존 `store.html` 기능 재현
- **어드민**: `apps/admin/` - 기존 `admin/dashboard.html` 기능 재현
- **공통 컴포넌트**: `packages/ui/` - 재사용 가능한 UI 컴포넌트

#### 완료 조건 (AC)
- [ ] 모노레포 구조 생성 완료
- [ ] PostgreSQL 데이터베이스 스키마 생성
- [ ] Prisma ORM 설정 및 마이그레이션
- [ ] NestJS 기본 구조 및 모듈 생성
- [ ] Next.js 앱 기본 구조 생성
- [ ] 기존 API 엔드포인트 스펙 문서화

### Phase 2: 데이터 마이그레이션 및 API 구현 (3주)

#### 2.1 데이터 마이그레이션 스크립트
```typescript
// tools/migration/migrate-data.ts
export class DataMigrator {
  async migrateStores(): Promise<void> {
    // JSON 파일 → PostgreSQL 마이그레이션
  }
  
  async migrateSettings(): Promise<void> {
    // 가게 설정 데이터 마이그레이션
  }
  
  async migrateActivityLogs(): Promise<void> {
    // 활동 로그 마이그레이션
  }
}
```

#### 2.2 NestJS API 구현
- **StoresController**: 가게 CRUD, 서브도메인 관리
- **SettingsController**: 가게 설정 관리
- **ActivityLogsController**: 활동 로그 관리
- **AuthController**: 슈퍼어드민 인증
- **AnalyticsController**: 분석 데이터 관리
- **QRController**: QR 코드 생성/관리
- **AIController**: AI 콘텐츠 생성

#### 2.3 API 호환성 보장
- **응답 형식**: 기존과 100% 동일한 JSON 구조
- **에러 처리**: 동일한 HTTP 상태 코드 및 에러 메시지
- **쿼리 파라미터**: 기존 파라미터명 및 형식 유지
- **헤더**: CORS, Content-Type 등 기존 헤더 유지

#### 완료 조건 (AC)
- [ ] 모든 JSON 데이터 PostgreSQL 마이그레이션 완료
- [ ] 모든 API 엔드포인트 구현 및 테스트
- [ ] 기존 API와 100% 호환성 검증
- [ ] 데이터 무결성 검증
- [ ] 성능 테스트 (응답 시간 < 200ms)

### Phase 3: 프론트엔드 마이그레이션 (3주)

#### 3.1 가게 페이지 (Next.js)
- **페이지**: `apps/web/pages/store/[storeId].tsx`
- **기능**: 
  - 반응형 모바일 최적화
  - 영업시간 실시간 표시
  - 픽업 안내 모달
  - 배달앱 연동
  - QR 코드 표시
  - 지도 연동 (네이버지도, T맵)

#### 3.2 어드민 페이지 (Next.js)
- **페이지**: `apps/admin/pages/dashboard.tsx`
- **기능**:
  - 가게 관리 (CRUD)
  - 설정 관리 (할인, 배달, 픽업, 영업시간)
  - 이미지 업로드
  - QR 코드 생성/관리
  - 활동 로그 조회
  - 대량 관리 기능
  - 슈퍼어드민 관리

#### 3.3 공통 컴포넌트
- **UI 컴포넌트**: 버튼, 모달, 폼, 테이블 등
- **유틸리티**: API 클라이언트, 유효성 검사, 날짜 처리
- **훅**: 데이터 페칭, 상태 관리

#### 완료 조건 (AC)
- [ ] 가게 페이지 모든 기능 구현 및 테스트
- [ ] 어드민 페이지 모든 기능 구현 및 테스트
- [ ] 모바일 반응형 최적화
- [ ] 기존 UI/UX와 100% 동일한 사용자 경험
- [ ] 브라우저 호환성 테스트 (Chrome, Safari, Firefox)

### Phase 4: 배포 및 모니터링 (2주)

#### 4.1 배포 환경 구성
- **Railway**: NestJS API 서버 배포
- **Vercel**: Next.js 프론트엔드/어드민 배포
- **PostgreSQL**: Railway 또는 Supabase
- **도메인**: 기존 도메인 유지, 서브도메인 라우팅

#### 4.2 모니터링 및 로깅
- **API 모니터링**: 응답 시간, 에러율, 처리량
- **데이터베이스 모니터링**: 연결 수, 쿼리 성능
- **프론트엔드 모니터링**: 페이지 로드 시간, 사용자 행동
- **로그 관리**: 구조화된 로그 수집 및 분석

#### 4.3 점진적 전환
- **A/B 테스트**: 기존 시스템과 새 시스템 병렬 운영
- **트래픽 분할**: 점진적으로 새 시스템으로 트래픽 이동
- **롤백 계획**: 문제 발생 시 즉시 기존 시스템으로 복구

#### 완료 조건 (AC)
- [ ] 프로덕션 환경 배포 완료
- [ ] 모니터링 시스템 구축
- [ ] 성능 지표 측정 및 최적화
- [ ] 사용자 테스트 및 피드백 수집
- [ ] 기존 시스템 완전 대체

## 🛡️ 리스크 관리 및 롤백 전략

### 주요 리스크
1. **데이터 손실**: 마이그레이션 중 데이터 불일치
2. **성능 저하**: 새로운 시스템의 성능 문제
3. **호환성 문제**: 기존 API와의 미세한 차이
4. **사용자 경험 저하**: UI/UX 변경으로 인한 혼란

### 완화 방안
1. **데이터 백업**: 마이그레이션 전 전체 데이터 백업
2. **단계별 검증**: 각 단계별 철저한 테스트
3. **A/B 테스트**: 기존 시스템과 병렬 운영
4. **모니터링**: 실시간 성능 및 에러 모니터링

### 롤백 계획
1. **즉시 롤백**: 문제 발생 시 5분 내 기존 시스템으로 전환
2. **데이터 복구**: 백업 데이터를 이용한 즉시 복구
3. **사용자 알림**: 롤백 시 사용자에게 공지
4. **문제 분석**: 롤백 후 근본 원인 분석 및 수정

## 🧪 테스트 전략

### 단위 테스트
- **백엔드**: 각 서비스, 컨트롤러, 유틸리티 함수
- **프론트엔드**: 각 컴포넌트, 훅, 유틸리티 함수
- **커버리지**: 최소 80% 이상

### 통합 테스트
- **API 테스트**: 모든 엔드포인트 요청/응답 검증
- **데이터베이스 테스트**: CRUD 작업 및 트랜잭션 검증
- **인증 테스트**: 슈퍼어드민 로그인/로그아웃

### E2E 테스트
- **가게 페이지**: 사용자 시나리오 전체 테스트
- **어드민 페이지**: 관리자 작업 플로우 테스트
- **모바일 테스트**: 다양한 디바이스에서의 동작 검증

### 성능 테스트
- **부하 테스트**: 동시 사용자 1000명 시뮬레이션
- **응답 시간**: API 응답 시간 < 200ms
- **메모리 사용량**: 서버 메모리 사용량 모니터링

## 📈 성능 개선 예상 효과

### 현재 시스템 병목
1. **동기 파일 I/O**: JSON 파일 읽기/쓰기로 인한 블로킹
2. **메모리 사용량**: 전체 데이터를 메모리에 로드
3. **확장성 제한**: 단일 서버로 인한 확장성 제약
4. **데이터 일관성**: 파일 락으로 인한 동시성 문제

### 개선 후 예상 효과
1. **응답 시간**: 500ms → 100ms (80% 개선)
2. **동시 처리**: 10명 → 1000명 (100배 개선)
3. **메모리 사용량**: 50% 감소
4. **데이터 일관성**: ACID 트랜잭션으로 완전 보장
5. **확장성**: 수평적 확장 가능

## 🔧 기술 스택 상세

### 백엔드 (NestJS)
- **프레임워크**: NestJS 10.x
- **ORM**: Prisma 5.x
- **데이터베이스**: PostgreSQL 15+
- **인증**: JWT + Passport
- **파일 업로드**: Multer
- **QR 생성**: qrcode + sharp
- **AI 연동**: OpenAI API

### 프론트엔드 (Next.js)
- **프레임워크**: Next.js 14.x
- **스타일링**: Tailwind CSS
- **상태 관리**: Zustand
- **API 클라이언트**: Axios
- **지도**: 네이버지도 API
- **UI 컴포넌트**: Radix UI

### 인프라
- **배포**: Railway (API), Vercel (Frontend)
- **데이터베이스**: PostgreSQL (Railway/Supabase)
- **모니터링**: Sentry, LogRocket
- **CDN**: Vercel Edge Network

## 📅 일정표

| 단계 | 기간 | 주요 작업 | 완료 기준 |
|------|------|-----------|-----------|
| Phase 1 | 2주 | 인프라 구축, DB 설계 | 스키마 생성, 기본 구조 완성 |
| Phase 2 | 3주 | 데이터 마이그레이션, API 구현 | 모든 API 구현, 호환성 검증 |
| Phase 3 | 3주 | 프론트엔드 마이그레이션 | UI/UX 완성, 기능 테스트 |
| Phase 4 | 2주 | 배포, 모니터링, 전환 | 프로덕션 배포, 기존 시스템 대체 |

**총 예상 기간: 10주 (2.5개월)**

## 🎯 성공 지표

### 기술적 지표
- [ ] API 응답 시간 < 200ms
- [ ] 99.9% 가용성
- [ ] 데이터 일관성 100%
- [ ] 테스트 커버리지 > 80%

### 비즈니스 지표
- [ ] 사용자 경험 개선 (설문조사 점수)
- [ ] 관리자 작업 효율성 향상
- [ ] 시스템 안정성 향상 (에러율 감소)
- [ ] 개발 생산성 향상 (배포 시간 단축)

## 📝 결론

이 마이그레이션 계획은 기존 서비스의 안정성을 최우선으로 하면서, 현대적인 기술 스택으로의 전환을 통해 성능과 확장성을 크게 향상시킬 것입니다. 점진적 접근 방식을 통해 리스크를 최소화하고, 철저한 테스트와 모니터링을 통해 성공적인 전환을 보장할 것입니다.

각 단계별로 명확한 완료 조건을 설정하여 진행 상황을 추적하고, 문제 발생 시 즉시 대응할 수 있는 체계적인 관리 체계를 구축할 예정입니다.
