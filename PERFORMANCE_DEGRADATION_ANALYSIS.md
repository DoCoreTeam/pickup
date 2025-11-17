# 성능 저하 원인 분석

## 현재 문제점

### 1. **fields 파라미터 최적화가 제대로 적용되지 않음**
- **증거**: 이미지에서 2187ms, 1946ms 쿼리가 여전히 2.2 MB를 반환
- **원인 분석**:
  - `getStoreSettingsOptimized`에서 fields 파라미터를 받지만, 실제로 많은 곳에서 fields 없이 호출되고 있을 가능성
  - 또는 fields가 `null`이거나 빈 배열일 때 모든 필드를 가져오는 로직이 문제

### 2. **LEFT JOIN store_settings가 여전히 모든 JSONB를 조회**
- **위치**: `getStoreById()` 함수 (line 784)
- **문제**: 
  ```sql
  LEFT JOIN store_settings ss ON s.id = ss.store_id
  SELECT ss.delivery  -- delivery만 필요하지만 JOIN은 전체 행을 가져옴
  ```
- **영향**: JSONB 컬럼이 많은 경우, JOIN 자체가 느릴 수 있음
- **해결 방안**: 필요한 경우에만 JOIN하거나, 완전히 별도 쿼리로 분리

### 3. **복합 인덱스 추가로 인한 인덱스 선택 비용 증가**
- **추가한 인덱스**:
  - `idx_store_owner_links_composite(store_id, owner_id)`
  - `idx_stores_status_created(status, created_at DESC)`
- **문제**: 인덱스가 많아지면 PostgreSQL이 최적 인덱스를 선택하는 비용이 증가할 수 있음
- **특히**: 단일 컬럼 인덱스와 복합 인덱스가 겹치는 경우 (예: `idx_store_owner_links_store_id` vs `idx_store_owner_links_composite`)

### 4. **ANALYZE 실행으로 인한 쿼리 플랜 변경**
- **문제**: ANALYZE 후 통계 정보가 바뀌면서 쿼리 플래너가 다른 플랜을 선택했을 수 있음
- **영향**: 이전에는 빠르던 쿼리가 더 느린 플랜을 선택할 수 있음

### 5. **캐시 키에 fields 포함으로 인한 캐시 미스 증가**
- **문제**: 
  ```javascript
  const fieldsKey = fields && fields.length > 0 ? fields.sort().join(',') : 'all';
  const cacheKey = getCacheKey('storeSettings', `${storeId}_${fieldsKey}`);
  ```
- **영향**: fields 조합이 많아지면 캐시 히트율이 떨어질 수 있음

### 6. **CTE 쿼리의 성능 저하**
- **위치**: `getStores()` 함수의 CTE 구조
- **문제**: 
  ```sql
  WITH filtered AS (...),
       page AS (...),
       owner_list AS (...)
  ```
- **영향**: 여러 단계의 CTE로 인한 중간 결과 저장 오버헤드

## 실제 느린 쿼리 분석 (이미지 기준)

1. **2187ms, 2.2 MB**: `SELECT ... FROM stores s LEFT JOIN store_settings ss ...`
   - 모든 JSONB 컬럼을 가져오고 있음
   - fields 최적화가 적용되지 않았을 가능성

2. **1946ms, 2.2 MB**: `SELECT s.id, s.name, s.subtitle, s.phone, s.address, s.cr...`
   - 여전히 모든 설정 데이터를 가져오는 것으로 보임

3. **2193ms, 4.1 KB**: `WITH filtered AS (SELECT ...)`
   - CTE 쿼리의 성능 문제
   - 인덱스 선택 비용 증가 가능성

4. **1442ms, 2.4 KB**: `SELECT s.id, s.name, s.subtitle, s.phone, s.address, s.st...`
   - 인덱스가 적용되지 않았거나 잘못된 인덱스 선택

## 개선 방안

### 즉시 적용 가능한 개선

1. **인덱스 정리**
   - 중복되는 인덱스 제거 (단일 컬럼 vs 복합 인덱스)
   - 실제 사용되는 인덱스만 유지

2. **fields 파라미터 강제 적용**
   - 모든 호출에서 fields 파라미터를 명시적으로 전달
   - 기본값을 '최소 필드만'으로 변경

3. **getStoreById 최적화**
   - delivery만 필요한 경우 store_settings JOIN 제거
   - 필요할 때만 별도 쿼리로 조회

4. **캐시 전략 변경**
   - fields 조합이 아닌 '전체 데이터'만 캐싱
   - 프론트엔드에서 필요한 필드만 필터링

5. **쿼리 플랜 확인**
   - EXPLAIN ANALYZE로 실제 실행 계획 확인
   - 인덱스 사용 여부 확인

### 장기 개선 방안

1. **데이터베이스 설계 개선**
   - JSONB를 별도 테이블로 분리 (정규화)
   - 필요한 컬럼만 포함하는 뷰 생성

2. **읽기 복제본 활용**
   - 읽기 작업은 복제본에서 처리

3. **쿼리 구조 단순화**
   - CTE 단순화
   - 불필요한 JOIN 제거

