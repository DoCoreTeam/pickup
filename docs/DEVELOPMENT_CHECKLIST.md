# 🛡️ 개발 체크리스트 - 오류 재발 방지 가이드

## 📋 필수 사전 체크리스트

### 1. **상수 및 변수 정의**
- [ ] 모든 API 엔드포인트는 `API_BASE` 상수 사용
- [ ] 전역 변수는 스크립트 시작 부분에 명시적 정의
- [ ] 변수 스코프 확인 (전역/지역 구분)

### 2. **문법 검사**
- [ ] 코드 편집 후 브라우저 콘솔에서 문법 오류 확인
- [ ] 중괄호 `{}`, 괄호 `()`, 세미콜론 `;` 짝 맞춤 확인
- [ ] 문자열 따옴표 닫힘 확인

### 3. **DOM 요소 접근**
- [ ] `document.getElementById()` 사용 전 요소 존재 확인
- [ ] `querySelector()` 결과 null 체크
- [ ] 동적 생성 요소는 생성 후 접근

### 4. **이벤트 리스너**
- [ ] 폼 입력 요소에 `input`, `blur` 이벤트 추가
- [ ] 버튼 클릭 시 상태 즉시 업데이트
- [ ] 이벤트 리스너 중복 등록 방지

### 5. **외부 API 연동**
- [ ] API 키, 엔드포인트 유효성 확인
- [ ] 네트워크 오류 처리 (`try-catch`)
- [ ] API 응답 데이터 구조 검증

### 6. **모달 및 UI 상호작용**
- [ ] 새 모달 열기 전 기존 모달 닫기
- [ ] 모달 배경 스크롤 방지 처리
- [ ] ESC 키로 모달 닫기 기능

### 7. **데이터 인코딩**
- [ ] SVG data URL에는 영문만 사용
- [ ] 한글 텍스트는 별도 처리
- [ ] base64 인코딩 유효성 확인

---

## 🔧 개발 중 실시간 체크리스트

### **코드 작성 시**
1. **변수 정의 순서**
   ```javascript
   // ✅ 올바른 순서
   const API_BASE = 'http://localhost:8081/api';
   let currentMap = null;
   function myFunction() { ... }
   ```

2. **DOM 접근 패턴**
   ```javascript
   // ✅ 안전한 DOM 접근
   const element = document.getElementById('myElement');
   if (element) {
     element.textContent = '안전한 업데이트';
   }
   ```

3. **이벤트 리스너 패턴**
   ```javascript
   // ✅ 실시간 업데이트
   input.addEventListener('input', updateStatus);
   input.addEventListener('blur', updateStatus);
   ```

4. **모달 관리 패턴**
   ```javascript
   // ✅ 모달 전환 시 기존 모달 닫기
   function openNewModal() {
     closeExistingModals();
     showNewModal();
   }
   ```

### **테스트 시**
1. **브라우저 콘솔 확인**
   - [ ] JavaScript 오류 없음
   - [ ] 네트워크 요청 성공
   - [ ] DOM 조작 정상

2. **기능 테스트**
   - [ ] 폼 입력 시 즉시 반영
   - [ ] 모달 전환 정상
   - [ ] API 연동 정상

---

## 🚨 자주 발생하는 오류 패턴

### **Pattern 1: 상수 미정의**
```javascript
// ❌ 잘못된 예
function getData() {
  return fetch(`${API_BASE}/data`); // API_BASE 미정의
}

// ✅ 올바른 예
const API_BASE = 'http://localhost:8081/api';
function getData() {
  return fetch(`${API_BASE}/data`);
}
```

### **Pattern 2: DOM 요소 미존재**
```javascript
// ❌ 잘못된 예
document.getElementById('nonExistent').textContent = 'error';

// ✅ 올바른 예
const element = document.getElementById('myElement');
if (element) {
  element.textContent = 'safe';
}
```

### **Pattern 3: 이벤트 리스너 누락**
```javascript
// ❌ 잘못된 예
// 입력 필드에 이벤트 리스너 없음

// ✅ 올바른 예
input.addEventListener('input', updateStatus);
input.addEventListener('blur', updateStatus);
```

### **Pattern 4: 모달 중복**
```javascript
// ❌ 잘못된 예
function showMenu() {
  menuModal.classList.add('show'); // 기존 모달 닫지 않음
}

// ✅ 올바른 예
function showMenu() {
  closeCallOptions(); // 기존 모달 먼저 닫기
  menuModal.classList.add('show');
}
```

---

## 📝 코드 품질 기준

### **1. 함수 구조**
- 함수당 하나의 책임
- 명확한 함수명 (한글 주석 포함)
- 에러 처리 포함

### **2. 변수 관리**
- 전역 변수 최소화
- 상수는 대문자로 명명
- 스코프 명확히 구분

### **3. 이벤트 처리**
- 실시간 업데이트 우선
- 이벤트 위임 활용
- 메모리 누수 방지

### **4. API 연동**
- 일관된 에러 처리
- 로딩 상태 표시
- 데이터 검증

---

## 🔍 디버깅 도구 활용

### **브라우저 개발자 도구**
1. **콘솔 탭**: JavaScript 오류 확인
2. **네트워크 탭**: API 요청/응답 확인
3. **요소 탭**: DOM 구조 확인

### **터미널 로그**
1. **HTTP 서버**: 정적 파일 서빙 확인
2. **API 서버**: 엔드포인트 동작 확인
3. **포트 충돌**: `lsof -ti:포트번호` 확인

---

## 📚 참고 자료

### **해결된 오류 목록**
1. `ReferenceError: API_BASE is not defined` → 상수 정의 추가
2. `SyntaxError: Unexpected token '}'` → 중복 코드 제거
3. `net::ERR_INVALID_URL` → SVG 인코딩 수정
4. `Cannot set properties of null` → DOM null 체크
5. `Cannot read properties of undefined` → 지도 인스턴스 관리
6. 배달앱 상태 업데이트 실패 → 이벤트 리스너 추가
7. 모달 상호작용 오류 → 모달 닫기 로직 추가
8. 하드코딩된 UI 요소 → 설정 기반 동적 제어

### **개발 환경 설정**
- HTTP 서버: `python3 -m http.server 8080`
- API 서버: `python3 api_server.py` (포트 8081)
- 브라우저: Chrome 개발자 도구 활용

---

## ⚡ 빠른 문제 해결 가이드

### **문제 발생 시 즉시 확인할 것들**
1. 브라우저 콘솔 오류 메시지
2. API 서버 실행 상태 (`curl http://localhost:8081/api/data`)
3. HTTP 서버 실행 상태 (`curl http://localhost:8080/`)
4. 포트 충돌 여부 (`lsof -ti:8080`, `lsof -ti:8081`)

### **자주 사용하는 명령어**
```bash
# 포트 확인 및 정리
lsof -ti:8080 | xargs kill -9
lsof -ti:8081 | xargs kill -9

# 서버 재시작
python3 -m http.server 8080 &
python3 api_server.py &

# API 테스트
curl http://localhost:8081/api/data
curl http://localhost:8080/
```

---

**📅 최종 업데이트**: 2025-10-25
**👨‍💻 작성자**: AI Assistant
**🎯 목적**: 오류 재발 방지 및 안정적인 개발 환경 구축
