# PR: 터보레포 모노레포 안전 골격 생성

## 📋 요약

기존 서비스의 동작을 100% 유지하면서 터보레포 모노레포 구조를 구축했습니다. 이 단계에서는 안전 골격만 생성하여 기존 기능을 절대 깨뜨리지 않습니다.

## 🎯 목표

- 기존 서비스 동작/응답포맷/라우트 구조 100% 유지
- 점진적 마이그레이션을 위한 안전한 기반 구축
- DATA_BACKEND 플래그로 JSON/Postgres 전환 지원

## 🏗️ 주요 변경사항

### 1. 터보레포 모노레포 구조
```
pickup/
├── apps/                    # 애플리케이션들
│   ├── api/                 # NestJS 10 API 서버
│   ├── admin/               # Next.js 15 어드민 패널
│   └── storefront/          # Next.js 15 가게페이지
├── packages/                # 공용 패키지들
│   ├── db/                  # Prisma 스키마 및 클라이언트
│   └── shared/              # 공용 타입 및 유틸리티
└── scripts/                 # 마이그레이션 및 유틸리티
```

### 2. 데이터 소스 어댑터 패턴
- **JSON 어댑터**: 기존 JSON 파일 읽기 전용 (기본값)
- **PostgreSQL 어댑터**: Prisma 기반 완전한 CRUD
- **DATA_BACKEND 환경변수**로 런타임 전환

### 3. 기존 API 호환 레이어
- `apps/api/src/compat/` 하위에 1:1 엔드포인트 대응
- route-manifest.json의 모든 라우트 구현
- 기존 응답 포맷 100% 유지

### 4. NestJS API 서버
- NestJS 10 + Prisma + Pino 로깅
- Helmet 보안 헤더 + CORS 설정
- `/healthz` 헬스체크 엔드포인트
- OpenAI 서비스 모듈 준비

### 5. Next.js 앱들
- **어드민**: Next.js 15 App Router 기본 셋
- **가게페이지**: Next.js 15 기본 셋
- 기존 기능은 다음 단계에서 마이그레이션

## 🔧 기술 스택

### 백엔드
- **NestJS 10**: API 서버 프레임워크
- **Prisma**: ORM 및 데이터베이스 클라이언트
- **PostgreSQL**: 메인 데이터베이스
- **Pino**: 구조화된 로깅

### 프론트엔드
- **Next.js 15**: App Router 기반
- **TypeScript**: 타입 안전성
- **Tailwind CSS**: 유틸리티 CSS

### 개발 도구
- **Turbo**: 모노레포 빌드 시스템
- **Docker Compose**: 로컬 PostgreSQL
- **ESLint + Prettier**: 코드 품질

## 🛡️ 안전성 보장

### 1. 기존 동작 유지
- 기존 API 서버는 그대로 유지
- JSON 모드가 기본값으로 설정
- 기존 라우트와 100% 호환

### 2. 점진적 마이그레이션
- Phase 1: 안전 골격 생성 (현재)
- Phase 2: 기능별 점진적 마이그레이션
- Phase 3: 듀얼라이트 및 완전 전환
- Phase 4: 최적화 및 정리

### 3. 롤백 전략
- 기존 서버는 그대로 유지
- 문제 발생 시 즉시 기존 서버로 전환 가능
- 데이터 손실 없음

## 📊 성능 최적화

### 1. 데이터베이스
- Neon 무료 티어 지원
- pgbouncer 연결 풀링
- 인덱스 최적화

### 2. 캐싱
- Redis 지원 (선택사항)
- 메모리 캐싱
- CDN 준비

### 3. 모니터링
- 구조화된 로깅
- 헬스체크 엔드포인트
- 404 체커 스크립트

## 🚀 사용법

### 개발 환경 설정
```bash
# 의존성 설치
npm install

# 개발 환경 설정
npm run setup:dev

# 개발 서버 시작
npm run dev
```

### 데이터베이스 설정
```bash
# PostgreSQL 시작
docker-compose up -d postgres

# 데이터 마이그레이션
npm run migrate:data
```

## 📋 체크리스트

- [x] 터보레포 모노레포 구조 생성
- [x] NestJS API 서버 기본 설정
- [x] Next.js 앱들 기본 설정
- [x] Prisma 스키마 및 클라이언트
- [x] 데이터 소스 어댑터 패턴
- [x] 기존 API 호환 레이어
- [x] OpenAI 서비스 모듈
- [x] 상시 404 체커 스크립트
- [x] PostgreSQL Docker Compose
- [x] 마이그레이션 스크립트들
- [x] 문서화 및 README

## 🔄 다음 단계

1. **Phase 2**: 기능별 점진적 마이그레이션
2. **Phase 3**: 듀얼라이트 및 완전 전환
3. **Phase 4**: 최적화 및 정리

## ⚠️ 주의사항

- 이 PR은 안전 골격만 생성합니다
- 기존 기능은 절대 변경되지 않습니다
- 기존 서버는 그대로 유지됩니다
- 문제 발생 시 즉시 롤백 가능합니다

## 🧪 테스트

- [x] 기존 API 호환성 확인
- [x] 헬스체크 엔드포인트 테스트
- [x] 데이터 어댑터 동작 확인
- [x] 404 체커 스크립트 테스트

## 📚 관련 문서

- [마이그레이션 계획서](./plan.md)
- [라우트 매니페스트](./route-manifest.json)
- [환경변수 가이드](./env-keys.md)
- [성능 감사 보고서](./perf-audit.md)

---

**Co-authored-by: DOCORE**
