# 환경변수 키 목록

## 📋 개요

픽업 서비스 마이그레이션을 위해 필요한 환경변수 키 목록입니다. 실제 값은 보안상 문서에 포함하지 않습니다.

## 🔧 현재 시스템 환경변수

### OpenAI API 연동
```bash
# OpenAI API 키 (AI 콘텐츠 생성용)
OPENAI_API_KEY=sk-...

# OpenAI API 기본 설정
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7
```

### 서버 설정
```bash
# 서버 포트 (개발 환경)
PORT=8081

# 서버 호스트
HOST=0.0.0.0

# 환경 구분
NODE_ENV=development|production
```

### 파일 경로 설정
```bash
# 데이터 파일 경로
DATA_FILE_PATH=assets/data/data.json
ACTIVITY_LOGS_PATH=assets/data/activity_logs.json
ANALYTICS_PATH=assets/data/analytics.json
RELEASE_NOTES_PATH=assets/data/release_notes.json

# 이미지 업로드 경로
UPLOAD_PATH=assets/images/uploads
QR_CODES_PATH=assets/images/qrcodes
```

## 🚀 마이그레이션 후 환경변수

### 데이터베이스 설정
```bash
# PostgreSQL 연결 정보
DATABASE_URL=postgresql://username:password@host:port/database_name

# Prisma 설정
PRISMA_DATABASE_URL=postgresql://username:password@host:port/database_name
PRISMA_SHADOW_DATABASE_URL=postgresql://username:password@host:port/database_name_shadow

# 데이터베이스 연결 풀 설정
DATABASE_POOL_SIZE=10
DATABASE_POOL_TIMEOUT=30000
DATABASE_POOL_IDLE_TIMEOUT=30000
```

### NestJS 백엔드 설정
```bash
# 서버 설정
API_PORT=3001
API_HOST=0.0.0.0
API_PREFIX=api

# JWT 설정
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d

# CORS 설정
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
CORS_CREDENTIALS=true

# 파일 업로드 설정
MAX_FILE_SIZE=10485760  # 10MB
UPLOAD_DEST=uploads
```

### Next.js 프론트엔드 설정
```bash
# Next.js 설정
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3001

# 환경 구분
NODE_ENV=development|production
NEXT_PUBLIC_NODE_ENV=development|production
```

### 어드민 설정
```bash
# 어드민 설정
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:3001/api
NEXT_PUBLIC_ADMIN_APP_URL=http://localhost:3001

# 인증 설정
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=your-nextauth-secret-key
```

### 외부 API 연동
```bash
# OpenAI API (기존 유지)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7

# 네이버지도 API
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your-naver-map-client-id
NEXT_PUBLIC_NAVER_MAP_CLIENT_SECRET=your-naver-map-client-secret

# T맵 API (선택사항)
NEXT_PUBLIC_TMAP_API_KEY=your-tmap-api-key
```

### Redis 설정 (캐싱용)
```bash
# Redis 연결 정보
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0

# 캐시 설정
CACHE_TTL=300  # 5분
CACHE_MAX_SIZE=1000
```

### 모니터링 및 로깅
```bash
# Sentry 설정
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-sentry-auth-token

# LogRocket 설정
NEXT_PUBLIC_LOGROCKET_APP_ID=your-logrocket-app-id

# 로그 레벨
LOG_LEVEL=info|debug|warn|error
```

### 배포 환경별 설정

#### Railway 배포
```bash
# Railway 자동 설정
RAILWAY_STATIC_URL=your-railway-static-url
RAILWAY_PUBLIC_DOMAIN=your-railway-domain

# PostgreSQL (Railway 제공)
DATABASE_URL=postgresql://postgres:password@containers-us-west-xxx.railway.app:port/railway
```

#### Vercel 배포
```bash
# Vercel 자동 설정
VERCEL_URL=your-vercel-url
VERCEL_ENV=production|preview|development

# 환경변수는 Vercel 대시보드에서 설정
```

#### Supabase (PostgreSQL 대안)
```bash
# Supabase 연결 정보
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 보안 설정
```bash
# 암호화 키
ENCRYPTION_KEY=your-32-character-encryption-key
HASH_SALT_ROUNDS=12

