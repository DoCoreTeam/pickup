# 🛡️ Compatibility Guardian - 호환성 보장 시스템

## 📋 현재 정상 동작 상태 (Baseline)

### 서버 상태
- HTTP 서버: 포트 8080 (`python3 -m http.server 8080`)
- API 서버: 포트 8081 (`python3 src/backend/api_server.py`)
- CORS 지원: OPTIONS 메서드 구현 완료

### API 엔드포인트 (공개 인터페이스)
```
GET  /api/data                    - 전체 데이터 조회
GET  /api/stores                  - 가게 목록 조회
GET  /api/current-store           - 현재 가게 조회
GET  /api/settings?storeId=xxx    - 가게 설정 조회
POST /api/stores                  - 가게 추가
POST /api/stores/update           - 가게 수정
POST /api/stores/delete           - 가게 삭제
POST /api/current-store/set       - 현재 가게 설정
POST /api/settings/update         - 설정 업데이트
POST /api/superadmin/check        - 슈퍼어드민 로그인
POST /api/superadmin/update       - 슈퍼어드민 정보 업데이트
OPTIONS /*                        - CORS preflight
```

### 데이터 스키마 (JSON)
```json
{
  "superadmin": {
    "username": "string",
    "password": "string", 
    "createdAt": "ISO8601",
    "lastModified": "ISO8601"
  },
  "stores": [
    {
      "id": "store_숫자_문자열",
      "name": "string",
      "subtitle": "string",
      "phone": "string",
      "address": "string",
      "createdAt": "ISO8601",
      "lastModified": "ISO8601"
    }
  ],
  "currentStoreId": "string|null",
  "settings": {
    "storeId": {
      "basic": {
        "storeName": "string",
        "storeSubtitle": "string", 
        "storePhone": "string",
        "storeAddress": "string"
      },
      "discount": {
        "discountEnabled": "boolean",
        "discountTitle": "string",
        "discountDescription": "string"
      },
      "delivery": {
        "ttaengUrl": "string",
        "baeminUrl": "string", 
        "coupangUrl": "string",
        "yogiyoUrl": "string",
        "deliveryOrder": ["string"]
      },
      "pickup": {
        "pickupEnabled": "boolean",
        "pickupTitle": "string",
        "pickupDescription": "string"
      },
      "images": {
        "mainLogo": "string",
        "menuImage": "string"
      }
    }
  },
  "deliveryOrders": {},
  "images": {}
}
```

### URL 라우팅
```
/                           → 관리자 페이지로 리다이렉트 (스토어 ID 없음)
/?store=storeId            → 가게 페이지 표시
/admin                     → 관리자 페이지로 리다이렉트
/admin/dashboard.html      → 관리자 대시보드
/admin/login.html          → 로그인 페이지
```

### DOM 요소 (공개 인터페이스)
- `#store-name` - 가게명 표시
- `#store-subtitle` - 가게 부제목 표시
- `#store-phone` - 전화번호 표시
- `#menu-modal` - 메뉴 모달
- `#phone-modal` - 전화 모달
- `.delivery-app-button` - 배달앱 버튼들

## 🔒 호환성 규칙 (NON-NEGOTIABLE)

### 1. API 호환성
- ✅ 기존 엔드포인트 제거/이름변경 금지
- ✅ 기존 필드 제거/이름변경/타입변경 금지
- ✅ 새 필드는 optional, 기본값 제공
- ✅ 기존 응답 구조 유지

### 2. 데이터 스키마 호환성
- ✅ 기존 필드 제거/이름변경 금지
- ✅ 새 필드는 optional
- ✅ 기존 데이터 구조 유지

### 3. URL 라우팅 호환성
- ✅ 기존 URL 패턴 유지
- ✅ 기존 쿼리 파라미터 유지
- ✅ 기존 리다이렉트 로직 유지

### 4. DOM 요소 호환성
- ✅ 기존 ID/클래스명 변경 금지
- ✅ 기존 이벤트 핸들러 유지
- ✅ 기존 모달 동작 유지

