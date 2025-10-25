# 🚀 미친제육 프로젝트 배포 가이드

## 📋 배포 전 체크리스트

### **1. 서버 환경 확인**
- [ ] Python 3.x 설치 확인
- [ ] 포트 8080, 8081 사용 가능 확인
- [ ] 네트워크 연결 상태 확인
- [ ] 디스크 공간 확인

### **2. 코드 상태 확인**
- [ ] 모든 파일 최신 상태 확인
- [ ] 릴리즈 노트 확인
- [ ] 오류 해결 가이드 확인
- [ ] 개발 체크리스트 확인

### **3. 데이터 백업**
- [ ] `data.json` 백업
- [ ] `images/` 폴더 백업
- [ ] 설정 파일 백업

---

## 🔧 배포 절차

### **Step 1: 환경 준비**
```bash
# 작업 디렉토리로 이동
cd /Users/dohyeonkim/mcjy

# 기존 프로세스 정리
lsof -ti:8080 | xargs kill -9
lsof -ti:8081 | xargs kill -9

# 포트 사용 가능 확인
lsof -i:8080
lsof -i:8081
```

### **Step 2: 서버 시작**
```bash
# HTTP 서버 시작 (백그라운드)
python3 -m http.server 8080 &

# API 서버 시작 (백그라운드)
python3 api_server.py &

# 프로세스 확인
ps aux | grep python
```

### **Step 3: 서비스 확인**
```bash
# 환경 변수에서 호스트 확인
echo "호스트: ${HOST:-localhost}"
echo "포트: ${PORT:-8080}"

# HTTP 서버 확인
curl -I http://${HOST:-localhost}:${PORT:-8080}/

# API 서버 확인
curl http://${HOST:-localhost}:${API_PORT:-8081}/api/data

# 메인 페이지 확인
curl http://${HOST:-localhost}:${PORT:-8080}/

# 관리자 페이지 확인
curl http://${HOST:-localhost}:${PORT:-8080}/admin/dashboard.html
```

### **Step 4: 기능 테스트**
```bash
# 가게 목록 조회
curl http://${HOST:-localhost}:${API_PORT:-8081}/api/stores

# 설정 조회
curl "http://${HOST:-localhost}:${API_PORT:-8081}/api/settings?storeId=store_1761193456474_iu7rvfvcr"

# 브라우저에서 수동 테스트
open http://${HOST:-localhost}:${PORT:-8080}/
open http://${HOST:-localhost}:${PORT:-8080}/admin/dashboard.html
```

---

## 🌐 접속 정보

### **환경 변수 설정**
```bash
# 배포 환경에서 설정할 환경 변수
export HOST=${HOST:-localhost}           # 서버 호스트 (기본값: localhost)
export PORT=${PORT:-8080}                # HTTP 서버 포트 (기본값: 8080)
export API_PORT=${API_PORT:-8081}        # API 서버 포트 (기본값: 8081)
export BASE_URL=${BASE_URL:-http://${HOST}:${PORT}}  # 기본 URL
```

### **사용자 접속 URL**
- **메인 페이지**: `${BASE_URL}/`
- **특정 가게**: `${BASE_URL}/?store=가게ID`

### **관리자 접속 URL**
- **관리자 대시보드**: `${BASE_URL}/admin/dashboard.html`
- **로그인 페이지**: `${BASE_URL}/admin/login.html`

### **API 접속 URL**
- **API 기본**: `http://${HOST}:${API_PORT}/api/`
- **데이터 조회**: `http://${HOST}:${API_PORT}/api/data`
- **가게 목록**: `http://${HOST}:${API_PORT}/api/stores`

---

## 📊 모니터링

### **서버 상태 확인**
```bash
# HTTP 서버 상태
curl -I http://${HOST:-localhost}:${PORT:-8080}/

# API 서버 상태
curl http://${HOST:-localhost}:${API_PORT:-8081}/api/data

# 프로세스 상태
ps aux | grep python
```

