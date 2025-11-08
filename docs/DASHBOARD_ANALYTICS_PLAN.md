## 관리자 대시보드 및 이벤트 로깅 설계

### 1. 수집 대상 지표

- 페이지 방문 수 (`page_view`)
- 전화 버튼 클릭 수 (`call_click`)
- 메뉴 열람 수 (`menu_view`)
- 배달앱 버튼 클릭 수 (`delivery_click`)
- 픽업 안내 보기/복사 등 추가 이벤트 (확장 가능)

### 2. 이벤트 로깅 테이블

`store_events`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | UUID (PK) | 이벤트 식별자 |
| store_id | VARCHAR | 가게 ID |
| event_type | VARCHAR | `page_view`, `call_click`, … |
| event_payload | JSONB | 세부 정보(예: 메뉴 ID) |
| user_agent | TEXT | 브라우저 식별 정보 |
| created_at | TIMESTAMP | 발생 시각 |

### 3. 수집 방식

- 스토어 페이지(`store.html`)에서 주요 액션마다 `/api/events` POST 호출.
- 전화 버튼은 클릭 시 카운트 후 `tel:` 링크 실행.
- 메뉴 카드 클릭/열람 시 이벤트 전송.

### 4. 집계 API

- `GET /api/dashboard/summary?storeId=...&from=...&to=...`
- 응답: 총 방문 수, 전화 클릭 수, 메뉴 열람 수 등 카드용 통계.
- 필요시 일자별 시계열(`daily_counts`)도 포함.

### 5. 관리자 UI

- 사이드바에 `대시보드` 섹션 추가.
- 카드형 지표 + 차트(간단한 Canvas 또는 Chart.js).
- 점주 계정은 본인 가게만, 슈퍼어드민은 전체/선택 가게 조회.

### 6. 향후 확장

- 이벤트별 위치/디바이스 추적.
- GA 연동 또는 Export 기능.
- 알림/리포트 자동 발송.