### 5. 서버 설정 호환성
- ✅ 포트 번호 변경 금지 (8080, 8081)
- ✅ 서버 시작 방식 유지
- ✅ CORS 설정 유지

## 🧪 호환성 테스트 체크리스트

### API 테스트
- [ ] 모든 기존 엔드포인트 정상 응답
- [ ] 기존 데이터 스키마 유지
- [ ] CORS preflight 정상 동작
- [ ] 에러 응답 형식 유지

### 프론트엔드 테스트
- [ ] 관리자 페이지 로그인/로그아웃
- [ ] 가게 목록 로드/관리
- [ ] 가게 페이지 표시
- [ ] 메뉴/전화 모달 동작
- [ ] 배달앱 링크 동작

### 통합 테스트
- [ ] 전체 워크플로우 정상
- [ ] 모달 상호작용 정상
- [ ] 데이터 저장/로드 정상

## 🚨 회귀 방지 체크리스트

### 변경 전 확인사항
- [ ] 기존 기능 영향도 분석
- [ ] 호환성 영향 범위 파악
- [ ] 롤백 계획 수립

### 변경 후 확인사항
- [ ] 기존 테스트 100% 통과
- [ ] 새 기능 테스트 추가
- [ ] 성능 영향 없음
- [ ] 문서 업데이트

### 배포 전 확인사항
- [ ] 전체 시스템 테스트
- [ ] 호환성 체크리스트 통과
- [ ] 롤백 시나리오 검증

## 📝 변경 로그 템플릿

### 호환성 변경사항
```markdown
## [날짜] 변경사항

### 추가 (Additive Only)
- 새 기능/필드: 설명
- 새 엔드포인트: 설명

### 변경 (Breaking Change 금지)
- 기존 기능 수정: 설명 (하위 호환성 유지)

### 제거 (Deprecation Only)
- 폐기 예정 기능: 설명 (대체 경로 제공)

### 호환성 보장
- 기존 API/스키마 유지
- 기존 URL/라우팅 유지
- 기존 DOM 요소 유지
```

## 🔧 자동화 도구

### 호환성 검증 스크립트
```bash
#!/bin/bash
# 호환성 검증 자동화

echo "🛡️ 호환성 검증 시작..."

# 1. API 엔드포인트 테스트
echo "📡 API 엔드포인트 테스트..."
curl -s http://localhost:8081/api/data | jq . > /dev/null || exit 1
curl -s http://localhost:8081/api/stores | jq . > /dev/null || exit 1

# 2. CORS 테스트
echo "🌐 CORS 테스트..."
curl -s -X OPTIONS http://localhost:8081/api/stores \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: GET" | grep -q "200 OK" || exit 1

# 3. 프론트엔드 테스트
echo "🖥️ 프론트엔드 테스트..."
curl -s http://localhost:8080/ | grep -q "관리자 페이지" || exit 1

echo "✅ 모든 호환성 검증 통과!"
```

## 🚀 배포 프로세스

### 1. 개발 단계
- 호환성 규칙 준수
- 기존 테스트 유지
- 새 테스트 추가

### 2. 테스트 단계
- 호환성 체크리스트 실행
- 전체 시스템 테스트
- 성능 테스트

### 3. 배포 단계
- 점진적 배포
- 모니터링
- 롤백 준비

### 4. 배포 후
- 호환성 모니터링
- 사용자 피드백 수집
- 문제 발생 시 즉시 롤백

## 📞 비상 연락처

### 호환성 문제 발생 시
1. 즉시 변경 중단
2. 원인 분석
3. 롤백 계획 수립
4. 대안 제시

### 승인 없이 진행 가능한 변경
- 주석 추가/수정
- 로그 메시지 개선
- 테스트 코드 추가
- 문서 업데이트

### 승인 필요한 변경
- API 엔드포인트 변경
- 데이터 스키마 변경
- URL 라우팅 변경
- DOM 요소 변경
- 서버 설정 변경

---

**⚠️ 경고: 이 규칙을 위반하면 시스템 안정성에 심각한 영향을 미칠 수 있습니다.**
