# 🎨 QR 코드 생성 기능 가이드

**작성일**: 2025-10-26  
**버전**: v1.0  
**상태**: ✅ 구현 완료

---

## 🎯 개요

가게 페이지 링크를 포함한 QR 코드를 자동으로 생성하는 기능입니다. 로고가 있으면 QR 코드 중앙에 표시되어 브랜드 아이덴티티를 강화합니다.

---

## ✨ 주요 기능

### 1. QR 코드 생성
- 가게 페이지 URL을 QR 코드로 변환
- 로고가 있으면 중앙에 합성
- 1024x1024 고해상도 PNG 생성

### 2. QR 코드 재생성
- 로고 변경 시 QR 코드 재생성 가능
- 기존 QR 코드는 새로운 코드로 교체

### 3. QR 코드 다운로드
- 생성된 QR 코드를 PNG 파일로 다운로드
- 파일명: `qr_code_{가게명}_{가게ID}.png`

---

## 🏗️ 구현 구조

### 1. 백엔드 (Python)

#### `src/backend/qr_generator.py`
```python
class QRGenerator:
    def generate_qr(data, logo_path=None, size=1024)
        # QR 코드 생성 및 로고 합성
    
    def generate_and_save(data, store_id, logo_path=None)
        # QR 코드 생성 및 파일 저장
```

**주요 기능**:
- `qrcode` 라이브러리로 QR 생성
- `PIL (Pillow)`로 로고 합성
- 고해상도 PNG 저장

#### `src/backend/api_server.py`
```python
POST /api/qr/generate
    # QR 코드 생성 API
    # 요청: { storeId, baseUrl }
    # 응답: { success, qrCode, message }
```

### 2. 프론트엔드 (HTML/JavaScript)

#### `admin/dashboard.html`

**UI 구성**:
```html
<div class="qr-code-section">
    <div class="qr-code-preview">
        <!-- QR 코드 이미지 미리보기 -->
    </div>
    <div class="qr-code-actions">
        <button onclick="generateQRCode()">QR 코드 생성</button>
        <button onclick="regenerateQRCode()">QR 코드 재생성</button>
        <button onclick="downloadQRCode()">QR 코드 다운로드</button>
    </div>
</div>
```

**JavaScript 함수**:
- `generateQRCode()`: QR 코드 생성
- `regenerateQRCode()`: QR 코드 재생성
- `downloadQRCode()`: QR 코드 다운로드
- `loadQRCode(settings)`: QR 코드 로드

---

## 📦 설치된 패키지

```txt
qrcode[pil]>=7.4.2
Pillow>=10.0.0
```

---

## 🚀 사용 방법

### 관리자 페이지에서

1. **가게 선택**
   - 사이드바에서 QR 코드를 생성할 가게 선택

2. **기본 정보 섹션으로 이동**
   - "🏪 기본 정보" 메뉴 클릭

3. **QR 코드 생성**
   - "🎨 QR 코드 생성" 버튼 클릭
   - 로고가 있으면 자동으로 중앙에 표시됨

4. **QR 코드 재생성** (로고 변경 시)
   - 이미지 관리에서 로고 변경
   - "🔄 QR 코드 재생성" 버튼 클릭

5. **QR 코드 다운로드**
   - "⬇️ QR 코드 다운로드" 버튼 클릭
   - PNG 파일 저장

---

## 🔧 기술 세부사항

### QR 코드 생성 프로세스

1. **URL 생성**
   ```
   {baseUrl}/store.html?id={storeId}
   ```

2. **QR 코드 생성**
   - 오류 정정 레벨: `ERROR_CORRECT_H` (최고)
   - 크기: 1024x1024 픽셀
   - 형식: PNG

3. **로고 합성** (있는 경우)
   - 로고 크기: QR 코드의 25%
   - 위치: 중앙
   - 배경: 흰색 (가독성 향상)

4. **파일 저장**
   ```
   assets/images/qrcodes/qr_code_{storeId}_{timestamp}.png
   ```

5. **설정 저장**
   ```json
   {
     "qrCode": {
       "url": "/assets/images/qrcodes/...",
       "filepath": "assets/images/qrcodes/...",
       "createdAt": "2025-10-26T..."
     }
   }
   ```

---

