# Railway 환경 변수 설정 가이드

## 필수 환경 변수

Railway 대시보드에서 다음 환경 변수를 설정하세요:

```bash
# NEON PostgreSQL 연결 (방법 1: DATABASE_URL 사용 - 권장)
DATABASE_URL=postgresql://neondb_owner:npg_kaMZfu75ldXK@ep-empty-mountain-adzg7se6-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# 또는 개별 환경 변수 사용 (방법 2)
# DB_HOST=ep-empty-mountain-adzg7se6-pooler.c-2.us-east-1.aws.neon.tech
# DB_PORT=5432
# DB_NAME=neondb
# DB_USER=neondb_owner
# DB_PASSWORD=npg_kaMZfu75ldXK

# 필수 설정
DATA_BACKEND=postgres
NODE_ENV=production

# 포트 설정 (Railway가 자동 할당하므로 설정하지 않아도 됨)
# PORT=8081
```

## Railway에서 환경 변수 설정 방법

1. Railway 대시보드 접속
2. 프로젝트 선택
3. "Variables" 탭 클릭
4. "New Variable" 클릭
5. 위의 환경 변수들을 하나씩 추가

## 중요 사항

- `DATABASE_URL`에 `&channel_binding=require`가 포함되어 있습니다
- `sslmode=require`는 필수입니다 (NEON은 SSL 연결을 요구합니다)
- Railway는 `PORT` 환경 변수를 자동으로 할당하므로 설정하지 않아도 됩니다
- `NODE_ENV=production`을 설정하면 프로덕션 모드로 실행됩니다

