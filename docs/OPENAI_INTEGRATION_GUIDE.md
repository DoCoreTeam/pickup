# 🤖 OpenAI API 통합 가이드

**작성일**: 2025-10-26  
**버전**: v1.0  
**상태**: ✅ 준비 완료

---

## 🎯 개요

Pickup 프로젝트에 OpenAI API를 통합하여 다음 기능을 자동화할 수 있습니다:
- 📝 메뉴 설명 자동 생성
- 🎉 할인 안내 메시지 생성
- 📊 고객 피드백 분석
- 📍 픽업 안내 문구 생성

---

## 🔧 설정 방법

### 1. API 키 발급

1. **OpenAI 웹사이트 방문**
   ```
   https://platform.openai.com/api-keys
   ```

2. **API 키 생성**
   - "Create new secret key" 클릭
   - 키 이름 입력 (예: "pickup-project")
   - 생성된 키 복사 (⚠️ 한 번만 표시됩니다!)

3. **요금제 확인**
   ```
   https://platform.openai.com/account/billing/overview
   ```
   - 결제 수단 등록 필요
   - 사용량 기반 과금 (gpt-4o-mini 권장)

### 2. `.env` 파일 설정

`.env` 파일을 열고 발급받은 API 키를 입력하세요:

```bash
# OpenAI API 설정
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxx

# 사용할 모델 (선택사항)
OPENAI_MODEL=gpt-4o-mini

# API 요청 타임아웃 (초)
OPENAI_TIMEOUT=30

# 최대 토큰 수
OPENAI_MAX_TOKENS=1000

# Temperature (0.0 ~ 2.0, 낮을수록 일관적)
OPENAI_TEMPERATURE=0.7
```

### 3. 패키지 설치 확인

```bash
pip3 install -r requirements.txt
```

---

## 📚 사용 방법

### Python 백엔드에서 사용

```python
from src.backend.openai_helper import get_openai_helper

# OpenAI 헬퍼 인스턴스 가져오기
ai = get_openai_helper()

# 1. 메뉴 설명 생성
description = ai.generate_menu_description(
    menu_name="미친제육",
    ingredients=["제육", "고추장", "양파", "대파"]
)
print(description)
# 출력: "불맛 가득한 미친제육은 고추장 양념에 재운 제육을..."

# 2. 할인 메시지 생성
discount_msg = ai.generate_discount_message(
    discount_rate=20,
    menu_name="미친제육"
)
print(discount_msg)
# 출력: "🎉 지금 주문하시면 미친제육을 20% 할인된 가격에..."

# 3. 고객 피드백 분석
analysis = ai.analyze_customer_feedback(
    "음식이 정말 맛있었어요! 다만 배달이 조금 늦었습니다."
)
print(analysis)
# 출력: {
#   "sentiment": "positive",
#   "keywords": ["맛있다", "배달", "늦다"],
#   "suggestions": ["배달 시간 개선"]
# }

# 4. 픽업 안내 생성
pickup_info = ai.generate_pickup_instructions(
    store_address="경기도 구리시 수택동 474",
    special_notes="1층 카운터에서 주문번호를 말씀해주세요"
)
print(pickup_info)
# 출력: "경기도 구리시 수택동 474에 위치한 매장 1층..."
```

---

## 🔌 API 엔드포인트 추가 예시

### 메뉴 설명 자동 생성 API

`src/backend/api_server.py`에 다음 엔드포인트 추가:

```python
from src.backend.openai_helper import get_openai_helper

# POST /api/ai/generate-menu-description
elif self.path == '/api/ai/generate-menu-description' and self.command == 'POST':
    try:
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        menu_name = data.get('menuName')
        ingredients = data.get('ingredients', [])
        
        if not menu_name:
            self.send_json_response({'error': '메뉴명이 필요합니다'}, 400)
            return
        
        # OpenAI로 설명 생성
        ai = get_openai_helper()
        description = ai.generate_menu_description(menu_name, ingredients)
        
        self.send_json_response({
            'success': True,
            'description': description
        }, 200)
        
    except Exception as e:
        print(f"❌ 메뉴 설명 생성 실패: {e}")
        self.send_json_response({'error': str(e)}, 500)
```

### 프론트엔드에서 호출

```javascript
// 메뉴 설명 자동 생성
async function generateMenuDescription(menuName, ingredients) {
    try {
        const response = await fetch('/api/ai/generate-menu-description', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                menuName: menuName,
                ingredients: ingredients
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.description;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('메뉴 설명 생성 실패:', error);
        throw error;
    }
}

// 사용 예시
const description = await generateMenuDescription('미친제육', ['제육', '고추장', '양파']);
console.log(description);
```

---

