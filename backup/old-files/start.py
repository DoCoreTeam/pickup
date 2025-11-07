#!/usr/bin/env python3
"""
Railway 배포용 시작 스크립트
환경 변수와 포트 설정을 처리합니다.
"""

import os
import sys
import subprocess

def main():
    # Railway에서 제공하는 PORT 환경 변수 사용
    port = os.environ.get('PORT', '8081')
    
    # Python 경로 설정
    python_path = sys.executable
    
    # API 서버 실행
    server_script = 'src/backend/api_server.py'
    
    print(f"🚀 Railway 배포 시작")
    print(f"📡 포트: {port}")
    print(f"🐍 Python: {python_path}")
    print(f"📄 스크립트: {server_script}")
    
    # 환경 변수 설정
    env = os.environ.copy()
    env['PORT'] = port
    
    try:
        # API 서버 실행
        subprocess.run([python_path, server_script], env=env, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ 서버 시작 실패: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 서버 종료")
        sys.exit(0)

if __name__ == "__main__":
    main()
