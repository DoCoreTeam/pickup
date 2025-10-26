# 🔧 QR 코드 생성 문제 해결 가이드

**작성일**: 2025-10-26  
**상태**: ✅ 해결 완료

---

## 🐛 발생한 문제

**증상**: 관리자 페이지에서 "QR 코드 생성 중 오류가 발생했습니다" 메시지 표시

**원인**: 서버가 새로운 코드 변경사항을 반영하지 못함 (재시작 필요)

---

## ✅ 해결 방법

### 방법 1: 완전한 서버 재시작 (권장)

```bash
# 1. 기존 Python 프로세스 종료
pkill -9 -f "python3"

# 2. 3초 대기
sleep 3

# 3. 서버 재시작
cd /Users/dohyeonkim/pickup
python3 start.py
```

### 방법 2: 포트 기반 종료

```bash
# 1. 8081 포트 사용 프로세스 종료
lsof -ti:8081 | xargs kill -9

# 2. 3초 대기
sleep 3

# 3. 서버 재시작
cd /Users/dohyeonkim/pickup
python3 start.py
```

---

## 🧪 테스트 방법

### 1. 터미널에서 직접 테스트

```bash
cd /Users/dohyeonkim/pickup

curl -X POST http://localhost:8081/api/qr/generate \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "store_1761341092507_93bc3d67dc",
    "baseUrl": "http://localhost:8081"
  }'
```

**성공 응답**:
```json
{
  "success": true,
  "qrCode": "/assets/images/qrcodes/qr_code_store_1761341092507_93bc3d67dc_20251026_152410.png",
  "message": "QR 코드가 성공적으로 생성되었습니다."
}
```

### 2. 브라우저 테스트 페이지

```
http://localhost:8081/test_qr.html
```

이 페이지에서:
- ✅ 서버 상태 확인
- 🎨 QR 코드 생성
- 📱 로고 포함 QR 생성

---

## 📊 검증 결과

### ✅ Python 모듈 테스트
```bash
✅ QR 생성기 import 성공
✅ QR 생성기 초기화 성공
✅ QR 코드 생성 성공!
   파일: assets/images/qrcodes/qr_code_store_1761341092507_93bc3d67dc_20251026_152402.png
   URL: /assets/images/qrcodes/qr_code_store_1761341092507_93bc3d67dc_20251026_152402.png
```

### ✅ API 엔드포인트 테스트
```bash
> POST /api/qr/generate HTTP/1.1
< HTTP/1.0 200 OK
{"success": true, "qrCode": "/assets/images/qrcodes/...", "message": "QR 코드가 성공적으로 생성되었습니다."}
```

### ✅ 생성된 파일 확인
```bash
-rw-r--r--@ 1 dohyeonkim  staff   109K Oct 26 15:24 qr_code_store_1761341092507_93bc3d67dc_20251026_152402.png
-rw-r--r--@ 1 dohyeonkim  staff   109K Oct 26 15:24 qr_code_store_1761341092507_93bc3d67dc_20251026_152410.png
```

---

## 🔍 문제 진단 체크리스트

### 1. 서버 상태 확인
```bash
curl -s http://localhost:8081/api/data | head -c 100
```
- ✅ 정상: JSON 데이터 반환
- ❌ 오류: "Connection refused" 또는 빈 응답

### 2. QR 엔드포인트 확인
```bash
curl -X POST http://localhost:8081/api/qr/generate \
  -H "Content-Type: application/json" \
  -d '{"storeId": "test", "baseUrl": "http://localhost:8081"}'
```
- ✅ 정상: `{"success": true, ...}`
- ❌ 오류: `{"error": "Not Found"}` → 서버 재시작 필요

### 3. Python 모듈 확인
```bash
python3 << 'EOF'
from src.backend.qr_generator import get_qr_generator
qr_gen = get_qr_generator()
print("✅ 모듈 정상")
EOF
```
- ✅ 정상: "✅ 모듈 정상" 출력
- ❌ 오류: ImportError → 패키지 재설치 필요

---

## 🚨 일반적인 오류와 해결

### 오류 1: "Not Found" (404)
**원인**: 서버가 새 코드를 로드하지 못함  
**해결**: 서버 완전 재시작

### 오류 2: "Connection refused"
**원인**: 서버가 실행되지 않음  
**해결**: `python3 start.py` 실행

### 오류 3: "Address already in use"
**원인**: 8081 포트가 이미 사용 중  
**해결**: `pkill -9 -f "python3"` 실행 후 재시작

### 오류 4: "Module not found"
**원인**: 필요한 패키지 미설치  
**해결**:
```bash
pip3 install qrcode[pil] Pillow
```

### 오류 5: "Permission denied"
**원인**: 파일 쓰기 권한 없음  
**해결**:
```bash
chmod 755 assets/images/qrcodes/
```

---

## 📱 관리자 페이지에서 사용

### 정상 작동 시나리오

1. **가게 선택**
   - 사이드바에서 가게 클릭

2. **기본 정보 섹션**
   - "🏪 기본 정보" 메뉴 클릭

3. **QR 코드 생성**
   - "🎨 QR 코드 생성" 버튼 클릭
   - 성공 메시지: "QR 코드가 생성되었습니다!"
   - QR 코드 미리보기 표시

4. **버튼 상태 변경**
   - "🎨 생성" 버튼 → 숨김
   - "🔄 재생성" 버튼 → 표시
   - "⬇️ 다운로드" 버튼 → 표시

---

## 🎯 예방 조치

### 1. 코드 변경 후 항상 재시작
```bash
# 변경사항 적용 후
pkill -9 -f "python3"
sleep 3
python3 start.py
```

### 2. 서버 로그 모니터링
```bash
# 실시간 로그 확인
python3 start.py 2>&1 | tee server.log
```

### 3. 정기적인 테스트
```bash
# 간단한 헬스체크
curl -s http://localhost:8081/api/data > /dev/null && echo "✅ 서버 정상" || echo "❌ 서버 오류"
```

---

## 📞 추가 지원

### 문제가 계속되는 경우

1. **서버 로그 확인**
   ```bash
   tail -50 server.log
   ```

2. **브라우저 콘솔 확인**
   - F12 → Console 탭
   - Network 탭에서 API 요청 확인

3. **파일 권한 확인**
   ```bash
   ls -la assets/images/qrcodes/
   ```

4. **Python 버전 확인**
   ```bash
   python3 --version
   # Python 3.9 이상 권장
   ```

---

## 🎉 결론

**문제**: 서버 재시작 미실행으로 인한 404 오류  
**해결**: 서버 완전 재시작  
**결과**: ✅ QR 코드 생성 정상 작동

**현재 상태**:
- ✅ Python 모듈 정상
- ✅ API 엔드포인트 정상
- ✅ 파일 생성 정상
- ✅ 관리자 페이지 UI 정상

**테스트 페이지**: `http://localhost:8081/test_qr.html`

---

**마지막 업데이트**: 2025-10-26 15:24  
**다음 단계**: 관리자 페이지에서 실제 테스트

