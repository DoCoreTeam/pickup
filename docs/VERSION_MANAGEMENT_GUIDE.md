# 버전 관리 및 릴리즈 가이드

## 📋 개요

이 문서는 프로젝트의 버전을 업데이트하고 릴리즈 노트를 작성하는 방법을 설명합니다.  
**앞으로 이 가이드만 따라하면 자동으로 버전과 릴리즈 노트가 업데이트됩니다.**

---

## 🎯 릴리즈 체크리스트

새 버전을 릴리즈할 때 다음 3개 파일만 수정하면 됩니다:

### 1️⃣ `assets/data/data.json` - 릴리즈 노트 추가
### 2️⃣ `admin/dashboard.html` - 버전 번호 업데이트
### 3️⃣ `docs/RELEASE_NOTES_vX.X.X.md` - 상세 릴리즈 노트 작성

---

## 📝 상세 가이드

### 1️⃣ data.json에 릴리즈 노트 추가

**파일**: `assets/data/data.json`  
**위치**: `releaseNotes` 배열의 **맨 앞**에 추가 (최신순)

```json
{
  "releaseNotes": [
    {
      "version": "1.5.0",  // 새 버전 번호
      "codename": "Performance Boost",  // 코드명 (선택)
      "releaseDate": "2025-10-27",  // YYYY-MM-DD 형식
      "title": "서버 사이드 페이지네이션 & 성능 개선",  // 한 줄 요약
      "highlights": [  // 주요 하이라이트 (3-5개)
        "서버 사이드 페이지네이션 (1000+ 가게 대응)",
        "고급 필터 (날짜 범위, 복합 조건)",
        "일괄 편집 (선택한 가게 필드 일괄 수정)",
        "CSV 커스텀 필드 선택"
      ],
      "features": [  // 새로운 기능 (카테고리별)
        {
          "category": "성능 개선",
          "items": [
            "서버 사이드 페이지네이션",
            "인덱싱으로 검색 속도 10배 향상",
            "캐싱으로 API 응답 속도 5배 향상"
          ]
        },
        {
          "category": "고급 필터",
          "items": [
            "날짜 범위 필터 (생성일, 수정일)",
            "복합 조건 필터 (AND/OR)",
            "저장된 필터 프리셋"
          ]
        }
      ],
      "improvements": [  // 개선 사항
        "UI 애니메이션 부드럽게 개선",
        "에러 메시지 더 명확하게 표시",
        "로딩 상태 스켈레톤 UI 추가"
      ],
      "bugFixes": [  // 버그 수정
        "대량 삭제 시 간헐적 오류 수정",
        "CSV 내보내기 특수문자 깨짐 수정",
        "모바일 사이드바 스크롤 문제 해결"
      ],
      "createdAt": "2025-10-27T12:00:00.000000"  // ISO 8601 형식
    },
    // 이전 버전들...
  ]
}
```

#### 📌 필드 설명

| 필드 | 필수 | 설명 | 예시 |
|------|------|------|------|
| `version` | ✅ | 버전 번호 (Semantic Versioning) | `"1.5.0"` |
| `codename` | ⭕ | 릴리즈 코드명 | `"Performance Boost"` |
| `releaseDate` | ✅ | 릴리즈 날짜 (YYYY-MM-DD) | `"2025-10-27"` |
| `title` | ✅ | 릴리즈 제목 (한 줄 요약) | `"서버 사이드 페이지네이션"` |
| `highlights` | ✅ | 주요 하이라이트 (3-5개) | `["기능1", "기능2"]` |
| `features` | ✅ | 새로운 기능 (카테고리별) | `[{category, items}]` |
| `improvements` | ⭕ | 개선 사항 | `["개선1", "개선2"]` |
| `bugFixes` | ⭕ | 버그 수정 | `["수정1", "수정2"]` |
| `createdAt` | ✅ | 생성 시간 (ISO 8601) | `"2025-10-27T12:00:00"` |

---

### 2️⃣ dashboard.html 버전 업데이트