## 🎨 UI/UX 특징

### 1. 시각적 피드백
- QR 코드 미리보기 (200x200px)
- 생성 날짜 표시
- 버튼 상태 자동 전환

### 2. 버튼 상태 관리
```
QR 없음:    [생성] 버튼만 표시
QR 있음:    [재생성] [다운로드] 버튼 표시
```

### 3. 안내 메시지
```
💡 QR 코드는 가게 페이지 링크를 포함하며, 
   로고가 있으면 중앙에 표시됩니다.

📱 로고를 변경한 경우 '재생성' 버튼을 눌러 
   새로운 QR 코드를 만드세요.
```

---

## 📊 활동 로그

QR 코드 관련 활동은 자동으로 기록됩니다:

```javascript
await logActivity('qr', 'QR 코드 생성', 'QR 코드가 생성되었습니다.', {
    storeId: currentStoreId,
    qrCodeUrl: response.qrCode
});
```

---

## 🧪 테스트

### 1. 기본 QR 생성 테스트
```bash
python3 << 'EOF'
from src.backend.qr_generator import get_qr_generator

qr_gen = get_qr_generator()
result = qr_gen.generate_and_save(
    data="https://example.com/store?id=test",
    store_id="test_store"
)
print(result)
EOF
```

### 2. 로고 합성 테스트
```bash
python3 << 'EOF'
from src.backend.qr_generator import get_qr_generator

qr_gen = get_qr_generator()
result = qr_gen.generate_and_save(
    data="https://example.com/store?id=test",
    store_id="test_store",
    logo_path="assets/images/logos/mcjy.png"
)
print(result)
EOF
```

### 3. API 테스트
```bash
curl -X POST http://localhost:8081/api/qr/generate \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "store_1761341092507_93bc3d67dc",
    "baseUrl": "http://localhost:8081"
  }'
```

---

## 🔒 보안 고려사항

### 1. 파일 저장 위치
```
assets/images/qrcodes/
```
- 웹에서 접근 가능한 디렉토리
- `.gitignore`에 추가 권장

### 2. 파일명 규칙
```
qr_code_{storeId}_{timestamp}.png
```
- 타임스탬프로 중복 방지
- 가게 ID로 소유권 확인

---

## 🐛 문제 해결

### 1. QR 코드가 생성되지 않음
**원인**: 필요한 패키지 미설치  
**해결**:
```bash
pip3 install qrcode[pil] Pillow
```

### 2. 로고가 표시되지 않음
**원인**: 로고 파일 경로 오류  
**해결**:
- 로고 파일 존재 확인
- 경로가 올바른지 확인
- 로고 없이 QR 코드만 생성됨 (정상)

### 3. QR 코드 다운로드 실패
**원인**: CORS 또는 파일 접근 권한  
**해결**:
- 브라우저 콘솔 확인
- 서버 로그 확인
- 파일 경로 확인

---

## 📈 향후 개선 사항

### 1. 디자인 옵션
- [ ] QR 코드 색상 커스터마이징
- [ ] 다양한 크기 옵션
- [ ] 프레임 추가

### 2. 고급 기능
- [ ] QR 코드 스캔 통계
- [ ] 동적 QR (URL 변경 가능)
- [ ] 단축 URL 통합

### 3. OpenAI 통합 (선택사항)
- [ ] DALL-E로 QR 주변 디자인 강화
- [ ] AI 기반 QR 스타일 생성

---

## 📞 지원

**문제 발생 시**:
1. 서버 로그 확인 (`python3 start.py`)
2. 브라우저 콘솔 확인 (F12)
3. 활동 로그 확인 (관리자 페이지)

---

## 🎉 결론

QR 코드 생성 기능으로 다음과 같은 이점을 얻을 수 있습니다:

✅ **간편한 공유**: QR 코드로 가게 페이지 즉시 접근  
✅ **브랜드 강화**: 로고가 포함된 맞춤형 QR 코드  
✅ **고품질**: 1024x1024 고해상도 이미지  
✅ **자동화**: 로고 변경 시 재생성 가능  

**🚀 지금 바로 관리자 페이지에서 QR 코드를 생성해보세요!**

---

**마지막 업데이트**: 2025-10-26  
**다음 업데이트**: 디자인 옵션 추가 예정

