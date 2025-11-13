# 픽업 서비스 Railway 배포 가이드

## 배포 설정

### 1. Railway 프로젝트 설정
- **Builder**: NIXPACKS
- **Start Command**: `npm run start:api`
- **Node.js Version**: >=18.0.0

### 2. 환경 변수
Railway에서 자동으로 설정되는 변수:
- `PORT`: Railway가 할당하는 포트 번호 (기본값: 8081)

필수 환경 변수:
- `DB_HOST`: PostgreSQL 호스트 (Railway PostgreSQL 플러그인 사용 시 자동 설정)
- `DB_PORT`: PostgreSQL 포트 (기본값: 5432)
- `DB_NAME`: 데이터베이스 이름
- `DB_USER`: 데이터베이스 사용자
- `DB_PASSWORD`: 데이터베이스 비밀번호
- `DATA_BACKEND`: `postgres` (필수)

선택적 환경 변수:
- `NODE_ENV`: `production` (프로덕션 환경)
- `OPENAI_API_KEY`: OpenAI API 키 (AI 기능 사용 시)

### 3. 파일 구조
```
/
├── railway.json          # Railway 설정
├── Procfile             # Heroku/Railway 호환성
├── package.json         # Node.js 의존성 및 스크립트
├── Dockerfile           # Docker 빌드 설정 (선택사항)
└── src/backend/
    └── api_server.js    # 메인 API 서버 (Node.js)
```

### 4. 배포 명령어
```bash
# Railway CLI로 배포
railway up

# 또는 GitHub 연동으로 자동 배포
git push origin main
```

### 5. 문제 해결
- **포트 오류**: `PORT` 환경 변수가 올바르게 설정되었는지 확인 (기본값: 8081)
- **의존성 오류**: `npm install`이 정상적으로 실행되었는지 확인
- **DB 연결 오류**: Railway PostgreSQL 플러그인을 사용하는 경우 `DATABASE_URL` 환경 변수가 자동으로 설정됩니다
- **정적 파일 오류**: API 서버가 정적 파일을 직접 서빙하므로 별도 설정 불필요

### 6. 로그 확인
```bash
railway logs
```

## 배포 후 확인사항
1. 서버가 정상적으로 시작되는지 확인
2. API 엔드포인트가 정상 작동하는지 확인
3. 정적 파일(HTML, CSS, JS)이 정상 로드되는지 확인
