# Pickup - 배달앱 통합 관리 시스템

Node.js와 PostgreSQL을 사용한 배달앱 통합 관리 시스템입니다.

## 🚀 주요 기능

- **가게 관리**: 여러 가게의 정보를 통합 관리
- **배달앱 설정**: 땡겨요, 배달의민족, 쿠팡이츠, 요기요 URL 관리
- **실시간 대시보드**: 관리자용 웹 인터페이스
- **QR 코드 생성**: 각 가게별 QR 코드 자동 생성
- **활동 로그**: 시스템 사용 내역 추적

## 🛠 기술 스택

- **Backend**: Node.js
- **Database**: PostgreSQL
- **Frontend**: HTML, CSS, JavaScript
- **API**: RESTful API

## 📁 프로젝트 구조

```
pickup/
├── src/
│   ├── backend/
│   │   └── api_server.js          # Node.js API 서버
│   └── database/
│       └── services.js            # 데이터베이스 서비스
├── admin/
│   └── dashboard.html             # 관리자 대시보드
├── index.html                     # 메인 페이지
├── assets/                        # 정적 파일들
│   ├── images/
│   │   ├── icons/                 # 배달앱 아이콘들
│   │   └── qrcodes/               # QR 코드 이미지들
│   └── css/
├── scripts/                       # 데이터베이스 스크립트
├── backup/                        # 이전 버전 파일들
│   └── old-files/                 # Python 기반 이전 파일들
└── docker-compose.yml             # Docker 설정
```

## 🚀 시작하기

### 1. 데이터베이스 설정

```bash
# PostgreSQL 데이터베이스 생성
createdb pickup_db

# 데이터베이스 초기화
psql -d pickup_db -f scripts/init-db.sql
```

### 2. 환경 변수 설정

```bash
# .env 파일 생성
cp env.example .env

# 데이터베이스 연결 정보 설정
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pickup_db
DB_USER=pickup_user
DB_PASSWORD=your_password
```

### 3. 서버 실행

```bash
# 의존성 설치
npm install

# 서버 시작
node src/backend/api_server.js
```

### 4. 접속

- **메인 페이지**: http://localhost:8081
- **관리자 대시보드**: http://localhost:8081/admin/dashboard.html

## 📋 API 엔드포인트

- `GET /api/stores` - 가게 목록 조회
- `GET /api/settings?storeId={id}` - 가게 설정 조회
- `POST /api/store/{id}/settings` - 가게 설정 업데이트
- `GET /api/activity-logs` - 활동 로그 조회
- `POST /api/current-store` - 현재 가게 설정

## 🔧 개발 정보

- **포트**: 8081
- **데이터베이스**: PostgreSQL
- **API 형식**: JSON

## 📝 변경 사항

### v1.4.2 (2025-10-28)
- ✅ 아이콘 표시 문제 해결
- ✅ 배달앱 URL 저장 기능 완성
- ✅ 이전 Python 파일들 백업 폴더로 이동
- ✅ 프로젝트 구조 정리

## 📞 지원

문제가 발생하거나 기능 요청이 있으시면 이슈를 등록해주세요.
