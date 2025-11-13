# 배포 가이드

## 📋 개요

이 가이드는 픽업 서비스를 Railway, Neon, 로컬 환경에서 완전 동일하게 배포하는 방법을 설명합니다. 모든 환경에서 동일한 설정과 성능을 보장합니다.

## 🎯 배포 환경

### 1. 로컬 개발 환경
- **데이터베이스**: Docker Compose PostgreSQL
- **캐시**: 로컬 Redis (선택사항)
- **API**: NestJS (포트 3001)

### 2. 스테이징 환경
- **데이터베이스**: Neon PostgreSQL
- **캐시**: Upstash Redis
- **API**: Railway (스테이징)

### 3. 프로덕션 환경
- **데이터베이스**: Neon PostgreSQL
- **캐시**: Upstash Redis
- **API**: Railway (프로덕션)

## 🚀 배포 단계

### 1단계: 환경 준비

#### 1.1 저장소 클론
```bash
git clone https://github.com/DoCoreTeam/pickup.git
cd pickup
git checkout refactor/030-deploy-and-perf
```

#### 1.2 의존성 설치
```bash
npm install
```

#### 1.3 환경변수 설정
```bash
cp env.example .env.local
# .env.local 파일 편집
```

### 2단계: 데이터베이스 설정

#### 2.1 Neon PostgreSQL 설정
1. [Neon Console](https://console.neon.tech) 접속
2. 새 프로젝트 생성
3. 데이터베이스 URL 복사
4. `.env.local`에 `DATABASE_URL` 설정

```bash
# Neon 데이터베이스 URL 예시
DATABASE_URL="postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

#### 2.2 로컬 PostgreSQL 설정 (선택사항)
```bash
# Docker Compose로 PostgreSQL 시작
docker compose up -d postgres

# 로컬 데이터베이스 URL
DATABASE_URL="postgresql://pickup_user:pickup_password@localhost:5432/pickup_dev?pgbouncer=true&connection_limit=1"
```

#### 2.3 데이터베이스 마이그레이션
```bash
# Prisma 클라이언트 생성
npm run db:generate

# 데이터베이스 스키마 적용
npm run db:push

# 시드 데이터 생성
npm run db:seed
```

### 3단계: Redis 설정 (선택사항)

#### 3.1 Upstash Redis 설정
1. [Upstash Console](https://console.upstash.com) 접속
2. 새 데이터베이스 생성
3. Redis URL 복사
4. `.env.local`에 `REDIS_URL` 설정

```bash
# Upstash Redis URL 예시
REDIS_URL="redis://default:password@ep-xxx.upstash.io:6379"
```

#### 3.2 로컬 Redis 설정 (선택사항)
```bash
# Docker로 Redis 시작
docker run -d -p 6379:6379 redis:alpine

# 로컬 Redis URL
REDIS_URL="redis://localhost:6379"
```

### 4단계: Railway 배포

#### 4.1 Railway 프로젝트 생성
1. [Railway Console](https://railway.app) 접속
2. 새 프로젝트 생성
3. GitHub 저장소 연결

#### 4.2 환경변수 설정
Railway 대시보드에서 다음 환경변수 설정:

```bash
# 필수 환경변수
NODE_ENV=production
PORT=3001
DATA_BACKEND=postgres
DUAL_WRITE=false
DATABASE_URL=your_neon_database_url
OPENAI_API_KEY=your_openai_api_key

# 선택적 환경변수
REDIS_URL=your_upstash_redis_url
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=info
```

#### 4.3 배포 설정
Railway에서 다음 설정 적용:

- **Build Command**: `npm run build`
- **Start Command**: `npm run start:prod`
- **Health Check Path**: `/healthz`
- **Health Check Timeout**: 300초

#### 4.4 배포 실행
```bash
# Railway CLI로 배포
railway login
railway link
railway up

# 또는 GitHub 푸시로 자동 배포
git push origin main
```

### 5단계: 배포 검증

#### 5.1 헬스체크 확인
```bash
# API 서버 상태 확인
curl https://your-app.railway.app/healthz

# 응답 예시
{
  "status": "ok",
  "info": {
    "database": {"status": "up"},
    "memory_heap": {"status": "up"},
    "memory_rss": {"status": "up"}
  },
  "error": {},
  "details": {
    "database": {"status": "up"},
    "memory_heap": {"status": "up"},
    "memory_rss": {"status": "up"}
  }
}
```

#### 5.2 API 엔드포인트 테스트
```bash
# 가게 목록 조회
curl https://your-app.railway.app/api/stores

# 현재 가게 조회
curl https://your-app.railway.app/api/current-store

# 헬스체크
curl https://your-app.railway.app/healthz
```

#### 5.3 성능 테스트
```bash
# 응답 시간 테스트
curl -w "@curl-format.txt" -o /dev/null -s https://your-app.railway.app/api/stores

# Rate Limiting 테스트
for i in {1..10}; do curl https://your-app.railway.app/api/stores; done
```

## 🔧 환경별 설정

### 로컬 개발 환경
```bash
NODE_ENV=development
PORT=3001
DATA_BACKEND=json
DUAL_WRITE=false
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=debug
```

### 스테이징 환경
```bash
NODE_ENV=production
PORT=3001
DATA_BACKEND=postgres
DUAL_WRITE=true
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=debug
RATE_LIMIT_MAX=50
```

### 프로덕션 환경
```bash
NODE_ENV=production
PORT=3001
DATA_BACKEND=postgres
DUAL_WRITE=false
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=info
RATE_LIMIT_MAX=100
```

## 📊 모니터링

### 1. Railway 대시보드
- **메트릭**: CPU, 메모리, 네트워크 사용량
- **로그**: 실시간 애플리케이션 로그
- **배포**: 배포 히스토리 및 상태

### 2. Neon 대시보드
- **쿼리**: 데이터베이스 쿼리 성능
- **연결**: 활성 연결 수
- **스토리지**: 데이터베이스 크기

### 3. Upstash 대시보드 (선택사항)
- **캐시**: 히트율, 미스율
- **메모리**: Redis 메모리 사용량
- **연결**: 활성 연결 수

## 🚨 문제 해결

### 1. 배포 실패
```bash
# 로그 확인
railway logs

# 환경변수 확인
railway variables

# 재배포
railway redeploy
```

### 2. 데이터베이스 연결 실패
```bash
# 연결 테스트
npm run db:status

# 마이그레이션 재실행
npm run db:push
```

### 3. Redis 연결 실패
```bash
# Redis 상태 확인
curl https://your-app.railway.app/api/cache/stats

# 캐시 비활성화
# REDIS_URL 환경변수 제거
```

### 4. Rate Limiting 문제
```bash
# Rate Limiting 설정 확인
curl -I https://your-app.railway.app/api/stores

# 설정 조정
# RATE_LIMIT_MAX 환경변수 수정
```

## 🔄 롤백 전략

### 1. Railway 롤백
```bash
# 이전 배포로 롤백
railway rollback

# 특정 커밋으로 롤백
railway rollback <commit-hash>
```

### 2. 데이터베이스 롤백
```bash
# 마이그레이션 롤백
npm run db:migrate:rollback

# 데이터베이스 복원
# Neon 백업에서 복원
```

### 3. 환경변수 롤백
```bash
# 이전 환경변수로 복원
railway variables --set DATA_BACKEND=json
```

## 📈 성능 최적화

### 1. 데이터베이스 최적화
- **인덱스**: 자주 사용되는 쿼리에 인덱스 추가
- **연결 풀**: Prisma 연결 풀 설정
- **쿼리 최적화**: N+1 쿼리 방지

### 2. 캐시 최적화
- **TTL 설정**: 데이터 특성에 맞는 TTL 설정
- **캐시 키**: 의미있는 캐시 키 사용
- **캐시 무효화**: 데이터 변경 시 캐시 무효화

### 3. API 최적화
- **압축**: gzip 압축 활성화
- **Rate Limiting**: 적절한 요청 제한
- **서킷 브레이커**: 외부 API 호출 보호

## 🔐 보안 설정

### 1. 환경변수 보안
- **민감 정보**: Railway Secrets 사용
- **접근 제한**: 필요한 환경변수만 노출
- **암호화**: 프로덕션 환경에서 암호화

### 2. API 보안
- **CORS**: 적절한 Origin 설정
- **Rate Limiting**: DDoS 공격 방지
- **Helmet**: 보안 헤더 설정

### 3. 데이터베이스 보안
- **SSL**: 데이터베이스 연결 암호화
- **접근 제한**: IP 화이트리스트 설정
- **백업**: 정기적인 데이터 백업

## 📚 관련 문서

- [마이그레이션 가이드](./MIGRATION_GUIDE.md)
- [환경변수 가이드](./env-keys.md)
- [성능 감사 보고서](./perf-audit.md)
- [Railway 문서](https://docs.railway.app)
- [Neon 문서](https://neon.tech/docs)
- [Upstash 문서](https://docs.upstash.com)

---

**작성자**: DOCORE  
**최종 업데이트**: 2025-01-01