# API 보안
API_RATE_LIMIT=100
API_RATE_WINDOW=900000  # 15분

# 세션 설정
SESSION_SECRET=your-session-secret-key
SESSION_MAX_AGE=86400000  # 24시간
```

### 개발 도구 설정
```bash
# 개발 모드 설정
DEBUG=pickup:*
NODE_OPTIONS=--max-old-space-size=4096

# 테스트 설정
TEST_DATABASE_URL=postgresql://username:password@localhost:5432/pickup_test
TEST_REDIS_URL=redis://localhost:6379/1

# 코드 품질 도구
ESLINT_NO_DEV_ERRORS=true
TSC_COMPILE_ON_ERROR=true
```

### 기능 플래그
```bash
# 기능 토글
FEATURE_AI_CONTENT_GENERATION=true
FEATURE_QR_CODE_GENERATION=true
FEATURE_ANALYTICS=true
FEATURE_BULK_MANAGEMENT=true
FEATURE_SUBDOMAIN_SUPPORT=true

# 실험적 기능
EXPERIMENTAL_REAL_TIME_UPDATES=false
EXPERIMENTAL_ADVANCED_ANALYTICS=false
```

### 이메일 설정 (향후 확장용)
```bash
# SMTP 설정
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@pickup.com

# 이메일 템플릿
EMAIL_TEMPLATE_PATH=emails/templates
```

### 푸시 알림 설정 (향후 확장용)
```bash
# Firebase 설정
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email

# FCM 설정
FCM_SERVER_KEY=your-fcm-server-key
```

## 🔐 보안 고려사항

### 민감한 정보
- **절대 커밋하지 말 것**: `.env` 파일, 실제 API 키, 비밀번호
- **환경별 분리**: 개발, 스테이징, 프로덕션 환경별로 다른 키 사용
- **정기적 로테이션**: API 키와 비밀번호 정기적 변경
- **최소 권한 원칙**: 필요한 최소한의 권한만 부여

### 권장 보안 설정
```bash
# 프로덕션 환경
NODE_ENV=production
LOG_LEVEL=warn
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com

# 개발 환경
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

## 📝 환경변수 관리 도구

### 권장 도구
1. **dotenv**: 로컬 개발용
2. **Railway**: 프로덕션 환경변수 관리
3. **Vercel**: 프론트엔드 환경변수 관리
4. **HashiCorp Vault**: 엔터프라이즈급 시크릿 관리

### 설정 파일 예시
```bash
# .env.local (로컬 개발용)
DATABASE_URL=postgresql://localhost:5432/pickup_dev
OPENAI_API_KEY=sk-your-dev-key
JWT_SECRET=dev-secret-key

# .env.production (프로덕션용)
DATABASE_URL=postgresql://prod-server:5432/pickup_prod
OPENAI_API_KEY=sk-your-prod-key
JWT_SECRET=prod-secret-key
```

## 🚀 마이그레이션 체크리스트

### Phase 1: 인프라 구축
- [ ] PostgreSQL 데이터베이스 생성
- [ ] Redis 인스턴스 설정 (선택사항)
- [ ] 환경변수 파일 생성 (.env.example)
- [ ] 보안 키 생성 및 설정

### Phase 2: API 구현
- [ ] NestJS 환경변수 설정
- [ ] Prisma 데이터베이스 연결 설정
- [ ] JWT 인증 설정
- [ ] CORS 설정

### Phase 3: 프론트엔드 구현
- [ ] Next.js 환경변수 설정
- [ ] API 클라이언트 설정
- [ ] 외부 API 연동 설정

### Phase 4: 배포
- [ ] Railway 환경변수 설정
- [ ] Vercel 환경변수 설정
- [ ] 도메인 및 SSL 설정
- [ ] 모니터링 도구 설정

## 📚 참고 자료

- [NestJS 환경변수 설정](https://docs.nestjs.com/techniques/configuration)
- [Next.js 환경변수](https://nextjs.org/docs/basic-features/environment-variables)
- [Prisma 환경변수](https://www.prisma.io/docs/reference/database-reference/connection-urls)
- [Railway 환경변수](https://docs.railway.app/guides/environment-variables)
- [Vercel 환경변수](https://vercel.com/docs/concepts/projects/environment-variables)
