# 픽업 서비스 모노레포

픽업 서비스의 NestJS + Next.js 기반 모노레포 구조입니다.

## 🏗️ 프로젝트 구조

```
pickup/
├── apps/                    # 애플리케이션들
│   ├── api/                 # NestJS API 서버
│   ├── admin/               # Next.js 어드민 패널
│   └── storefront/          # Next.js 가게페이지
├── packages/                # 공용 패키지들
│   ├── db/                  # Prisma 스키마 및 클라이언트
│   └── shared/              # 공용 타입 및 유틸리티
├── scripts/                 # 마이그레이션 및 유틸리티 스크립트
├── docs/                    # 문서
└── assets/                  # 정적 자산 (기존)
```

## 🚀 빠른 시작

### 1. 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 환경 설정 (자동)
npm run setup:dev

# 또는 수동 설정
cp .env.example .env.local
# .env.local 파일을 편집하여 환경변수 설정
```

### 2. 데이터베이스 설정

```bash
# PostgreSQL Docker 컨테이너 시작
docker-compose up -d postgres

# Prisma 클라이언트 생성
npm run db:generate

# 데이터베이스 마이그레이션
npm run db:push

# 기존 JSON 데이터 마이그레이션
npm run migrate:data
```

### 3. 개발 서버 시작

```bash
# 모든 서비스 동시 실행
npm run dev

# 또는 개별 실행
npm run dev:api        # API 서버 (포트 3001)
npm run dev:admin      # 어드민 패널 (포트 3000)
npm run dev:storefront # 가게페이지 (포트 3002)
```

## 📋 사용 가능한 스크립트

### 개발
- `npm run dev` - 모든 서비스 동시 실행
- `npm run dev:api` - API 서버만 실행
- `npm run dev:admin` - 어드민 패널만 실행
- `npm run dev:storefront` - 가게페이지만 실행

### 빌드
- `npm run build` - 모든 서비스 빌드
- `npm run build:api` - API 서버만 빌드
- `npm run build:admin` - 어드민 패널만 빌드
- `npm run build:storefront` - 가게페이지만 빌드

### 데이터베이스
- `npm run db:generate` - Prisma 클라이언트 생성
- `npm run db:push` - 데이터베이스 스키마 푸시
- `npm run db:migrate` - 데이터베이스 마이그레이션
- `npm run db:seed` - 시드 데이터 생성

### 유틸리티
- `npm run setup:dev` - 개발 환경 설정
- `npm run migrate:data` - JSON → PostgreSQL 마이그레이션
- `npm run backfill:data` - PostgreSQL → JSON 백필
- `npm run check:404` - API 라우트 404 체크

## 🔧 환경변수

### 필수 환경변수
- `NODE_ENV` - 실행 환경 (development/production)
- `DATA_BACKEND` - 데이터 백엔드 (json/postgres)
- `PORT` - API 서버 포트 (기본값: 3001)

### 선택적 환경변수
- `DATABASE_URL` - PostgreSQL 연결 URL
- `OPENAI_API_KEY` - OpenAI API 키
- `CORS_ORIGIN` - CORS 허용 오리진
- `CURRENT_STORE_ID` - 현재 선택된 가게 ID

## 🗄️ 데이터 백엔드

### JSON 모드 (기본값)
- 기존 JSON 파일 사용
- 읽기 전용 (Phase 3에서 듀얼라이트 지원 예정)
- 빠른 개발 및 테스트에 적합

### PostgreSQL 모드
- Prisma ORM 사용
- 완전한 CRUD 지원
- 프로덕션 환경에 적합

## 🏥 헬스체크

- API 서버: `http://localhost:3001/healthz`
- 어드민 패널: `http://localhost:3000`
- 가게페이지: `http://localhost:3002`

## 📚 API 문서

기존 API와 100% 호환됩니다. 자세한 내용은 `docs/route-manifest.json`을 참조하세요.

## 🔄 마이그레이션 전략

1. **Phase 1**: 기본 구조 및 어댑터 생성 (현재)
2. **Phase 2**: 기능별 점진적 마이그레이션
3. **Phase 3**: 듀얼라이트 및 완전 전환
4. **Phase 4**: 최적화 및 정리

## 🛠️ 개발 가이드

### 새로운 기능 추가
1. `packages/shared`에 타입 정의
2. `packages/db`에 데이터베이스 스키마 추가
3. `apps/api`에 API 엔드포인트 구현
4. `apps/admin` 또는 `apps/storefront`에 UI 구현

### 데이터베이스 변경
1. `packages/db/schema.prisma` 수정
2. `npm run db:push` 실행
3. 필요시 마이그레이션 스크립트 작성

## 📝 라이선스

MIT License

## 👥 기여자

- **DOCORE** - 프로젝트 설계 및 개발
