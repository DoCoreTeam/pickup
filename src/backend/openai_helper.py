#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenAI API 헬퍼 모듈
"""

import os
from dotenv import load_dotenv
from openai import OpenAI
import json

# .env 파일 로드
load_dotenv()

class OpenAIHelper:
    """OpenAI API를 사용하기 위한 헬퍼 클래스"""
    
    def __init__(self):
        """초기화"""
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
        self.timeout = int(os.getenv('OPENAI_TIMEOUT', '30'))
        self.max_tokens = int(os.getenv('OPENAI_MAX_TOKENS', '1000'))
        self.temperature = float(os.getenv('OPENAI_TEMPERATURE', '0.7'))
        
        if not self.api_key or self.api_key == 'your-api-key-here':
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        
        self.client = OpenAI(api_key=self.api_key, timeout=self.timeout)
    
    def chat_completion(self, messages, **kwargs):
        """
        채팅 완성 API 호출
        
        Args:
            messages (list): 메시지 리스트 [{"role": "user", "content": "..."}]
            **kwargs: 추가 파라미터 (temperature, max_tokens 등)
        
        Returns:
            str: AI 응답 텍스트
        """
        try:
            response = self.client.chat.completions.create(
                model=kwargs.get('model', self.model),
                messages=messages,
                temperature=kwargs.get('temperature', self.temperature),
                max_tokens=kwargs.get('max_tokens', self.max_tokens)
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"❌ OpenAI API 오류: {e}")
            raise
    
    def generate_menu_description(self, menu_name, ingredients=None):
        """
        메뉴 설명 자동 생성
        
        Args:
            menu_name (str): 메뉴 이름
            ingredients (list, optional): 재료 리스트
        
        Returns:
            str: 생성된 메뉴 설명
        """
        prompt = f"다음 메뉴에 대한 매력적인 설명을 한글로 2-3문장으로 작성해주세요:\n\n메뉴명: {menu_name}"
        
        if ingredients:
            prompt += f"\n재료: {', '.join(ingredients)}"
        
        prompt += "\n\n고객이 주문하고 싶어지는 맛있는 설명을 작성해주세요."
        
        messages = [{"role": "user", "content": prompt}]
        return self.chat_completion(messages, max_tokens=200)
    
    def generate_discount_message(self, discount_rate, menu_name=None):
        """
        할인 안내 메시지 자동 생성
        
        Args:
            discount_rate (int): 할인율 (%)
            menu_name (str, optional): 특정 메뉴명
        
        Returns:
            str: 생성된 할인 메시지
        """
        if menu_name:
            prompt = f"{menu_name} 메뉴를 {discount_rate}% 할인하는 이벤트 안내 메시지를 작성해주세요. 고객의 관심을 끌 수 있도록 매력적으로 작성해주세요."
        else:
            prompt = f"전체 메뉴 {discount_rate}% 할인 이벤트 안내 메시지를 작성해주세요. 고객의 관심을 끌 수 있도록 매력적으로 작성해주세요."
        
        messages = [{"role": "user", "content": prompt}]
        return self.chat_completion(messages, max_tokens=200)
    
    def analyze_customer_feedback(self, feedback_text):
        """
        고객 피드백 분석
        
        Args:
            feedback_text (str): 고객 피드백 텍스트
        
        Returns:
            dict: 분석 결과 (감정, 주요 키워드, 개선 제안)
        """
        prompt = f"""다음 고객 피드백을 분석하여 JSON 형식으로 결과를 제공해주세요:

피드백: {feedback_text}

분석 항목:
1. sentiment: 긍정(positive), 중립(neutral), 부정(negative)
2. keywords: 주요 키워드 리스트
3. suggestions: 개선 제안 리스트

JSON 형식으로만 응답해주세요."""
        
        messages = [{"role": "user", "content": prompt}]
        response = self.chat_completion(messages, max_tokens=300)
        
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                "sentiment": "neutral",
                "keywords": [],
                "suggestions": ["분석 실패"]
            }
    
    def generate_pickup_instructions(self, store_address, special_notes=None):
        """
        픽업 안내 문구 자동 생성
        
        Args:
            store_address (str): 가게 주소
            special_notes (str, optional): 특별 안내사항
        
        Returns:
            str: 생성된 픽업 안내
        """
        prompt = f"""다음 정보를 바탕으로 고객이 쉽게 이해할 수 있는 픽업 안내 문구를 작성해주세요:

주소: {store_address}"""
        
        if special_notes:
            prompt += f"\n특별 안내: {special_notes}"
        
        prompt += "\n\n친절하고 명확한 안내 문구를 2-3문장으로 작성해주세요."
        
        messages = [{"role": "user", "content": prompt}]
        return self.chat_completion(messages, max_tokens=200)


# 싱글톤 인스턴스
_openai_helper = None

def get_openai_helper():
    """OpenAI 헬퍼 싱글톤 인스턴스 반환"""
    global _openai_helper
    if _openai_helper is None:
        _openai_helper = OpenAIHelper()
    return _openai_helper

