#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AI 콘텐츠 생성기
OpenAI API를 사용하여 가게의 할인 설정과 픽업 안내 자동 생성
"""

import os
import json
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

class AIContentGenerator:
    def __init__(self):
        """AI 콘텐츠 생성기 초기화"""
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")
        
        self.client = OpenAI(api_key=api_key)
        self.model = "gpt-4o-mini"  # 비용 효율적인 모델
        
        # 시스템 프롬프트 (학습 데이터)
        self.system_prompt = """
당신은 한국의 음식점 마케팅 전문가입니다. 
가게 이름을 보고 업종을 파악하여, 고객들이 매력적으로 느낄 수 있는 할인 안내와 픽업 안내 문구를 작성합니다.

**작성 원칙:**
1. 가게 이름에서 업종을 정확히 파악 (예: "미친제육" → 제육볶음 전문점)
2. 해당 업종의 특성을 반영한 자연스러운 문구
3. 고객 입장에서 매력적이고 신뢰감 있는 표현
4. UI를 헤치지 않는 적절한 길이 (할인 제목 15자 이내, 설명 50자 이내, 픽업 제목 20자 이내, 설명 80자 이내)
5. 과장되지 않고 실제로 사용 가능한 현실적인 내용
6. 한국 음식점 문화와 고객 심리를 반영

**학습 데이터 (고객 작성 예시):**
- 제육볶음 전문점: "포장 주문 10% 할인", "매장에서 먹는 것보다 더 저렴하게!"
- 치킨집: "포장 시 2,000원 할인", "전화 주문 후 방문 픽업하시면 할인!"
- 분식집: "포장 주문 5% 할인", "학생 할인 추가 제공"
- 카페: "테이크아웃 500원 할인", "일회용품 절약으로 환경도 지키고 할인도 받으세요"

**출력 형식:**
반드시 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 순수 JSON만 출력하세요.
```json
{
    "discount": {
        "title": "할인 제목 (15자 이내)",
        "description": "할인 설명 (50자 이내)"
    },
    "pickup": {
        "title": "픽업 안내 제목 (20자 이내)",
        "description": "픽업 안내 설명 (80자 이내)"
    },
    "analysis": {
        "category": "파악된 업종",
        "reasoning": "이렇게 작성한 이유"
    }
}
```
"""
    
    def generate_content(self, store_name, existing_examples=None):
        """
        가게 이름을 기반으로 할인 설정과 픽업 안내 자동 생성
        
        Args:
            store_name (str): 가게 이름
            existing_examples (list): 기존 고객 작성 예시 (학습용)
        
        Returns:
            dict: 생성된 콘텐츠
        """
        try:
            # 사용자 프롬프트 구성
            user_prompt = f"가게 이름: {store_name}\n\n"
            
            # 기존 고객 작성 예시가 있으면 학습 데이터로 추가
            if existing_examples:
                user_prompt += "**참고할 실제 고객 작성 예시:**\n"
                for example in existing_examples:
                    user_prompt += f"- {example['storeName']}: "
                    user_prompt += f"할인({example.get('discountTitle', '')}: {example.get('discountDescription', '')}), "
                    user_prompt += f"픽업({example.get('pickupTitle', '')}: {example.get('pickupDescription', '')})\n"
                user_prompt += "\n"
            
            user_prompt += "위 가게의 할인 설정과 픽업 안내를 JSON 형식으로 작성해주세요."
            
            # OpenAI API 호출
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,  # 창의성과 일관성의 균형
                max_tokens=500,
                response_format={"type": "json_object"}  # JSON 모드 강제
            )
            
            # 응답 파싱
            content = response.choices[0].message.content
            result = json.loads(content)
            
            # 로그 기록
            print(f"[AI] 가게 '{store_name}' 콘텐츠 생성 완료")
            print(f"[AI] 분석: {result.get('analysis', {})}")
            
            return {
                "success": True,
                "data": result,
                "timestamp": datetime.now().isoformat(),
                "model": self.model
            }
            
        except json.JSONDecodeError as e:
            print(f"[AI ERROR] JSON 파싱 실패: {e}")
            print(f"[AI ERROR] 응답 내용: {content}")
            return {
                "success": False,
                "error": "AI 응답을 파싱할 수 없습니다.",
                "details": str(e)
            }
        except Exception as e:
            print(f"[AI ERROR] 콘텐츠 생성 실패: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def improve_content(self, store_name, current_content, feedback=None):
        """
        기존 콘텐츠를 개선
        
        Args:
            store_name (str): 가게 이름
            current_content (dict): 현재 콘텐츠
            feedback (str): 개선 요청 사항 (선택)
        
        Returns:
            dict: 개선된 콘텐츠
        """
        try:
            user_prompt = f"가게 이름: {store_name}\n\n"
            user_prompt += "**현재 콘텐츠:**\n"
            user_prompt += f"할인: {current_content.get('discountTitle', '')} - {current_content.get('discountDescription', '')}\n"
            user_prompt += f"픽업: {current_content.get('pickupTitle', '')} - {current_content.get('pickupDescription', '')}\n\n"
            
            if feedback:
                user_prompt += f"**개선 요청:** {feedback}\n\n"
            
            user_prompt += "위 콘텐츠를 더 매력적이고 효과적으로 개선하여 JSON 형식으로 작성해주세요."
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.8,  # 개선 시 더 창의적으로
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            result = json.loads(content)
            
            print(f"[AI] 가게 '{store_name}' 콘텐츠 개선 완료")
            
            return {
                "success": True,
                "data": result,
                "timestamp": datetime.now().isoformat(),
                "model": self.model
            }
            
        except Exception as e:
            print(f"[AI ERROR] 콘텐츠 개선 실패: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# 싱글톤 인스턴스
_generator = None

def get_generator():
    """AI 콘텐츠 생성기 싱글톤 인스턴스 반환"""
    global _generator
    if _generator is None:
        _generator = AIContentGenerator()
    return _generator


