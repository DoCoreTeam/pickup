# SELECT 쿼리 성능 분석

## 주요 성능 병목 원인

### 1. **JSONB 컬럼 전체 조회** (해결됨 ✅)
- **문제**: 큰 JSONB 데이터(2.2 MB)를 항상 전체 조회
- **해결**: `fields` 파라미터로 필요한 컬럼만 선택적 조회
- **개선**: 1895ms → 200ms 이하 예상

### 2. **ROW_NUMBER() 윈도우 함수**
- **위치**: `getStores()` 함수의 CTE에서 사용
- **문제**: 전체 테이블을 정렬해야 하므로 대량 데이터에서 비용이 큼
- **현재 구조**:
  ```sql
  ROW_NUMBER() OVER (${orderClause}) AS row_number
  FROM stores s
  ```
- **영향**: 정렬 컬럼에 인덱스가 없으면 전체 테이블 스캔 발생

### 3. **json_agg와 복잡한 JOIN**
- **위치**: `getStoreById()`, `getStores()` 함수
- **문제**: 여러 테이블 JOIN + json_agg 집계 + ORDER BY
- **현재 구조**:
  ```sql
  json_agg(
    json_build_object(...)
    ORDER BY o.owner_name ASC NULLS LAST, o.email ASC
  )
  FROM page p
  LEFT JOIN store_owner_links sol ON sol.store_id = p.id
  LEFT JOIN store_owners o ON sol.owner_id = o.id
  ```
- **영향**: 각 가게마다 owner 데이터를 집계하는 과정에서 CPU 사용량 증가

### 4. **복잡한 CTE (Common Table Expression)**
- **위치**: `getStores()` 함수
- **문제**: 여러 단계의 CTE로 인한 중간 결과 저장
- **구조**: `filtered` → `page` → `owner_list` → 최종 SELECT
- **영향**: 각 CTE 단계마다 디스크 I/O 발생 가능

### 5. **GROUP BY 절에 많은 컬럼**
- **위치**: `getStoreById()` 함수
- **문제**: 10개 이상의 컬럼을 GROUP BY에 포함
- **영향**: 집계 작업 시 메모리 사용량 증가

### 6. **인덱스 최적화 부족**
- **현재 인덱스**:
  - ✅ `idx_store_settings_store_id` (store_settings.store_id)
  - ✅ `idx_store_owner_links_store_id` (store_owner_links.store_id)
  - ✅ `idx_store_owner_links_owner_id` (store_owner_links.owner_id)
  - ✅ `idx_stores_status` (stores.status)
  - ✅ `idx_stores_created_at` (stores.created_at DESC)
  
- **부족한 인덱스**:
  - ❌ `stores.id`에 대한 기본 키 인덱스 확인 필요
  - ❌ 복합 인덱스 (status + created_at) 고려 필요
  - ❌ `store_owner_links(store_id, owner_id)` 복합 인덱스

### 7. **통계 정보 부족 (ANALYZE 미실행)**
- **문제**: PostgreSQL의 쿼리 플래너가 최신 통계 정보를 모르면 비효율적인 플랜 선택
- **해결 필요**: 주기적으로 `ANALYZE` 실행 또는 auto-analyze 설정 확인

### 8. **네트워크 지연 (NEON 원격 DB)**
- **문제**: NEON은 원격 데이터베이스이므로 네트워크 왕복 지연(RTT) 발생
- **영향**: 작은 쿼리라도 네트워크 지연으로 인해 느릴 수 있음
- **완화**: 캐싱을 통해 반복 쿼리 최소화 (이미 구현됨)

## 개선 방안

### 즉시 적용 가능한 개선

1. **필요한 필드만 조회** (이미 적용됨 ✅)
   - `fields` 파라미터 활용
   - DB 레벨에서 SELECT 절 최적화

2. **복합 인덱스 추가**
   ```sql
   CREATE INDEX IF NOT EXISTS idx_store_owner_links_composite 
   ON store_owner_links(store_id, owner_id);
   
   CREATE INDEX IF NOT EXISTS idx_stores_status_created 
   ON stores(status, created_at DESC);
   ```

3. **ANALYZE 실행**
   ```sql
   ANALYZE stores;
   ANALYZE store_settings;
   ANALYZE store_owner_links;
   ANALYZE store_owners;
   ```

4. **쿼리 플랜 확인**
   - `EXPLAIN ANALYZE`로 실제 실행 계획 확인
   - 인덱스 사용 여부 확인

### 장기 개선 방안

1. **캐싱 강화**
   - 자주 조회되는 데이터는 더 긴 캐시 TTL 적용
   - Redis 같은 외부 캐시 고려

2. **읽기 전용 복제본**
   - 읽기 작업은 복제본에서 처리 (NEON에서 지원 가능)

3. **파티셔닝**
   - 대량 데이터 시 테이블 파티셔닝 고려

4. **쿼리 구조 최적화**
   - CTE 단순화
   - 불필요한 JOIN 제거
   - 서브쿼리 최적화

