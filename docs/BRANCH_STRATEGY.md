# 브랜치 전략 및 배포 가이드

## 📋 브랜치 구조

### `main` 브랜치 (프로덕션)
- **용도**: 고객이 실제로 사용하는 프로덕션 환경
- **배포**: Railway 프로덕션 서비스에 자동 배포
- **특징**: 
  - 안정적인 코드만 머지
  - 모든 테스트 통과 후 배포
  - 버그 수정 및 핫픽스만 허용

### `staging` 브랜치 (스테이징)
- **용도**: 개발 및 테스트 환경
- **배포**: Railway 스테이징 서비스에 자동 배포 (별도 프로젝트/서비스)
- **특징**:
  - 신규 기능 개발 및 테스트
  - 버그 수정 및 실험적 기능
  - QA 및 통합 테스트

## 🚀 개발 워크플로우

### 1. 신규 기능 개발
```bash
# staging 브랜치에서 작업
git checkout staging
git pull origin staging

# 기능 브랜치 생성 (선택사항)
git checkout -b feature/새기능이름

# 개발 및 커밋
git add .
git commit -m "feat: 새 기능 추가"

# staging 브랜치에 머지
git checkout staging
git merge feature/새기능이름
git push origin staging
```

### 2. 프로덕션 배포
```bash
# staging에서 테스트 완료 후
git checkout main
git pull origin main

# staging 브랜치를 main에 머지
git merge staging

# ⚠️ 중요: 버전 배지에서 -staging 접미사 제거
# admin/dashboard.html에서 v1.5.XX-staging → v1.5.XX로 변경
# 예: v1.5.84-staging → v1.5.84

git add admin/dashboard.html
git commit -m "chore(prod) [v1.5.XX]: 버전 배지 프로덕션 형식으로 변경"
git push origin main
```

### 3. 긴급 버그 수정 (핫픽스)
```bash
# main 브랜치에서 직접 수정
git checkout main
git checkout -b hotfix/버그이름

# 수정 및 커밋
git add .
git commit -m "fix: 긴급 버그 수정"

# main에 머지 후 배포
git checkout main
git merge hotfix/버그이름
git push origin main

# staging에도 반영
git checkout staging
git merge hotfix/버그이름
git push origin staging
```

## 🏗️ Railway 배포 설정

### 스테이징 환경 설정
1. Railway 대시보드에서 새 프로젝트 생성 (또는 기존 프로젝트에 새 서비스 추가)
2. GitHub 저장소 연결
3. **브랜치 선택**: `staging` 브랜치 선택
4. 환경 변수 설정:
   ```bash
   NODE_ENV=staging
   DATABASE_URL=<스테이징 DB URL>
   # 기타 필요한 환경 변수
   ```

### 프로덕션 환경 설정
1. Railway 대시보드에서 프로덕션 프로젝트 선택
2. GitHub 저장소 연결
3. **브랜치 선택**: `main` 브랜치 선택
4. 환경 변수 설정:
   ```bash
   NODE_ENV=production
   DATABASE_URL=<프로덕션 DB URL>
   # 기타 필요한 환경 변수
   ```

## ⚠️ 중요 사항

1. **절대 main 브랜치에 직접 커밋하지 않기**
   - 모든 변경사항은 staging에서 테스트 후 main으로 머지
   - 메인 반영 후 다시 고쳐지는 것도 staging에서 작업

2. **환경 변수 분리**
   - 스테이징과 프로덕션은 서로 다른 데이터베이스 사용
   - 민감한 정보는 각 환경에 맞게 설정

3. **버전 배지 관리 규칙** ⭐
   - **staging 브랜치**: `v1.5.XX-staging` 형식 (예: `v1.5.84-staging`)
   - **main 브랜치**: `v1.5.XX` 형식 (예: `v1.5.84`)
   - 버전 배지는 항상 업데이트 (작업 후 기본 정책)
   - 메인으로 머지할 때는 `-staging` 접미사 제거
   - 프로덕션 배포 시 태그 생성 권장

4. **테스트 필수**
   - staging에서 충분히 테스트 후 main으로 머지
   - 프로덕션 배포 전 최종 확인

## 📝 버전 태그 관리 (선택사항)

```bash
# 프로덕션 배포 시 태그 생성
git tag -a v1.5.81 -m "프로덕션 배포 v1.5.81"
git push origin v1.5.81
```