**파일**: `admin/dashboard.html`  
**위치**: 사이드바 하단 버전 뱃지

**찾기** (Cmd+F / Ctrl+F):
```html
<div class="version-badge">v1.4.0</div>
```

**변경**:
```html
<div class="version-badge">v1.5.0</div>
```

#### 🔍 정확한 위치
- 라인: ~1658줄 근처
- 경로: `사이드바 하단` → `sidebar-footer` → `version-info` → `version-badge`

---

### 3️⃣ 상세 릴리즈 노트 작성

**파일**: `docs/RELEASE_NOTES_vX.X.X.md` (새로 생성)  
**예시**: `docs/RELEASE_NOTES_v1.5.0.md`

**템플릿**:
```markdown
# Release Notes v1.5.0

## 📅 릴리즈 정보
- **버전**: v1.5.0
- **코드명**: "Performance Boost"
- **릴리즈 날짜**: 2025-10-27
- **타입**: Major Update / Minor Update / Patch

---

## 🎯 주요 하이라이트

1. **서버 사이드 페이지네이션** - 1000+ 가게 빠른 처리
2. **고급 필터** - 날짜 범위, 복합 조건
3. **일괄 편집** - 선택한 가게 필드 일괄 수정

---

## ✨ 새로운 기능

### 1. 서버 사이드 페이지네이션
- **설명**: 대량 데이터 처리 성능 향상
- **사용법**: 자동 적용 (기존과 동일한 UI)
- **성능**: 1000개 가게도 1초 이내 로딩

### 2. 고급 필터
- **날짜 범위 필터**: 생성일, 수정일 기준 필터링
- **복합 조건**: AND/OR 조건 조합
- **저장된 프리셋**: 자주 사용하는 필터 저장

---

## 🔧 개선 사항

- UI 애니메이션 부드럽게 개선
- 에러 메시지 더 명확하게 표시
- 로딩 상태 스켈레톤 UI 추가

---

## 🐛 버그 수정

1. **대량 삭제 오류**: 100개 이상 삭제 시 간헐적 오류 수정
2. **CSV 특수문자**: 쉼표, 따옴표 포함 시 깨짐 수정
3. **모바일 스크롤**: 사이드바 스크롤 문제 해결

---

## 📊 통계

- **추가된 코드**: ~500줄
- **새 파일**: 2개
- **수정된 파일**: 3개
- **새 API 엔드포인트**: 2개

---

## 🚀 업그레이드 가이드

### 1. 서버 재시작
\`\`\`bash
lsof -ti:8081 | xargs kill -9 2>/dev/null
cd /Users/dohyeonkim/pickup
python3 start.py > /tmp/pickup_server.log 2>&1 &
\`\`\`

### 2. 브라우저 캐시 클리어
- `Cmd + Shift + R` (Mac)
- `Ctrl + Shift + R` (Windows/Linux)

---

## 🔮 다음 버전 (v1.6.0) 계획

1. **실시간 알림**: WebSocket 기반 실시간 업데이트
2. **다국어 지원**: 영어, 일본어 추가
3. **테마 설정**: 다크 모드, 커스텀 테마

---

**v1.5.0 릴리즈 완료!** 🎉
```

---

## 🔢 버전 번호 규칙 (Semantic Versioning)

### 형식: `MAJOR.MINOR.PATCH`

#### MAJOR (주 버전)
- **언제**: 호환되지 않는 API 변경
- **예시**: `1.0.0` → `2.0.0`
- **사례**: 데이터베이스 스키마 변경, API 엔드포인트 제거

#### MINOR (부 버전)
- **언제**: 하위 호환되는 기능 추가
- **예시**: `1.4.0` → `1.5.0`
- **사례**: 새로운 기능 추가, 새로운 API 엔드포인트

#### PATCH (패치 버전)
- **언제**: 하위 호환되는 버그 수정
- **예시**: `1.4.0` → `1.4.1`
- **사례**: 버그 수정, 성능 개선, 문서 수정

### 📌 예시

