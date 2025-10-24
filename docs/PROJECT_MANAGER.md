# 🏪 미친제육 프로젝트 매니저

## 📋 프로젝트 개요
- **프로젝트명**: 미친제육 - 다중 가게 관리 시스템
- **기술 스택**: HTML/CSS/JavaScript + Python Flask API + JSON DB
- **주요 기능**: 가게 관리, 설정 관리, 배달앱 연동, 픽업 안내

---

## 🛡️ 오류 해결 가이드 (2025-10-25 업데이트)

### ⚠️ 해결된 주요 오류들

#### 1. **ReferenceError: API_BASE is not defined**
- **원인**: 전역 상수 미정의
- **해결**: 스크립트 시작 부분에 `const API_BASE = 'http://localhost:8081/api';` 추가
- **재발 방지**: 모든 API 호출은 `API_BASE` 상수 사용

#### 2. **SyntaxError: Unexpected token '}'**
- **원인**: 중복된 `});` 코드
- **해결**: 중복 코드 제거
- **재발 방지**: 코드 편집 후 문법 검사 필수

#### 3. **net::ERR_INVALID_URL (SVG Data URL)**
- **원인**: 한글 텍스트 포함 SVG의 base64 인코딩 실패
- **해결**: 한글 텍스트를 영문으로 변경
- **재발 방지**: SVG data URL에는 영문만 사용

#### 4. **네이버지도 API 초기화 오류**
- **원인**: DOM 요소 미존재, 지도 인스턴스 중복 생성
- **해결**: null 체크 추가, 전역 지도 변수로 인스턴스 관리
- **재발 방지**: 외부 API 사용 시 null 체크 및 인스턴스 관리 필수

#### 5. **배달앱 상태 업데이트 실패**
- **원인**: 이벤트 리스너 미설정, 실시간 업데이트 누락
- **해결**: input/blur 이벤트 리스너 추가, 상태 즉시 반영
- **재발 방지**: 폼 요소는 실시간 이벤트 리스너 필수

#### 6. **모달 상호작용 오류**
- **원인**: 모달 간 닫힘 로직 누락
- **해결**: 새 모달 열기 전 기존 모달 닫기 로직 추가
- **재발 방지**: 모달 전환 시 기존 모달 닫기 필수

#### 7. **하드코딩된 UI 요소**
- **원인**: 설정과 무관하게 표시되는 하드코딩
- **해결**: 모든 UI 요소를 설정 기반으로 동적 제어
- **재발 방지**: UI 요소는 설정 데이터 기반으로만 표시

### 🔧 안전한 코드 패턴

#### **DOM 접근 패턴**
```javascript
// ✅ 안전한 DOM 접근
const element = document.getElementById('myElement');
if (element) {
  element.textContent = '안전한 업데이트';
}

// ❌ 위험한 DOM 접근
document.getElementById('myElement').textContent = '오류 가능';
```

#### **API 요청 패턴**
```javascript
// ✅ 안전한 API 요청
async function loadData() {
  try {
    const data = await safeApiRequest(`${API_BASE}/data`);
    return data;
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    return null;
  }
}
```

#### **이벤트 리스너 패턴**
```javascript
// ✅ 실시간 업데이트
input.addEventListener('input', updateStatus);
input.addEventListener('blur', updateStatus);
```

#### **모달 관리 패턴**
```javascript
// ✅ 모달 전환 시 기존 모달 닫기
function openNewModal() {
  closeExistingModals();
  showNewModal();
}
```

### 📋 개발 전 필수 체크리스트
- [ ] 모든 API 엔드포인트는 `API_BASE` 상수 사용
- [ ] DOM 요소 접근 시 null 체크
- [ ] 폼 입력 요소에 실시간 이벤트 리스너 추가
- [ ] 모달 전환 시 기존 모달 닫기
- [ ] SVG data URL에는 영문만 사용
- [ ] 외부 API 사용 시 인스턴스 관리

---

## 🗂️ 파일 구조

### 📁 파일 구조

