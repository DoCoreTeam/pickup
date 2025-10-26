# 🤖 AI 콘텐츠 자동 생성 기능

**작성일**: 2025-10-26  
**버전**: v1.3.0  
**상태**: ✅ 완료

---

## 🎯 기능 개요

OpenAI API를 활용하여 가게 이름을 분석하고, 할인 설정과 픽업 안내를 자동으로 생성하는 AI 기능입니다.

---

## ✨ 주요 기능

### 1. **가게 이름 기반 자동 생성**
- 가게 이름에서 업종 자동 파악
- 업종 특성을 반영한 맞춤형 콘텐츠 생성
- UI를 헤치지 않는 적절한 길이로 작성

### 2. **고객 작성 예시 학습**
- 기존 고객들이 작성한 콘텐츠를 학습 데이터로 활용
- 실제 사용 패턴을 반영하여 더 현실적인 콘텐츠 생성
- 최대 5개의 예시를 참고하여 품질 향상

### 3. **"AI 작성" 버튼**
- 할인 설정과 픽업 안내에 각각 버튼 배치
- 클릭 한 번으로 자동 생성 및 적용
- 나중에 다시 변경할 때도 AI 활용 가능

### 4. **상세한 활동 로그**
- AI 생성 내역을 활동 로그에 자동 기록
- 분석 결과 (업종, 이유) 포함
- 생성된 콘텐츠 전체 내용 저장

---

## 🏗️ 시스템 구조

### **Backend: `src/backend/ai_content_generator.py`**

```python
class AIContentGenerator:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.model = "gpt-4o-mini"  # 비용 효율적
        self.system_prompt = """
        당신은 한국의 음식점 마케팅 전문가입니다.
        가게 이름을 보고 업종을 파악하여, 고객들이 매력적으로 느낄 수 있는
        할인 안내와 픽업 안내 문구를 작성합니다.
        
        **작성 원칙:**
        1. 가게 이름에서 업종을 정확히 파악
        2. 해당 업종의 특성을 반영한 자연스러운 문구
        3. 고객 입장에서 매력적이고 신뢰감 있는 표현
        4. UI를 헤치지 않는 적절한 길이
        5. 과장되지 않고 실제로 사용 가능한 현실적인 내용
        6. 한국 음식점 문화와 고객 심리를 반영
        """
    
    def generate_content(self, store_name, existing_examples=None):
        """가게 이름을 기반으로 할인 설정과 픽업 안내 자동 생성"""
        # 기존 고객 작성 예시를 학습 데이터로 추가
        # OpenAI API 호출 (JSON 모드)
        # 응답 파싱 및 반환
```

### **API Endpoint: `/api/ai/generate-content`**

**Request**:
```json
{
    "storeName": "미친제육",
    "storeId": "store_1761341092507_93bc3d67dc"
}
```

**Response**:
```json
{
    "success": true,
    "data": {
        "discount": {
            "title": "포장 주문 10% 할인",
            "description": "매장에서 먹는 것보다 더 저렴하게 즐기세요!"
        },
        "pickup": {
            "title": "픽업 장소 안내",
            "description": "매장 1층 카운터에서 주문번호를 말씀해주시면 빠르게 받으실 수 있습니다."
        },
        "analysis": {
            "category": "제육볶음 전문점",
            "reasoning": "가게 이름에서 '제육'을 파악하여 제육볶음 전문점으로 분류했습니다."
        }
    },
    "timestamp": "2025-10-26T18:30:00.000Z",
    "model": "gpt-4o-mini"
}
```

### **Frontend: `admin/dashboard.html`**

**HTML**:
```html
<button onclick="generateAIContent('discount')" class="btn-ai" 
        title="AI가 가게 이름을 분석하여 자동으로 작성합니다">
    <span>✨</span> AI 작성
</button>
```

**JavaScript**:
```javascript
async function generateAIContent(type) {
    // 1. 현재 가게 정보 가져오기
    // 2. AI API 호출
    // 3. 생성된 콘텐츠를 폼 필드에 자동 입력
    // 4. 자동 저장
    // 5. 성공 메시지 표시 (업종 분석 결과 포함)
}
```

---

## 🎨 UI/UX

### **AI 작성 버튼 스타일**
- **배경**: 보라색 그라데이션 (`#667eea` → `#764ba2`)
- **아이콘**: ✨ (반짝이는 애니메이션)
- **호버 효과**: 위로 2px 이동, 그림자 강화
- **위치**: 할인 설정 / 픽업 안내 섹션 헤더 오른쪽

