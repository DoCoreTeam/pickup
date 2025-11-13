# Railway + NEON PostgreSQL 배포 가이드

## 📋 개요

이 가이드는 픽업 서비스를 Railway에 배포하고 NEON PostgreSQL을 데이터베이스로 사용하는 방법을 설명합니다.

## 🎯 배포 아키텍처

- **배포 플랫폼**: Railway
- **데이터베이스**: NEON PostgreSQL
- **런타임**: Node.js >=18.0.0

---

## 1단계: NEON PostgreSQL 설정

### 1.1 NEON 계정 생성 및 프로젝트 생성

1. [NEON Console](https://console.neon.tech) 접속
2. 계정 생성 (GitHub 계정으로 로그인 가능)
3. 새 프로젝트 생성
4. 프로젝트 이름 입력 (예: `pickup-production`)

### 1.2 데이터베이스 연결 정보 확인

NEON 대시보드에서 다음 정보를 확인하세요:

```
Connection String 예시:
postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

또는 개별 정보:
- **Host**: `ep-xxx-xxx.us-east-1.aws.neon.tech`
- **Database**: `neondb` (또는 생성한 DB 이름)
- **User**: `username`
- **Password**: `password`
- **Port**: `5432`

### 1.3 데이터베이스 초기화

로컬에서 NEON 데이터베이스를 초기화합니다:

```bash
# NEON 연결 문자열을 환경 변수로 설정
export DATABASE_URL="postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"

# 또는 개별 환경 변수 설정
export DB_HOST="ep-xxx-xxx.us-east-1.aws.neon.tech"
export DB_PORT="5432"
export DB_NAME="neondb"
export DB_USER="username"
export DB_PASSWORD="password"

# 데이터베이스 스키마 초기화
npm run migrate:json-to-postgres
```

또는 `psql`로 직접 연결:

```bash
psql "postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" -f scripts/init-db.sql
```

---

## 2단계: Railway 프로젝트 설정

### 2.1 Railway 계정 생성 및 프로젝트 생성

1. [Railway Console](https://railway.app) 접속
2. 계정 생성 (GitHub 계정으로 로그인 가능)
3. "New Project" 클릭
4. "Deploy from GitHub repo" 선택
5. GitHub 저장소 연결

### 2.2 환경 변수 설정

Railway 대시보드에서 다음 환경 변수를 설정하세요:

#### 필수 환경 변수

```bash
# 데이터베이스 연결 (방법 1: DATABASE_URL 사용)
DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require

# 또는 개별 환경 변수 사용 (방법 2)
DB_HOST=ep-xxx-xxx.us-east-1.aws.neon.tech
DB_PORT=5432
DB_NAME=neondb
DB_USER=username
DB_PASSWORD=password

# 필수 설정
DATA_BACKEND=postgres
NODE_ENV=production
PORT=8081
```

#### 선택적 환경 변수

```bash
# OpenAI API (AI 기능 사용 시)
OPENAI_API_KEY=your_openai_api_key

# Google Generative AI (AI 기능 사용 시)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key
```

### 2.3 Railway 배포 설정 확인

Railway는 자동으로 다음을 감지합니다:
- `package.json` 파일
- `railway.json` 설정 파일
- `Procfile` (있는 경우)

현재 설정:
- **Builder**: NIXPACKS (자동 감지)
- **Start Command**: `npm run start:api` (railway.json에서 설정)

---

## 3단계: 배포 실행

### 3.1 GitHub 연동 자동 배포 (권장)

1. Railway 프로젝트에서 GitHub 저장소 연결
2. 브랜치 선택 (예: `main` 또는 `refactor/040-zero-404-ci`)
3. Railway가 자동으로 배포 시작

### 3.2 Railway CLI로 배포

```bash
# Railway CLI 설치
npm install -g @railway/cli

# Railway 로그인
railway login

# 프로젝트 연결
railway link

# 환경 변수 설정
railway variables set DB_HOST=ep-xxx-xxx.us-east-1.aws.neon.tech
railway variables set DB_PORT=5432
railway variables set DB_NAME=neondb
railway variables set DB_USER=username
railway variables set DB_PASSWORD=password
railway variables set DATA_BACKEND=postgres
railway variables set NODE_ENV=production

# 배포 실행
railway up
```

---

## 4단계: 배포 검증

### 4.1 서버 상태 확인

Railway 대시보드에서:
1. "Deployments" 탭 확인
2. 배포 상태가 "Active"인지 확인
3. 로그에서 에러 확인

### 4.2 API 엔드포인트 테스트

```bash
# Railway가 할당한 도메인 확인 (예: https://your-app.up.railway.app)
RAILWAY_URL="https://your-app.up.railway.app"

# 헬스체크
curl $RAILWAY_URL/api/healthz

# 가게 목록 조회
curl $RAILWAY_URL/api/stores

# 현재 가게 조회
curl $RAILWAY_URL/api/current-store
```

### 4.3 데이터베이스 연결 확인

Railway 로그에서 다음 메시지 확인:
```
[INFO] PostgreSQL 데이터베이스 연결이 완료되었습니다.
[INFO] API 서버가 포트 8081에서 실행 중입니다.
```

---

## 5단계: 문제 해결

### 5.1 데이터베이스 연결 실패

**증상**: 로그에 "PostgreSQL 데이터베이스 연결에 실패했습니다" 메시지

**해결 방법**:
1. NEON 대시보드에서 데이터베이스가 활성 상태인지 확인
2. Railway 환경 변수가 올바르게 설정되었는지 확인
3. NEON 연결 문자열에 `?sslmode=require`가 포함되어 있는지 확인
4. NEON IP 화이트리스트 확인 (필요시)

### 5.2 포트 오류

**증상**: "EADDRINUSE" 또는 포트 관련 오류

**해결 방법**:
1. Railway가 자동으로 할당하는 `PORT` 환경 변수 사용 확인
2. `api_server.js`에서 `process.env.PORT || 8081` 사용 확인

### 5.3 의존성 설치 실패

**증상**: 배포 중 npm install 실패

**해결 방법**:
1. `package.json`의 `engines` 필드 확인 (Node.js >=18.0.0)
2. Railway 로그에서 구체적인 에러 메시지 확인
3. 필요시 `.nvmrc` 파일 추가하여 Node.js 버전 명시

### 5.4 정적 파일 로드 실패

**증상**: HTML/CSS/JS 파일이 로드되지 않음

**해결 방법**:
1. `api_server.js`의 정적 파일 서빙 경로 확인
2. Railway에서 파일이 올바르게 복사되었는지 확인
3. `assets/` 디렉토리가 포함되어 있는지 확인

---

## 6단계: 모니터링 및 유지보수

### 6.1 로그 확인

```bash
# Railway CLI로 로그 확인
railway logs

# 또는 Railway 대시보드에서 실시간 로그 확인
```

### 6.2 데이터베이스 백업

NEON은 자동 백업을 제공하지만, 수동 백업도 가능합니다:

```bash
# pg_dump로 백업
pg_dump "postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" > backup.sql

# 복원
psql "postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" < backup.sql
```

### 6.3 환경 변수 업데이트

Railway 대시보드에서:
1. "Variables" 탭으로 이동
2. 환경 변수 추가/수정/삭제
3. 변경사항 저장 시 자동 재배포

---

## 📊 배포 체크리스트

### 배포 전
- [ ] NEON PostgreSQL 프로젝트 생성 완료
- [ ] 데이터베이스 스키마 초기화 완료
- [ ] Railway 프로젝트 생성 완료
- [ ] GitHub 저장소 연결 완료
- [ ] 환경 변수 설정 완료

### 배포 후
- [ ] Railway 배포 상태 "Active" 확인
- [ ] API 엔드포인트 정상 응답 확인
- [ ] 데이터베이스 연결 확인
- [ ] 정적 파일 로드 확인
- [ ] 관리자 페이지 접속 확인

---

## 🔗 유용한 링크

- [Railway 공식 문서](https://docs.railway.app)
- [NEON 공식 문서](https://neon.tech/docs)
- [PostgreSQL 공식 문서](https://www.postgresql.org/docs)

---

## 📝 참고사항

1. **비용**: Railway와 NEON 모두 무료 플랜을 제공하지만, 사용량에 따라 제한이 있을 수 있습니다.
2. **보안**: 프로덕션 환경에서는 환경 변수를 안전하게 관리하고, 비밀번호를 정기적으로 변경하세요.
3. **성능**: NEON은 자동 스케일링을 제공하지만, 트래픽이 많을 경우 업그레이드를 고려하세요.
4. **백업**: NEON은 자동 백업을 제공하지만, 중요한 데이터는 별도로 백업하는 것을 권장합니다.

---

**배포 완료 후**: Railway 대시보드에서 할당된 도메인을 확인하고, 해당 도메인으로 서비스에 접속할 수 있습니다.