```
/Users/dohyeonkim/mcjy/
├── 📁 src/                    # 소스 코드
│   ├── 📁 frontend/           # 프론트엔드
│   │   ├── index.html         # 메인 페이지
│   │   └── 📁 admin/          # 관리자 페이지
│   │       ├── dashboard.html
│   │       ├── index.html
│   │       └── login.html
│   └── 📁 backend/            # 백엔드
│       └── api_server.py      # API 서버
├── 📁 assets/                 # 정적 자원
│   ├── 📁 images/             # 이미지 파일
│   │   ├── 📁 logos/          # 로고 이미지
│   │   ├── 📁 menus/          # 메뉴 이미지
│   │   └── 📁 icons/          # 아이콘 이미지
│   └── 📁 data/               # 데이터 파일
│       └── data.json          # JSON 데이터베이스
├── 📁 docs/                   # 문서
│   ├── README.md              # 프로젝트 소개
│   ├── PROJECT_MANAGER.md     # 프로젝트 매니저
│   ├── DEPLOYMENT_GUIDE.md    # 배포 가이드
│   ├── DEVELOPMENT_CHECKLIST.md # 개발 체크리스트
│   └── RELEASE_NOTES_v1.0.0.md # 릴리즈 노트
├── 📁 dev/                    # 개발용 파일
│   ├── debug-main.html        # 디버그 파일
│   ├── debug.html             # 디버그 파일
│   └── test-logo.svg          # 테스트 파일
└── 📁 scripts/                # 스크립트
    ├── start.sh               # 서버 시작 스크립트
    └── stop.sh                # 서버 중지 스크립트
```

---

## 🔧 핵심 기능 구현 상태

### ✅ 완료된 기능

#### 1. **가게 관리 (CRUD)**
- **생성**: `POST /api/stores` - 새 가게 추가
- **조회**: `GET /api/stores` - 가게 목록 조회
- **수정**: 가게 정보 편집 (구현 필요)
- **삭제**: `DELETE /api/stores/{id}` - 가게 삭제 (확인 다이얼로그 포함)

#### 2. **설정 관리**
- **기본 정보**: 가게명, 부제목, 전화번호, 주소
- **할인 설정**: 할인 활성화, 제목, 설명
- **배달앱 설정**: 땡겨요, 배달의민족, 쿠팡이츠, 요기요 URL
- **픽업 안내**: 픽업 활성화, 제목, 설명
- **이미지 관리**: 메인 로고, 메뉴 이미지

#### 3. **API 엔드포인트**
```javascript
// API 서버 (포트 8081)
GET    /api/data              # 전체 데이터
GET    /api/stores            # 가게 목록
POST   /api/stores            # 새 가게 생성
DELETE /api/stores/{id}       # 가게 삭제
GET    /api/settings?storeId= # 설정 조회
POST   /api/settings          # 설정 저장
POST   /api/current-store     # 현재 가게 설정
```

---

## 🎯 주요 JavaScript 함수

### 📄 메인 페이지 (`index.html`)
```javascript
// 핵심 함수들
loadAdminSettings()           # API에서 설정 로드
updateDeliveryAppUrls()       # 배달앱 URL 업데이트
applyDeliveryOrder()          # 배달앱 순서 적용
generateStoreId()             # 가게 ID 생성
getStoreIdFromUrl()           # URL에서 가게 ID 추출
```

### 🛠️ 관리자 페이지 (`admin/index.html`)
```javascript
// CRUD 함수들
addNewStore()                 # 새 가게 추가 (API 연동)
deleteStore(storeId)          # 가게 삭제 (확인 다이얼로그)
switchStore(storeId)          # 가게 전환
loadStoreList()              # 가게 목록 로드
saveSettings()                # 설정 저장 (API 연동)
loadSettings()                # 설정 로드 (API 연동)

// 유틸리티 함수들
generateStoreId()             # 가게 ID 생성
getStoreNameById(storeId)     # 가게명 조회
getCurrentStoreId()           # 현재 가게 ID 조회
apiRequest(url, method, data) # API 요청 헬퍼
```

---

## 🗄️ 데이터베이스 구조 (`data.json`)

```json
{
  "stores": [
    {
      "id": "store_TIMESTAMP_RANDOM",
      "name": "가게명",
      "subtitle": "부제목",
      "phone": "전화번호",
      "address": "주소",
      "createdAt": "ISO_DATE"
    }
  ],
  "currentStoreId": "store_ID",
  "settings": {
    "store_ID": {
      "basic": { "storeName", "storeSubtitle", "storePhone", "storeAddress" },
      "discount": { "discountEnabled", "discountTitle", "discountDescription" },
      "delivery": { "ttaengUrl", "baeminUrl", "coupangUrl", "yogiyoUrl", "deliveryOrder" },
      "pickup": { "pickupEnabled", "pickupTitle", "pickupDescription" },
      "images": { "mainLogo", "menuImage" }
    }
  }
}
```

---

### 🚀 서버 실행 방법

#### **스크립트 사용 (권장)**
```bash
# 서버 시작
./scripts/start.sh

# 서버 중지
./scripts/stop.sh
```

#### **수동 실행**
```bash
# HTTP 서버 (포트 8080)
python3 -m http.server 8080

# API 서버 (포트 8081)
python3 src/backend/api_server.py
```

#### **접속 URL**
- **메인 페이지**: `http://localhost:8080/src/frontend/`
- **관리자 페이지**: `http://localhost:8080/src/frontend/admin/dashboard.html`
- **API 서버**: `http://localhost:8081/api/`

---

