# Phase 3: 안전 마이그레이션 가이드

## 📋 개요

이 가이드는 JSON 파일 기반 데이터를 PostgreSQL로 안전하게 마이그레이션하는 과정을 설명합니다. 듀얼라이트를 통한 점진적 전환과 즉시 롤백이 가능한 안전한 마이그레이션을 제공합니다.

## 🎯 마이그레이션 전략

### 1. 최소 스키마 설계
- 현행 JSON 구조를 반영한 최소 스키마
- id/created_at/updated_at 표준 컬럼 추가
- 핵심 쿼리 기준 인덱스 최소화

### 2. 듀얼라이트 (옵션 기간)
- `DUAL_WRITE=true`일 때 JSON + PostgreSQL 동시 기록
- 읽기는 `DATA_BACKEND` 기준으로만
- 한 주기 동안 이중기록 성공률 100% 확인

### 3. 전환 스위치
- 스테이징에서 `DATA_BACKEND=postgres` 테스트
- 카나리 배포 (소수 트래픽만 postgres)
- 문제 없으면 전체 트래픽 postgres로 전환
- 즉시 롤백 가능 (`DATA_BACKEND=json`)

## 🚀 실행 단계

### 1단계: 환경 준비

```bash
# 1. 의존성 설치
npm install

# 2. PostgreSQL 시작
docker compose up -d postgres

# 3. 환경변수 설정
cp env.example .env.local
# .env.local 파일 편집
```

### 2단계: 데이터베이스 설정

```bash
# 1. Prisma 클라이언트 생성
npm run db:generate

# 2. 데이터베이스 마이그레이션
npm run db:push

# 3. 시드 데이터 생성
npm run db:seed
```

### 3단계: 백필 실행

```bash
# JSON에서 PostgreSQL로 데이터 백필
npm run backfill:json-to-postgres

# 백필 검증
npm run validate:migration
```

### 4단계: 듀얼라이트 테스트

```bash
# 듀얼라이트 모드 활성화
export DUAL_WRITE=true
export DATA_BACKEND=json

# 서버 시작
npm run dev

# 듀얼라이트 테스트 실행
npm run test:e2e:dual-write
```

### 5단계: 전환 실행

```bash
# 1. 스테이징 환경에서 테스트
export DATA_BACKEND=postgres
npm run test:integration

# 2. 카나리 배포 (10% 트래픽)
npm run switch:db canary:enable "X-Canary" "canary=true" 10

# 3. 전체 전환
npm run switch:db switch postgres "Full migration"

# 4. 문제 발생 시 롤백
npm run switch:db rollback "Emergency rollback"
```

## 🧪 테스트 실행

### 유닛 테스트
```bash
# 어댑터 테스트
npm run test:unit:adapter

# 모든 유닛 테스트
npm run test:unit
```

### 통합 테스트
```bash
# API 비교 테스트
npm run test:integration:api

# 모든 통합 테스트
npm run test:integration
```

### E2E 테스트
```bash
# Playwright 테스트
npm run test:e2e

# 특정 플로우 테스트
npm run test:e2e:admin
npm run test:e2e:storefront
npm run test:e2e:dual-write
```

## 📊 모니터링

### 1. 듀얼라이트 상태 확인
```bash
# 듀얼라이트 상태 조회
curl http://localhost:3001/api/dual-write/stats
```

### 2. 데이터 일관성 검증
```bash
# 마이그레이션 검증
npm run validate:migration

# 404 체크
npm run check:404
```

### 3. 성능 모니터링
```bash
# 헬스체크
curl http://localhost:3001/healthz

# API 응답 시간 비교
npm run test:integration:performance
```

## 🔧 스크립트 설명

### 백필 스크립트
- **파일**: `scripts/backfill-json-to-postgres.ts`
- **기능**: JSON → PostgreSQL 데이터 마이그레이션
- **특징**: 스트리밍 읽기, 배치 처리, 재시도 큐

### 전환 스크립트
- **파일**: `scripts/switch-database.ts`
- **기능**: 데이터베이스 백엔드 전환
- **특징**: 카나리 배포, 즉시 롤백

### 검증 스크립트
- **파일**: `scripts/validate-migration.ts`
- **기능**: JSON vs PostgreSQL 데이터 일관성 검증
- **특징**: 자동화된 검증, 상세한 차이점 리포트

## ⚠️ 주의사항

### 1. 백업 필수
```bash
# JSON 데이터 백업
cp assets/data/data.json assets/data/data.json.backup

# PostgreSQL 백업
pg_dump pickup_dev > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 롤백 준비
- 기존 JSON 서버 유지
- 환경변수 즉시 변경 가능
- 데이터 손실 없음

### 3. 모니터링 필수
- 듀얼라이트 성공률 100% 확인
- 응답 시간 모니터링
- 에러 로그 확인

## 🚨 문제 해결

### 1. 듀얼라이트 실패
```bash
# 로그 확인
npm run logs:api

# 듀얼라이트 비활성화
npm run switch:db canary:disable
```

### 2. 데이터 불일치
```bash
# 검증 실행
npm run validate:migration

# 차이점 분석
npm run validate:migration -- --verbose
```

### 3. 성능 문제
```bash
# 헬스체크 확인
curl http://localhost:3001/healthz

# 데이터베이스 연결 확인
npm run db:status
```

## 📈 성공 지표

### 1. 기능적 지표
- [ ] 모든 API 엔드포인트 정상 동작
- [ ] 데이터 일관성 100% 유지
- [ ] 에러율 0% 유지

### 2. 성능 지표
- [ ] 응답 시간 2배 이내 유지
- [ ] 메모리 사용량 안정적
- [ ] CPU 사용률 정상

### 3. 안정성 지표
- [ ] 듀얼라이트 성공률 100%
- [ ] 롤백 시간 5분 이내
- [ ] 데이터 손실 0%

## 📚 관련 문서

- [마이그레이션 계획서](./plan.md)
- [라우트 매니페스트](./route-manifest.json)
- [환경변수 가이드](./env-keys.md)
- [성능 감사 보고서](./perf-audit.md)

---

**작성자**: DOCORE  
**최종 업데이트**: 2025-01-01
