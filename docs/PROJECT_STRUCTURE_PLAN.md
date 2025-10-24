# 📁 프로젝트 구조 정리 계획

## 🔍 현재 문제점 분석

### **파일 구조 문제**
1. **루트 디렉토리 혼잡**: 모든 파일이 루트에 산재
2. **문서 파일 분산**: README.md, PROJECT_MANAGER.md 등이 루트에 위치
3. **디버그 파일 혼재**: debug-main.html, debug.html이 프로덕션과 함께 위치
4. **이미지 파일 정리 필요**: 사용하지 않는 이미지 파일들 존재
5. **일관성 없는 네이밍**: 한글 파일명과 영문 파일명 혼재

### **개선 방향**
1. **계층적 디렉토리 구조** 구축
2. **문서 파일 분리** 및 정리
3. **개발/프로덕션 파일 분리**
4. **이미지 파일 정리** 및 분류
5. **일관된 네이밍 컨벤션** 적용

---

## 🎯 목표 구조

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
    └── start.sh               # 서버 시작 스크립트
```

---

## 📋 정리 작업 계획

### **Phase 1: 디렉토리 생성**
- [ ] `src/` 디렉토리 생성
- [ ] `src/frontend/` 디렉토리 생성
- [ ] `src/backend/` 디렉토리 생성
- [ ] `assets/` 디렉토리 생성
- [ ] `assets/images/` 디렉토리 생성
- [ ] `assets/data/` 디렉토리 생성
- [ ] `docs/` 디렉토리 생성
- [ ] `dev/` 디렉토리 생성
- [ ] `scripts/` 디렉토리 생성

### **Phase 2: 파일 이동**
- [ ] 소스 코드 파일 이동
- [ ] 정적 자원 파일 이동
- [ ] 문서 파일 이동
- [ ] 개발용 파일 이동

### **Phase 3: 파일 정리**
- [ ] 불필요한 파일 삭제
- [ ] 이미지 파일 분류
- [ ] 네이밍 컨벤션 적용

### **Phase 4: 설정 업데이트**
- [ ] 경로 참조 수정
- [ ] 문서 업데이트
- [ ] 스크립트 생성

---

## 🚀 실행 계획

### **Step 1: 백업 생성**
```bash
# 전체 프로젝트 백업
cp -r /Users/dohyeonkim/mcjy /Users/dohyeonkim/mcjy_backup_$(date +%Y%m%d)
```

### **Step 2: 디렉토리 구조 생성**
```bash
cd /Users/dohyeonkim/mcjy
mkdir -p src/frontend/admin
mkdir -p src/backend
mkdir -p assets/images/{logos,menus,icons}
mkdir -p assets/data
mkdir -p docs
mkdir -p dev
mkdir -p scripts
```

### **Step 3: 파일 이동**
```bash
# 소스 코드 이동
mv index.html src/frontend/
mv admin/* src/frontend/admin/
mv api_server.py src/backend/

# 정적 자원 이동
mv images/* assets/images/
mv data.json assets/data/

# 문서 이동
mv *.md docs/

# 개발용 파일 이동
mv debug*.html dev/
mv test-logo.svg dev/
```

### **Step 4: 설정 파일 생성**
```bash
# 서버 시작 스크립트 생성
cat > scripts/start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/.."
python3 -m http.server 8080 &
python3 src/backend/api_server.py &
echo "서버가 시작되었습니다."
echo "메인 페이지: http://localhost:8080/src/frontend/"
echo "관리자 페이지: http://localhost:8080/src/frontend/admin/dashboard.html"
EOF
chmod +x scripts/start.sh
```

---

## ⚠️ 주의사항

### **경로 참조 수정 필요**
1. **HTML 파일 내 경로**: `images/` → `../../assets/images/`
2. **API 서버 경로**: `data.json` → `../assets/data/data.json`
3. **문서 내 경로**: 모든 문서의 파일 경로 업데이트

### **테스트 필요**
1. **서버 시작 테스트**: 새로운 경로에서 서버 정상 시작 확인
2. **페이지 로딩 테스트**: 모든 페이지 정상 로딩 확인
3. **이미지 로딩 테스트**: 이미지 파일 정상 표시 확인
4. **API 연동 테스트**: API 서버 정상 동작 확인

---

## 📊 정리 효과

### **개선 사항**
- ✅ **명확한 구조**: 역할별 디렉토리 분리
- ✅ **유지보수성**: 파일 위치 예측 가능
- ✅ **확장성**: 새로운 기능 추가 시 구조 확장 용이
- ✅ **문서화**: 모든 문서 중앙 집중 관리
- ✅ **개발 효율성**: 개발/프로덕션 파일 분리

### **예상 결과**
- **루트 디렉토리**: 15개 파일 → 5개 디렉토리
- **파일 분류**: 역할별 명확한 분류
- **문서 관리**: 중앙 집중식 문서 관리
- **개발 환경**: 개발/프로덕션 환경 분리

---

**📅 계획 수립일**: 2025-10-25  
**👨‍💻 작성자**: AI Assistant  
**🎯 목표**: 체계적이고 확장 가능한 프로젝트 구조 구축