| 변경 내용 | 버전 변경 |
|----------|----------|
| 버그 수정 | `1.4.0` → `1.4.1` |
| 새 기능 추가 | `1.4.0` → `1.5.0` |
| API 호환성 깨짐 | `1.4.0` → `2.0.0` |

---

## 🚀 릴리즈 프로세스

### 1단계: 코드 변경 완료
```bash
# 모든 변경사항 커밋
git add .
git commit -m "feat: 새 기능 추가"
```

### 2단계: 버전 업데이트
1. `assets/data/data.json` - 릴리즈 노트 추가
2. `admin/dashboard.html` - 버전 번호 업데이트
3. `docs/RELEASE_NOTES_vX.X.X.md` - 상세 릴리즈 노트 작성

### 3단계: 커밋 및 태그
```bash
# 버전 업데이트 커밋
git add assets/data/data.json admin/dashboard.html docs/RELEASE_NOTES_v1.5.0.md
git commit -m "chore: release v1.5.0"

# Git 태그 생성
git tag -a v1.5.0 -m "Release v1.5.0: Performance Boost"

# 푸시
git push origin main
git push origin v1.5.0
```

### 4단계: 서버 재시작
```bash
lsof -ti:8081 | xargs kill -9 2>/dev/null
cd /Users/dohyeonkim/pickup
python3 start.py > /tmp/pickup_server.log 2>&1 &
```

### 5단계: 확인
1. 브라우저에서 `http://localhost:8081/admin/dashboard.html` 접속
2. 사이드바 하단 버전 확인
3. 릴리즈 노트 버튼 클릭하여 새 버전 확인

---

## 📋 빠른 체크리스트

릴리즈 전에 다음을 확인하세요:

- [ ] `assets/data/data.json`에 새 릴리즈 노트 추가 (맨 앞)
- [ ] `admin/dashboard.html`의 버전 번호 업데이트
- [ ] `docs/RELEASE_NOTES_vX.X.X.md` 작성
- [ ] 모든 변경사항 커밋
- [ ] Git 태그 생성 (`v1.5.0`)
- [ ] 서버 재시작
- [ ] 브라우저에서 버전 확인
- [ ] 릴리즈 노트 페이지 확인

---

## 🎨 릴리즈 노트 작성 팁

### 좋은 예시 ✅
```markdown
- **서버 사이드 페이지네이션**: 1000개 이상 가게도 1초 이내 로딩
- **고급 필터**: 날짜 범위, 복합 조건으로 정확한 검색
- **CSV 한글 깨짐 수정**: UTF-8 BOM으로 엑셀 완벽 호환
```

### 나쁜 예시 ❌
```markdown
- 페이지네이션 추가
- 필터 개선
- 버그 수정
```

### 작성 원칙
1. **구체적으로**: "성능 개선" ❌ → "검색 속도 10배 향상" ✅
2. **사용자 관점**: "API 추가" ❌ → "대량 내보내기 기능" ✅
3. **숫자 활용**: "빠르게" ❌ → "1초 이내" ✅
4. **이모지 활용**: 가독성 향상 (적당히)

---

## 🔧 자동화 스크립트 (선택)

향후 Python 스크립트로 자동화 가능:

```python
# scripts/release.py
import json
from datetime import datetime

def create_release(version, title, highlights, features):
    # data.json 업데이트
    with open('assets/data/data.json', 'r+') as f:
        data = json.load(f)
        new_release = {
            "version": version,
            "releaseDate": datetime.now().strftime("%Y-%m-%d"),
            "title": title,
            "highlights": highlights,
            "features": features,
            # ...
        }
        data['releaseNotes'].insert(0, new_release)
        f.seek(0)
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # dashboard.html 업데이트
    # ...
    
    print(f"✅ Release {version} created!")

# 사용법
# python scripts/release.py --version 1.5.0 --title "Performance Boost"
```

---

## 📞 문의

버전 관리 관련 문의:
- 문서: 이 파일 참조
- 예시: `docs/RELEASE_NOTES_v1.4.0.md` 참조

---

**이 가이드만 따라하면 완벽한 릴리즈!** 🎉

