# 픽업 서비스 Railway 배포 가이드

## 배포 설정

### 1. Railway 프로젝트 설정
- **Builder**: NIXPACKS
- **Start Command**: `python3 start.py`
- **Python Version**: 3.9.6

### 2. 환경 변수
Railway에서 자동으로 설정되는 변수:
- `PORT`: Railway가 할당하는 포트 번호

### 3. 파일 구조
```
/
├── start.py              # Railway 시작 스크립트
├── railway.json          # Railway 설정
├── Procfile             # Heroku/Railway 호환성
├── requirements.txt     # Python 의존성 (현재 비어있음)
├── runtime.txt          # Python 버전
└── src/backend/
    └── api_server.py    # 메인 API 서버
```

### 4. 배포 명령어
```bash
# Railway CLI로 배포
railway up

# 또는 GitHub 연동으로 자동 배포
git push origin main
```

### 5. 문제 해결
- **포트 오류**: `PORT` 환경 변수가 올바르게 설정되었는지 확인
- **의존성 오류**: `requirements.txt`가 비어있어도 내장 HTTP 서버 사용으로 문제없음
- **정적 파일 오류**: API 서버가 정적 파일을 직접 서빙하므로 별도 설정 불필요

### 6. 로그 확인
```bash
railway logs
```

## 배포 후 확인사항
1. 서버가 정상적으로 시작되는지 확인
2. API 엔드포인트가 정상 작동하는지 확인
3. 정적 파일(HTML, CSS, JS)이 정상 로드되는지 확인