## 🔧 문제 해결 가이드

### ❌ 자주 발생하는 문제들

#### 1. **API 서버 포트 충돌**
```bash
# 해결 방법
lsof -ti:8081 | xargs kill -9
python3 api_server.py
```

#### 2. **가게 추가 실패**
- `generateStoreId` 함수 누락 확인
- API 서버 실행 상태 확인
- `addNewStore` 함수가 API 연동되어 있는지 확인

#### 3. **삭제 기능 오류**
- `deleteStore` 함수가 API 연동되어 있는지 확인
- DELETE 엔드포인트 구현 확인
- 확인 다이얼로그 메시지 개선

#### 4. **설정 동기화 문제**
- 메인 페이지와 관리자 페이지 모두 API 서버 사용 확인
- `localStorage` 대신 API 서버 사용 확인

---

## 🎨 UI/UX 개선사항

### ✅ 완료된 개선사항
- **반응형 디자인**: 관리자 페이지 모바일 대응
- **확인 다이얼로그**: 삭제 시 가게명 표시 및 경고
- **상태 표시**: 성공/실패 메시지 표시
- **폼 초기화**: 새 가게 추가 후 자동 초기화

### 🔄 추가 개선 필요사항
- **가게 편집 기능**: 기존 가게 정보 수정
- **이미지 업로드**: 드래그 앤 드롭 지원
- **데이터 백업**: 설정 내보내기/가져오기
- **권한 관리**: 관리자 인증 시스템

---

## 📝 개발 노트

### 🔄 최근 수정사항
1. **API 서버 통합**: localStorage → API 서버로 전환
2. **CRUD 완성**: Create, Read, Delete 구현 완료
3. **UX 개선**: 삭제 확인 다이얼로그 개선
4. **데이터 동기화**: 메인-관리자 페이지 동기화
5. **하드코딩 완전 제거**: 모든 가게별 정보를 API에서 동적 로드
6. **네이버지도 API 동적화**: 가게별 주소와 좌표에 따른 지도 설정
7. **메인 페이지 보기 버튼 수정**: Promise 처리 오류 해결
8. **기본 이미지 설정**: 하드코딩된 "미친제육" 이미지를 기본 이미지로 교체
9. **페이지 보기 버튼 개선**: "메인 페이지 보기" → "페이지 보기"로 변경, 현재 선택된 가게의 메인 페이지로 정확한 이동

### 📋 상세 수정사항 (2025-10-23)

#### **하드코딩 완전 제거**
- **문제**: 첫 번째 가게에 "미친제육" 관련 하드코딩된 이미지와 텍스트가 남아있음
- **해결**: 
  - 로고: `images/mcjy.png` → `images/default-logo.png` + SVG fallback
  - 메뉴판: `images/menu.jpeg` → `images/default-menu.png` + SVG fallback
  - 모든 텍스트를 "로딩 중..." 또는 "설정해주세요"로 변경
- **결과**: 완전히 중립적인 기본 상태로 초기화

#### **네이버지도 API 동적화**
- **문제**: 지도가 고정된 좌표와 주소를 사용
- **해결**: 
  - `initNaverMap(storeInfo)` 함수에 가게 정보 전달
  - 주소별 좌표 매핑 (구리시, 강남구, 서초구, 송파구 등)
  - 지도 링크도 동적으로 생성
- **결과**: 가게별 맞춤 지도 표시

#### **메인 페이지 보기 버튼 수정**
- **문제**: `getCurrentStoreId()`가 Promise를 반환하는데 `await` 없이 사용
- **해결**: `openMainPage()` 함수를 `async`로 변경하고 `await` 추가
- **결과**: 올바른 가게 ID로 메인 페이지 이동

#### **페이지 보기 버튼 개선 (2025-10-23)**
- **문제**: "메인 페이지 보기" 버튼이 단순히 루트 URL로만 이동
- **해결**: 
  - 버튼 텍스트를 "페이지 보기"로 변경
  - `openMainPage()` 함수를 `async`로 수정하여 현재 선택된 가게 ID를 가져와서 `/?storeId=${currentStoreId}` 형태로 정확한 URL 생성
  - 에러 처리 추가로 가게가 선택되지 않은 경우 기본 페이지로 이동
- **결과**: 현재 선택된 가게의 메인 페이지로 정확한 이동, 새 탭에서 열림

#### **URL 파라미터 호환성 수정 (2025-10-23)**
- **문제**: 관리자에서 `storeId` 파라미터로 전달하지만 메인 페이지에서는 `store` 파라미터만 인식
- **해결**: `getStoreIdFromUrl()` 함수에서 `storeId`와 `store` 파라미터 모두 지원하도록 수정
- **결과**: 관리자에서 "페이지 보기" 클릭 시 정확한 가게 페이지로 이동

