# 🏪 미친제육 프로젝트

## 📋 프로젝트 개요
- **프로젝트명**: 미친제육 - 다중 가게 관리 시스템
- **기술 스택**: HTML/CSS/JavaScript + Python Flask API + JSON DB
- **주요 기능**: 가게 관리, 설정 관리, 배달앱 연동, 픽업 안내

---

## 🗂️ 프로젝트 구조

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

## 🚀 빠른 시작

### **서버 시작**
```bash
# 프로젝트 디렉토리로 이동
cd /Users/dohyeonkim/mcjy

# 서버 시작
./scripts/start.sh
```

### **접속 URL**
- **메인 페이지**: `http://localhost:8080/src/frontend/`
- **관리자 페이지**: `http://localhost:8080/src/frontend/admin/dashboard.html`
- **API 서버**: `http://localhost:8081/api/`

### **서버 중지**
```bash
./scripts/stop.sh
```

---

## 🔧 개발 환경

### **필수 요구사항**
- Python 3.x
- 웹 브라우저 (Chrome 권장)

### **포트 사용**
- **8080**: HTTP 서버 (프론트엔드)
- **8081**: API 서버 (백엔드)

---

## 📚 문서

### **개발 문서**
- [프로젝트 매니저](PROJECT_MANAGER.md) - 프로젝트 전체 관리
- [개발 체크리스트](DEVELOPMENT_CHECKLIST.md) - 개발 가이드
- [배포 가이드](DEPLOYMENT_GUIDE.md) - 배포 및 운영

### **릴리즈 정보**
- [릴리즈 노트 v1.0.0](RELEASE_NOTES_v1.0.0.md) - 1차 릴리즈 정보

---

## 🎯 주요 기능

### **가게 관리**
- 가게 생성, 조회, 삭제
- 가게 전환 기능
- 확인 다이얼로그

### **설정 관리**
- 기본 정보 (가게명, 부제목, 전화번호, 주소)
- 할인 설정 (활성화, 제목, 설명)
- 배달앱 연동 (땡겨요, 배달의민족, 쿠팡이츠, 요기요)
- 픽업 안내 (활성화, 제목, 설명)
- 이미지 관리 (메인 로고, 메뉴 이미지)

### **사용자 인터페이스**
- 반응형 메인 페이지
- 관리자 대시보드
- 모달 시스템
- 네이버지도 API 연동
- 실시간 상태 업데이트

---

## 🛠️ 문제 해결

### **자주 발생하는 문제**
1. **포트 충돌**: `./scripts/stop.sh` 실행 후 재시작
2. **이미지 로딩 실패**: 경로 확인 (`../../assets/images/`)
3. **API 연결 실패**: API 서버 실행 상태 확인

### **로그 확인**
- HTTP 서버: 터미널 출력
- API 서버: 터미널 출력
- 브라우저: 개발자 도구 → 콘솔

---

## 📞 지원

### **문서 참조**
- [개발 체크리스트](DEVELOPMENT_CHECKLIST.md) - 오류 해결 가이드
- [프로젝트 매니저](PROJECT_MANAGER.md) - 상세 정보

### **개발 환경**
- **OS**: macOS (Apple Silicon)
- **Python**: 3.x
- **브라우저**: Chrome (권장)

---

**📅 최종 업데이트**: 2025-10-25 (프로젝트 구조 정리 완료)  
**👨‍💻 개발자**: AI Assistant  
**🎯 버전**: v1.0.0