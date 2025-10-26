#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QR 코드 생성 모듈 (로고 합성 포함)
"""

import qrcode
from PIL import Image, ImageDraw
import os
import io
import base64
from datetime import datetime

class QRGenerator:
    """QR 코드 생성 및 로고 합성 클래스"""
    
    def __init__(self, output_dir='assets/images/qrcodes'):
        """
        초기화
        
        Args:
            output_dir (str): QR 코드 저장 디렉토리
        """
        self.output_dir = output_dir
        
        # 디렉토리가 없으면 생성
        os.makedirs(self.output_dir, exist_ok=True)
    
    def generate_qr(self, data, logo_path=None, size=1024, logo_size_ratio=0.25):
        """
        QR 코드 생성 (로고 합성 옵션)
        
        Args:
            data (str): QR 코드에 인코딩할 데이터 (URL 등)
            logo_path (str, optional): 로고 이미지 경로
            size (int): QR 코드 크기 (픽셀)
            logo_size_ratio (float): 로고 크기 비율 (0.2 ~ 0.3 권장)
        
        Returns:
            PIL.Image: 생성된 QR 코드 이미지
        """
        # QR 코드 생성
        qr = qrcode.QRCode(
            version=1,  # 1~40, None=자동
            error_correction=qrcode.constants.ERROR_CORRECT_H,  # 최고 수준 오류 정정 (로고 삽입 시 필수)
            box_size=10,
            border=4,
        )
        
        qr.add_data(data)
        qr.make(fit=True)
        
        # QR 이미지 생성
        qr_img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
        
        # 지정된 크기로 리사이즈
        qr_img = qr_img.resize((size, size), Image.Resampling.LANCZOS)
        
        # 로고가 있으면 합성
        if logo_path and os.path.exists(logo_path):
            qr_img = self._add_logo(qr_img, logo_path, logo_size_ratio)
        
        return qr_img
    
    def _add_logo(self, qr_img, logo_path, logo_size_ratio=0.25):
        """
        QR 코드 중앙에 로고 추가
        
        Args:
            qr_img (PIL.Image): QR 코드 이미지
            logo_path (str): 로고 이미지 경로
            logo_size_ratio (float): 로고 크기 비율
        
        Returns:
            PIL.Image: 로고가 합성된 QR 코드
        """
        try:
            # 로고 이미지 열기
            logo = Image.open(logo_path)
            
            # 로고를 RGBA로 변환 (투명도 지원)
            if logo.mode != 'RGBA':
                logo = logo.convert('RGBA')
            
            # QR 코드 크기
            qr_width, qr_height = qr_img.size
            
            # 로고 크기 계산
            logo_size = int(qr_width * logo_size_ratio)
            
            # 로고 리사이즈 (비율 유지)
            logo.thumbnail((logo_size, logo_size), Image.Resampling.LANCZOS)
            
            # 로고에 흰색 배경 추가 (QR 코드 가독성 향상)
            logo_with_bg = Image.new('RGBA', (logo.width + 20, logo.height + 20), 'white')
            logo_with_bg.paste(logo, (10, 10), logo)
            
            # 로고 위치 계산 (중앙)
            logo_pos = (
                (qr_width - logo_with_bg.width) // 2,
                (qr_height - logo_with_bg.height) // 2
            )
            
            # QR 코드에 로고 합성
            qr_img.paste(logo_with_bg, logo_pos, logo_with_bg)
            
            return qr_img
            
        except Exception as e:
            print(f"❌ 로고 합성 실패: {e}")
            # 로고 합성 실패 시 원본 QR 반환
            return qr_img
    
    def save_qr(self, qr_img, store_id, filename=None):
        """
        QR 코드 이미지 저장
        
        Args:
            qr_img (PIL.Image): QR 코드 이미지
            store_id (str): 가게 ID
            filename (str, optional): 파일명 (기본: qr_code_{timestamp}.png)
        
        Returns:
            str: 저장된 파일 경로
        """
        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'qr_code_{store_id}_{timestamp}.png'
        
        filepath = os.path.join(self.output_dir, filename)
        qr_img.save(filepath, 'PNG', quality=95)
        
        return filepath
    
    def generate_and_save(self, data, store_id, logo_path=None, size=1024):
        """
        QR 코드 생성 및 저장 (원스톱)
        
        Args:
            data (str): QR 코드 데이터
            store_id (str): 가게 ID
            logo_path (str, optional): 로고 경로
            size (int): QR 코드 크기
        
        Returns:
            dict: {
                'success': bool,
                'filepath': str,
                'url': str,
                'message': str
            }
        """
        try:
            # QR 코드 생성
            qr_img = self.generate_qr(data, logo_path, size)
            
            # 저장
            filepath = self.save_qr(qr_img, store_id)
            
            # 웹 접근 가능한 URL 생성
            relative_path = filepath.replace('assets/', '/assets/')
            
            return {
                'success': True,
                'filepath': filepath,
                'url': relative_path,
                'message': 'QR 코드가 성공적으로 생성되었습니다.'
            }
            
        except Exception as e:
            return {
                'success': False,
                'filepath': None,
                'url': None,
                'message': f'QR 코드 생성 실패: {str(e)}'
            }
    
    def qr_to_base64(self, qr_img):
        """
        QR 코드 이미지를 Base64로 인코딩
        
        Args:
            qr_img (PIL.Image): QR 코드 이미지
        
        Returns:
            str: Base64 인코딩된 문자열
        """
        buffer = io.BytesIO()
        qr_img.save(buffer, format='PNG')
        img_str = base64.b64encode(buffer.getvalue()).decode()
        return f"data:image/png;base64,{img_str}"


# 싱글톤 인스턴스
_qr_generator = None

def get_qr_generator():
    """QR 생성기 싱글톤 인스턴스 반환"""
    global _qr_generator
    if _qr_generator is None:
        _qr_generator = QRGenerator()
    return _qr_generator