#### **이미지 관리 기능 개선 (2025-10-23)**
- **문제**: 이미지 관리에서 현재 설정된 이미지가 표시되지 않고, 드래그앤드롭 기능이 없음
- **해결**: 
  - 드래그앤드롭 업로드 영역 추가 (시각적 피드백 포함)
  - 현재 설정된 이미지 미리보기 표시
  - `updateImagePreview()` 함수로 이미지 상태 관리
  - `loadSettings()` 함수에서 이미지 로드 시 미리보기 업데이트
- **결과**: 직관적인 이미지 업로드 및 현재 이미지 확인 가능

#### **배달앱 순서 변경 기능 복원 (2025-10-23)**
- **문제**: 배달앱 설정에서 위아래 순서 변경 기능이 사라짐
- **해결**: 
  - 배달앱 순서 설정 UI 추가 (위아래 버튼 포함)
  - `renderDeliveryOrder()` 함수로 순서 목록 동적 렌더링
  - `moveDeliveryApp()` 함수로 순서 변경 처리
  - 메인 페이지의 `applyDeliveryOrder()` 함수를 API 서버 연동으로 수정
  - 실시간 순서 반영 (관리자에서 변경 시 메인 페이지에 즉시 반영)
- **결과**: 배달앱 표시 순서를 직관적으로 변경하고 메인 페이지에 즉시 반영

#### **관리자 메뉴 초기 표시 문제 해결 (2025-10-23)**
- **문제**: 새로고침 시 모든 메뉴가 한번에 나왔다가 시간이 지나면 정상 작동
- **해결**: 
  - CSS에서 `.admin-section`에 `display: none` 초기 설정 추가
  - JavaScript `DOMContentLoaded`에서 즉시 모든 섹션 숨기기 처리
  - `showSection('stores')` 호출로 첫 번째 섹션만 표시
- **결과**: 페이지 로드 시 깔끔한 초기 상태, 모든 섹션이 동시에 보이는 문제 해결

### 🎯 다음 개발 우선순위
1. **가게 편집 기능** 구현
2. **이미지 업로드** 개선
3. **데이터 백업** 기능
4. **성능 최적화**

---

## 🚨 중요 참고사항

### ⚠️ 주의사항
- **API 서버 필수**: 모든 데이터 작업은 API 서버를 통해 수행
- **포트 충돌**: 8080(HTTP), 8081(API) 포트 사용
- **데이터 백업**: `data.json` 파일 정기 백업 권장

### 🔧 개발 시 체크리스트
- [ ] API 서버 실행 상태 확인
- [ ] HTTP 서버 실행 상태 확인
- [ ] 브라우저 콘솔 오류 확인
- [ ] 네트워크 탭에서 API 요청 확인
- [ ] `data.json` 파일 구조 확인

---

## 📞 지원 정보

### 🛠️ 디버깅 도구
- **브라우저 개발자 도구**: 콘솔, 네트워크 탭 활용
- **API 테스트**: Postman 또는 curl 사용
- **로그 확인**: 터미널에서 API 서버 로그 확인

### 📋 테스트 시나리오
1. 새 가게 추가 → 목록에 표시 확인
2. 가게 삭제 → 확인 다이얼로그 → 삭제 확인
3. 설정 변경 → 메인 페이지 반영 확인
4. 배달앱 URL 설정 → 메인 페이지 표시 확인

---

**📅 최종 업데이트**: 2025-10-23
**👨‍💻 개발자**: AI Assistant
**📧 문의**: 이 파일을 참조하여 문제 해결

---

## 🚀 1차 릴리즈 완료 (2025-10-25)

### ✅ 릴리즈 상태
- **버전**: v1.0.0
- **상태**: 정상 동작 확인 완료
- **타입**: 1차 정식 릴리즈

### 🎯 완료된 핵심 기능
- ✅ 가게 관리 시스템 (CRUD)
- ✅ 설정 관리 시스템
- ✅ 사용자 인터페이스
- ✅ API 서버 시스템
- ✅ 모든 주요 오류 해결
- ✅ 코드 품질 표준화
- ✅ 문서화 완료

### 📋 릴리즈 문서
- `RELEASE_NOTES_v1.0.0.md` - 상세 릴리즈 노트
- `DEPLOYMENT_GUIDE.md` - 배포 가이드
- `DEVELOPMENT_CHECKLIST.md` - 개발 체크리스트

### 🎉 주요 성과
- **안정성**: 모든 주요 오류 해결 및 재발 방지 체계 구축
- **사용성**: 직관적인 인터페이스와 실시간 업데이트
- **개발성**: 재사용 가능한 코드와 체계적인 문서화
- **품질**: 표준화된 개발 프로세스와 체크리스트

**📅 최종 업데이트**: 2025-10-25 (1차 릴리즈 완료)