### **로그 확인**
```bash
# HTTP 서버 로그 (터미널에서 확인)
# API 서버 로그 (터미널에서 확인)
```

### **성능 모니터링**
```bash
# 메모리 사용량
ps aux | grep python | awk '{print $4, $6}'

# CPU 사용량
top -p $(pgrep -f "python3")
```

---

## 🔄 업데이트 절차

### **코드 업데이트 시**
```bash
# 1. 서버 중지
lsof -ti:8080 | xargs kill -9
lsof -ti:8081 | xargs kill -9

# 2. 코드 업데이트
git pull origin main  # 또는 파일 복사

# 3. 서버 재시작
python3 -m http.server 8080 &
python3 api_server.py &

# 4. 서비스 확인
curl http://localhost:8080/
curl http://localhost:8081/api/data
```

### **데이터 업데이트 시**
```bash
# 1. 데이터 백업
cp data.json data_backup_$(date +%Y%m%d_%H%M%S).json

# 2. 데이터 업데이트
# data.json 파일 수정

# 3. 서버 재시작 (필요시)
lsof -ti:8081 | xargs kill -9
python3 api_server.py &
```

---

## 🛠️ 문제 해결

### **자주 발생하는 문제**

#### **1. 포트 충돌**
```bash
# 해결 방법
lsof -ti:8080 | xargs kill -9
lsof -ti:8081 | xargs kill -9
```

#### **2. API 서버 연결 실패**
```bash
# 확인 사항
ps aux | grep api_server
curl http://localhost:8081/api/data
```

#### **3. 페이지 로딩 실패**
```bash
# 확인 사항
curl http://localhost:8080/
curl -I http://localhost:8080/
```

#### **4. JavaScript 오류**
- 브라우저 개발자 도구 → 콘솔 탭 확인
- `DEVELOPMENT_CHECKLIST.md` 참조

### **긴급 복구 절차**
```bash
# 1. 모든 서버 중지
lsof -ti:8080 | xargs kill -9
lsof -ti:8081 | xargs kill -9

# 2. 데이터 백업에서 복구
cp data_backup_YYYYMMDD_HHMMSS.json data.json

# 3. 서버 재시작
python3 -m http.server 8080 &
python3 api_server.py &

# 4. 서비스 확인
curl http://localhost:8080/
curl http://localhost:8081/api/data
```

---

## 📞 지원 연락처

### **문제 발생 시**
1. **문서 참조**: `DEVELOPMENT_CHECKLIST.md`, `PROJECT_MANAGER.md`
2. **로그 확인**: 터미널 출력, 브라우저 콘솔
3. **상태 확인**: `curl` 명령어로 서비스 상태 점검
4. **백업 복구**: 최신 백업 파일로 복구

### **개발 환경 정보**
- **OS**: macOS (Apple Silicon)
- **Python**: 3.x
- **브라우저**: Chrome (권장)
- **포트**: 8080 (HTTP), 8081 (API)

---

## 🎯 배포 완료 체크리스트

### **배포 후 확인사항**
- [ ] HTTP 서버 정상 동작 (포트 8080)
- [ ] API 서버 정상 동작 (포트 8081)
- [ ] 메인 페이지 접속 가능
- [ ] 관리자 페이지 접속 가능
- [ ] 가게 생성/삭제 기능 동작
- [ ] 설정 저장/로드 기능 동작
- [ ] 배달앱 바로가기 동작
- [ ] 네이버지도 연동 동작
- [ ] 모바일 반응형 동작

### **성능 확인**
- [ ] 페이지 로딩 속도 적절
- [ ] API 응답 속도 적절
- [ ] 메모리 사용량 적절
- [ ] CPU 사용량 적절

### **보안 확인**
- [ ] CORS 설정 적절
- [ ] 입력 데이터 검증
- [ ] 오류 메시지 노출 최소화
- [ ] 로그 파일 보안

---

**🚀 배포 완료! 🚀**

**📅 배포 날짜**: 2025-10-25  
**👨‍💻 배포 담당**: AI Assistant  
**🎯 서비스 상태**: 정상 운영 중