## 💰 비용 관리

### 모델별 가격 (2025년 기준)

| 모델 | 입력 (1M 토큰) | 출력 (1M 토큰) | 권장 용도 |
|------|----------------|----------------|----------|
| gpt-4o | $2.50 | $10.00 | 고급 분석 |
| gpt-4o-mini | $0.15 | $0.60 | 일반 사용 ✅ |
| gpt-3.5-turbo | $0.50 | $1.50 | 기본 사용 |

### 예상 비용 계산

**메뉴 설명 생성 (1회)**:
- 입력: ~100 토큰 ($0.000015)
- 출력: ~200 토큰 ($0.00012)
- **총 비용: ~$0.000135 (약 0.18원)**

**하루 100건 사용 시**:
- 일일 비용: ~$0.0135 (약 18원)
- 월간 비용: ~$0.40 (약 540원)

### 비용 절감 팁

1. **적절한 모델 선택**
   - 간단한 작업: `gpt-4o-mini` ✅
   - 복잡한 분석: `gpt-4o`

2. **토큰 수 제한**
   ```python
   max_tokens=200  # 출력 토큰 제한
   ```

3. **캐싱 활용**
   ```python
   # 동일한 요청은 캐시에서 반환
   cache = {}
   key = f"{menu_name}_{ingredients}"
   if key in cache:
       return cache[key]
   ```

4. **배치 처리**
   - 여러 메뉴를 한 번에 처리

---

## 🔒 보안 주의사항

### 1. API 키 보호

```bash
# .gitignore에 .env 추가 (이미 추가됨)
.env
```

### 2. 환경 변수 확인

```python
# API 키가 설정되지 않은 경우 에러 발생
if not self.api_key or self.api_key == 'your-api-key-here':
    raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")
```

### 3. Railway 배포 시

Railway 대시보드에서 환경 변수 설정:
```
OPENAI_API_KEY=sk-proj-xxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

---

## 🧪 테스트

### 기본 테스트

```bash
cd /Users/dohyeonkim/pickup
python3 -c "
from src.backend.openai_helper import get_openai_helper

ai = get_openai_helper()
print('✅ OpenAI 연결 성공!')

# 간단한 테스트
result = ai.chat_completion([
    {'role': 'user', 'content': '안녕하세요!'}
])
print(f'응답: {result}')
"
```

### 메뉴 설명 생성 테스트

```bash
python3 -c "
from src.backend.openai_helper import get_openai_helper

ai = get_openai_helper()
description = ai.generate_menu_description('미친제육', ['제육', '고추장'])
print(f'생성된 설명: {description}')
"
```

---

## 📊 활용 시나리오

### 1. 자동 메뉴 설명 생성
- 관리자가 메뉴 이름만 입력
- AI가 매력적인 설명 자동 생성
- 시간 절약 + 일관된 품질

### 2. 할인 이벤트 문구 생성
- 할인율과 메뉴만 입력
- AI가 고객 유치용 문구 생성
- 마케팅 효율 향상

### 3. 고객 피드백 자동 분석
- 고객 리뷰 자동 분류
- 긍정/부정 감정 분석
- 개선점 자동 추출

### 4. 픽업 안내 자동화
- 주소와 특이사항만 입력
- AI가 명확한 안내 문구 생성
- 고객 만족도 향상

---

## 🚀 다음 단계

### 즉시 사용 가능
1. ✅ `.env` 파일에 API 키 입력
2. ✅ Python 코드에서 `get_openai_helper()` 호출
3. ✅ 원하는 기능 사용

### 추가 개발 필요
1. ⏳ API 엔드포인트 추가 (`api_server.py`)
2. ⏳ 프론트엔드 UI 추가 (`dashboard.html`)
3. ⏳ 캐싱 시스템 구현
4. ⏳ 에러 처리 강화

---

## 📞 지원 및 문의

**OpenAI 공식 문서**: https://platform.openai.com/docs  
**API 레퍼런스**: https://platform.openai.com/docs/api-reference  
**커뮤니티**: https://community.openai.com

---

## 🎉 결론

OpenAI API 통합으로 다음과 같은 이점을 얻을 수 있습니다:

✅ **시간 절약**: 메뉴 설명, 안내 문구 자동 생성  
✅ **품질 향상**: 일관되고 매력적인 콘텐츠  
✅ **고객 만족**: 명확한 안내와 분석 기반 개선  
✅ **비용 효율**: gpt-4o-mini 사용 시 매우 저렴

**🚀 지금 바로 `.env` 파일에 API 키를 입력하고 시작하세요!**

---

**마지막 업데이트**: 2025-10-26  
**다음 업데이트**: API 엔드포인트 추가 및 프론트엔드 통합

