# 정리된 프로젝트 구조

## 📁 프로젝트 루트 구조

```
pickup/
├── 📄 index.html                    # 메인 페이지 (고객용)
├── 📄 store.html                    # 가게 페이지 (고객용)
├── 📄 paused.html                   # 일시정지 페이지
├── 📄 start.py                      # 서버 시작 스크립트
├── 📄 requirements.txt              # Python 의존성
├── 📄 runtime.txt                   # Python 버전
├── 📄 Procfile                      # Railway 배포 설정
├── 📄 railway.json                  # Railway 설정
├── 📄 RAILWAY_DEPLOYMENT.md         # 배포 가이드
├── 📄 PREFILL_REPORT.md             # DB 데이터 입력폼 문제 해결 보고서
│
├── 📁 admin/                        # 관리자 페이지
│   ├── 📄 dashboard.html            # 관리자 대시보드 (메인)
│   ├── 📄 index.html               # 관리자 인덱스
│   └── 📄 login.html               # 관리자 로그인
│
├── 📁 assets/                       # 정적 자원
│   ├── 📁 data/
│   │   └── 📄 data.json            # 메인 데이터베이스
│   └── 📁 images/
│       ├── 📁 icons/               # 배달앱 아이콘
│       ├── 📁 logos/               # 가게 로고
│       ├── 📁 menus/               # 메뉴 이미지
│       └── 📁 uploads/             # 업로드된 이미지
│
├── 📁 src/                          # 소스 코드
│   └── 📁 backend/
│       ├── 📄 api_server.py         # 메인 API 서버
│       └── 📄 api_server.py.backup # 백업 파일
│
├── 📁 docs/                         # 문서
│   ├── 📄 README.md
│   ├── 📄 DEPLOYMENT_GUIDE.md
│   ├── 📄 DEVELOPMENT_CHECKLIST.md
│   ├── 📄 PROJECT_MANAGER.md
│   ├── 📄 PROJECT_STRUCTURE_PLAN.md
│   ├── 📄 RELEASE_NOTES_v1.0.0.md
│   └── 📄 CLEAN_PROJECT_STRUCTURE.md
│
├── 📁 scripts/                      # 유틸리티 스크립트
│   ├── 📄 compatibility-check.sh
│   ├── 📄 compatibility-monitor.sh
│   ├── 📄 start.sh
│   └── 📄 stop.sh
│
└── 📁 dev/                          # 개발용 파일
    ├── 📄 debug.html
    ├── 📄 debug-main.html
    └── 📄 test-logo.svg
```

## 🎯 핵심 파일들

### **프론트엔드 (고객용)**
- `index.html` - 메인 페이지
- `store.html` - 가게 페이지
- `paused.html` - 일시정지 페이지

### **프론트엔드 (관리자용)**
- `admin/dashboard.html` - **관리자 대시보드 (메인)**
- `admin/index.html` - 관리자 인덱스
- `admin/login.html` - 관리자 로그인

### **백엔드**
- `src/backend/api_server.py` - **메인 API 서버**
- `start.py` - 서버 시작 스크립트

### **데이터**
- `assets/data/data.json` - **메인 데이터베이스**

## 🚀 서버 실행

```bash
python3 start.py
```

## 🌐 주요 URL

- **메인 페이지**: `http://localhost:8081/`
- **가게 페이지**: `http://localhost:8081/store.html?id={storeId}`
- **관리자 대시보드**: `http://localhost:8081/admin/dashboard.html`
- **관리자 로그인**: `http://localhost:8081/admin/login.html`

## 📝 정리 완료 사항

✅ **중복 파일 제거**
- `src/frontend/admin/dashboard.html` (삭제됨)
- `src/frontend/admin/index.html` (삭제됨)
- `src/frontend/admin/login.html` (삭제됨)
- `src/frontend/index.html` (삭제됨)

✅ **빈 디렉토리 정리**
- `src/frontend/admin/` (삭제됨)
- `src/frontend/` (삭제됨)

✅ **실제 사용되는 파일들만 유지**
- 루트의 `admin/` 폴더 (관리자 페이지)
- 루트의 `index.html`, `store.html` (고객 페이지)
- `src/backend/` (백엔드 코드)

## 🔧 개발 시 주의사항

1. **관리자 페이지 수정 시**: `/admin/dashboard.html` 파일만 수정
2. **고객 페이지 수정 시**: 루트의 `index.html`, `store.html` 수정
3. **API 서버 수정 시**: `src/backend/api_server.py` 수정
4. **데이터 수정 시**: `assets/data/data.json` 수정

## 📋 다음 작업 시 체크리스트

- [ ] 올바른 파일 경로 사용 확인
- [ ] 중복 파일 생성 방지
- [ ] 실제 서빙되는 파일 수정
- [ ] 백업 파일 정리