### **생성 과정 피드백**
1. **로딩**: "AI가 콘텐츠를 생성하고 있습니다..."
2. **성공**: "AI가 콘텐츠를 생성했습니다! 업종: 제육볶음 전문점"
3. **실패**: "AI 생성 실패: [오류 메시지]"

---

## 📊 학습 메커니즘

### **1. 기존 고객 작성 예시 수집**
```python
existing_examples = []
for store in db_data.get('stores', []):
    settings = db_data.get('settings', {}).get(store['id'], {})
    discount = settings.get('discount', {})
    pickup = settings.get('pickup', {})
    
    if discount.get('enabled') or pickup.get('enabled'):
        existing_examples.append({
            'storeName': store.get('name', ''),
            'discountTitle': discount.get('title', ''),
            'discountDescription': discount.get('description', ''),
            'pickupTitle': pickup.get('title', ''),
            'pickupDescription': pickup.get('description', '')
        })
```

### **2. AI에게 학습 데이터 제공**
```python
if existing_examples:
    user_prompt += "**참고할 실제 고객 작성 예시:**\n"
    for example in existing_examples:
        user_prompt += f"- {example['storeName']}: "
        user_prompt += f"할인({example.get('discountTitle', '')}: {example.get('discountDescription', '')}), "
        user_prompt += f"픽업({example.get('pickupTitle', '')}: {example.get('pickupDescription', '')})\n"
```

### **3. 지속적인 품질 향상**
- 고객이 직접 작성한 콘텐츠가 많아질수록 AI 품질 향상
- 실제 사용 패턴을 학습하여 더 현실적인 콘텐츠 생성
- 업종별 특성을 자동으로 학습

---

## 📝 활동 로그

### **로그 타입**: `ai`
### **색상**: 주황색 (`#f39c12`)

### **로그 내용 예시**:
```
[AI 콘텐츠 생성] 2025-10-26 18:30:00
'미친제육' 가게의 할인 설정과 픽업 안내를 AI가 자동 생성했습니다.
분석: 제육볶음 전문점 - 가게 이름에서 '제육'을 파악하여 제육볶음 전문점으로 분류했습니다.

details:
  model: gpt-4o-mini
  discountTitle: 포장 주문 10% 할인
  discountDescription: 매장에서 먹는 것보다 더 저렴하게 즐기세요!
  pickupTitle: 픽업 장소 안내
  pickupDescription: 매장 1층 카운터에서 주문번호를 말씀해주시면 빠르게 받으실 수 있습니다.
  analysis:
    category: 제육볶음 전문점
    reasoning: 가게 이름에서 '제육'을 파악하여 제육볶음 전문점으로 분류했습니다.
```

---

## 🎯 콘텐츠 생성 원칙

### **1. 길이 제한**
- **할인 제목**: 15자 이내
- **할인 설명**: 50자 이내
- **픽업 제목**: 20자 이내
- **픽업 설명**: 80자 이내

### **2. 톤 & 매너**
- 고객 입장에서 매력적
- 신뢰감 있는 표현
- 과장되지 않음
- 한국 문화 반영

### **3. 업종별 예시**

| 업종 | 할인 예시 | 픽업 예시 |
|------|----------|----------|
| **제육볶음 전문점** | 포장 주문 10% 할인 | 매장 1층 카운터에서 픽업 |
| **치킨집** | 포장 시 2,000원 할인 | 전화 주문 후 방문 픽업 |
| **분식집** | 포장 주문 5% 할인 | 학생 할인 추가 제공 |
| **카페** | 테이크아웃 500원 할인 | 일회용품 절약으로 환경 보호 |

---

## 🔧 기술 스택

- **AI 모델**: OpenAI GPT-4o-mini
- **언어**: Python 3.x
- **라이브러리**: `openai`, `python-dotenv`
- **API**: RESTful API (POST `/api/ai/generate-content`)
- **Frontend**: Vanilla JavaScript

---

## 💰 비용 효율성

- **모델**: `gpt-4o-mini` (비용 효율적)
- **토큰 제한**: 500 tokens (응답)
- **학습 데이터**: 최대 5개 예시로 제한
- **예상 비용**: 요청당 약 $0.001 ~ $0.003

---

## 🎉 결론

**OpenAI를 활용한 AI 자동 작성 기능 완성!**

- ✅ 가게 이름 기반 자동 생성
- ✅ 고객 작성 예시 학습
- ✅ "AI 작성" 버튼으로 간편 사용
- ✅ 지속적인 품질 향상
- ✅ 상세한 활동 로그 기록

**이제 가게 추가 시 AI가 자동으로 할인 설정과 픽업 안내를 작성해줍니다!** 🤖✨

---

**마지막 업데이트**: 2025-10-26 18:40  
**작성자**: AI Assistant  
**상태**: ✅ 완료


