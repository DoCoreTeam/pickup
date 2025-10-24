#!/usr/bin/env python3
import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import uuid
from datetime import datetime

# 로그 레벨 정의
class LogLevel:
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    DEBUG = "DEBUG"

def log(level, message, data=None):
    """구조화된 로그 출력"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if data:
        print(f"[{timestamp}] [{level}] {message} | {data}")
    else:
        print(f"[{timestamp}] [{level}] {message}")

def log_request(method, path, status_code, response_time=None):
    """HTTP 요청 로그"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if response_time:
        print(f"[{timestamp}] [{LogLevel.INFO}] {method} {path} -> {status_code} ({response_time}ms)")
    else:
        print(f"[{timestamp}] [{LogLevel.INFO}] {method} {path} -> {status_code}")

def log_error(error_message, exception=None):
    """에러 로그"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if exception:
        print(f"[{timestamp}] [{LogLevel.ERROR}] {error_message} | {str(exception)}")
    else:
        print(f"[{timestamp}] [{LogLevel.ERROR}] {error_message}")

class DataHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.data_file = 'assets/data/data.json'
        super().__init__(*args, **kwargs)
    
    def log_message(self, format, *args):
        """기본 로그 메시지 비활성화 (우리가 직접 관리)"""
        pass
    
    def load_data(self):
        """데이터 파일 로드"""
        try:
            if os.path.exists(self.data_file):
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    log(LogLevel.DEBUG, f"데이터 파일 로드 성공: {self.data_file}")
                    return data
            else:
                log(LogLevel.WARN, f"데이터 파일이 존재하지 않음: {self.data_file}")
                return {
                    "stores": [],
                    "currentStoreId": None,
                    "settings": {},
                    "deliveryOrders": {},
                    "images": {}
                }
        except Exception as e:
            log_error(f"데이터 파일 로드 실패: {self.data_file}", e)
            return {
                "stores": [],
                "currentStoreId": None,
                "settings": {},
                "deliveryOrders": {},
                "images": {}
            }
    
    def save_data(self, data):
        """데이터 파일 저장"""
        try:
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            log(LogLevel.DEBUG, f"데이터 파일 저장 성공: {self.data_file}")
        except Exception as e:
            log_error(f"데이터 파일 저장 실패: {self.data_file}", e)
    
    def serve_static_file(self, path):
        """정적 파일 서빙"""
        import mimetypes
        import os
        
        # 루트 경로 처리
        if path == '/':
            path = '/index.html'
        
        # 파일 경로 생성
        file_path = '.' + path
        
        # 보안 검사: 상위 디렉토리 접근 방지
        if '..' in path or not os.path.exists(file_path) or not os.path.isfile(file_path):
            log(LogLevel.WARN, f"파일을 찾을 수 없음: {path}")
            self.send_response(404)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<h1>404 - File Not Found</h1>')
            return
        
        try:
            # MIME 타입 결정
            mime_type, _ = mimetypes.guess_type(file_path)
            if mime_type is None:
                mime_type = 'application/octet-stream'
            
            # 파일 읽기
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # 응답 전송
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            
            log(LogLevel.INFO, f"정적 파일 서빙: {path} ({mime_type})")
            
        except Exception as e:
            log_error(f"정적 파일 서빙 실패: {path}", e)
            self.send_response(500)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<h1>500 - Internal Server Error</h1>')
    
    def send_json_response(self, data, status=200):
        """JSON 응답 전송"""
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def get_request_data(self):
        """POST 요청 데이터 읽기"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            log(LogLevel.DEBUG, f"POST 요청 데이터 수신", data)
            return data
        except Exception as e:
            log_error("POST 요청 데이터 파싱 실패", e)
            return None
    
    def do_GET(self):
        """GET 요청 처리"""
        import time
        start_time = time.time()
        
        try:
            # self.path가 리스트인 경우 문자열로 변환
            path = self.path if isinstance(self.path, str) else str(self.path)
            parsed_path = urlparse(path)
            
            log(LogLevel.INFO, f"GET 요청 수신: {parsed_path.path}")
            
        except Exception as e:
            log_error(f"경로 파싱 오류: {self.path}", e)
            self.send_response(400)
            self.end_headers()
            return
        
        try:
            if parsed_path.path == '/api/data':
                # 전체 데이터 반환
                data = self.load_data()
                self.send_json_response(data)
            
            elif parsed_path.path == '/api/stores':
                # 가게 목록 반환
                data = self.load_data()
                self.send_json_response(data['stores'])
            
            elif parsed_path.path == '/api/current-store':
                # 현재 선택된 가게 반환
                data = self.load_data()
                current_store = None
                if data['currentStoreId']:
                    current_store = next((store for store in data['stores'] if store['id'] == data['currentStoreId']), None)
                self.send_json_response(current_store)
            
            elif parsed_path.path.startswith('/api/settings'):
                # 설정 조회
                query_params = parse_qs(parsed_path.query)
                store_id = query_params.get('storeId', [None])[0]
                
                log(LogLevel.INFO, f"설정 조회 요청: storeId={store_id}")
                
                if not store_id:
                    log(LogLevel.WARN, "storeId 파라미터 누락")
                    self.send_json_response({"error": "storeId is required"}, 400)
                    return
                
                data = self.load_data()
                
                # 해당 가게의 설정이 없으면 가게 정보를 기반으로 기본값 생성
                if store_id not in data['settings']:
                    log(LogLevel.INFO, f"기본 설정 생성: {store_id}")
                    # 가게 정보 찾기
                    store_info = None
                    for store in data['stores']:
                        if store['id'] == store_id:
                            store_info = store
                            break
                    
                    if store_info:
                        # 가게 정보를 기반으로 기본 설정 생성
                        data['settings'][store_id] = {
                            "basic": {
                                "storeName": store_info.get('name', ''),
                                "storeSubtitle": store_info.get('subtitle', ''),
                                "storePhone": store_info.get('phone', ''),
                                "storeAddress": store_info.get('address', '')
                            },
                            "discount": {
                                "discountEnabled": False,
                                "discountTitle": "할인 이벤트",
                                "discountDescription": "할인 내용을 입력하세요"
                            },
                            "delivery": {
                                "ttaengUrl": "",
                                "baeminUrl": "",
                                "coupangUrl": "",
                                "yogiyoUrl": "",
                                "deliveryOrder": ["ttaeng", "baemin", "coupang", "yogiyo"]
                            },
                            "pickup": {
                                "pickupEnabled": False,
                                "pickupTitle": "픽업 안내",
                                "pickupDescription": "픽업 안내 내용을 입력하세요"
                            },
                            "images": {
                                "mainLogo": "",
                                "menuImage": ""
                            }
                        }
                        self.save_data(data)
                    else:
                        log(LogLevel.WARN, f"가게 정보를 찾을 수 없음: {store_id}")
                        self.send_json_response({"error": "Store not found"}, 404)
                        return
                
                self.send_json_response(data['settings'][store_id])
            
            elif parsed_path.path == '/api/superadmin/info':
                # 슈퍼어드민 정보 반환
                data = self.load_data()
                superadmin_info = data.get('superadmin', {})
                self.send_json_response(superadmin_info)
            
            else:
                # 정적 파일 서빙 (API가 아닌 경우)
                self.serve_static_file(parsed_path.path)
                
        except Exception as e:
            log_error(f"GET 요청 처리 중 오류: {parsed_path.path}", e)
            self.send_json_response({"error": "Internal Server Error"}, 500)
        finally:
            response_time = int((time.time() - start_time) * 1000)
            log_request("GET", parsed_path.path, 200, response_time)
    
    def do_POST(self):
        """POST 요청 처리"""
        import time
        start_time = time.time()
        
        try:
            # self.path가 리스트인 경우 문자열로 변환
            path = self.path if isinstance(self.path, str) else str(self.path)
            parsed_path = urlparse(path)
            
            log(LogLevel.INFO, f"POST 요청 수신: {parsed_path.path}")
            
        except Exception as e:
            log_error(f"경로 파싱 오류: {self.path}", e)
            self.send_response(400)
            self.end_headers()
            return
        
        try:
            if parsed_path.path == '/api/stores':
                # 가게 생성
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                log(LogLevel.INFO, f"가게 생성 요청: {data.get('name', 'Unknown')}")
                
                # 새 가게 생성
                store_data = self.load_data()
                new_store = {
                    "id": f"store_{int(datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:10]}",
                    "name": data.get('name', ''),
                    "subtitle": data.get('subtitle', ''),
                    "phone": data.get('phone', ''),
                    "address": data.get('address', ''),
                    "createdAt": datetime.now().isoformat()
                }
                
                store_data['stores'].append(new_store)
                self.save_data(store_data)
                
                log(LogLevel.INFO, f"가게 생성 완료: {new_store['id']}")
                self.send_json_response({"success": True, "store": new_store})
            
            elif parsed_path.path == '/api/data':
                # 전체 데이터 업데이트 (가게 전환용)
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                log(LogLevel.INFO, f"전체 데이터 업데이트 요청")
                
                # 데이터 검증
                if 'currentStoreId' not in data:
                    self.send_json_response({"error": "currentStoreId is required"}, 400)
                    return
                
                # 데이터 저장
                self.save_data(data)
                self.send_json_response({"success": True, "message": "데이터가 업데이트되었습니다."})
                
            elif parsed_path.path == '/api/current-store':
                # 현재 가게 설정
                data = self.get_request_data()
                if not data or 'storeId' not in data:
                    self.send_json_response({"error": "storeId is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"현재 가게 설정: {data['storeId']}")
                
                store_data = self.load_data()
                store_data['currentStoreId'] = data['storeId']
                self.save_data(store_data)
                
                self.send_json_response({"success": True})
            
            elif parsed_path.path == '/api/stores/update':
                # 가게 정보 업데이트
                data = self.get_request_data()
                if not data or 'id' not in data:
                    self.send_json_response({"error": "store id is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"가게 정보 업데이트 요청: {data['id']}")
                
                store_data = self.load_data()
                store_found = False
                
                for i, store in enumerate(store_data['stores']):
                    if store['id'] == data['id']:
                        # 기존 가게 정보 업데이트
                        store_data['stores'][i] = {
                            **store,
                            **data,
                            'lastModified': datetime.now().isoformat()
                        }
                        store_found = True
                        break
                
                if not store_found:
                    self.send_json_response({"error": "store not found"}, 404)
                    return
                
                self.save_data(store_data)
                log(LogLevel.INFO, f"가게 정보 업데이트 완료: {data['id']}")
                self.send_json_response({"success": True, "message": "가게 정보가 업데이트되었습니다."})
            
            elif parsed_path.path.startswith('/api/settings'):
                # 설정 저장
                query_params = parse_qs(parsed_path.query)
                store_id = query_params.get('storeId', [None])[0]
                
                log(LogLevel.INFO, f"설정 저장 요청: storeId={store_id}")
                
                if not store_id:
                    log(LogLevel.WARN, "storeId 파라미터 누락")
                    self.send_json_response({"error": "storeId is required"}, 400)
                    return
                
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_data = self.load_data()
                store_data['settings'][store_id] = data
                self.save_data(store_data)
                
                log(LogLevel.INFO, f"설정 저장 완료: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path == '/api/superadmin/check':
                # 슈퍼어드민 로그인 확인
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                log(LogLevel.INFO, f"슈퍼어드민 로그인 시도: {data.get('username', 'Unknown')}")
                
                store_data = self.load_data()
                superadmin = store_data.get('superadmin', {})
                
                if (data.get('username') == superadmin.get('username') and 
                    data.get('password') == superadmin.get('password')):
                    log(LogLevel.INFO, f"슈퍼어드민 로그인 성공: {data.get('username')}")
                    self.send_json_response({"success": True, "message": "로그인 성공"})
                else:
                    log(LogLevel.WARN, f"슈퍼어드민 로그인 실패: {data.get('username')}")
                    self.send_json_response({"success": False, "message": "로그인 실패"})
            
            elif parsed_path.path == '/api/superadmin/update':
                # 슈퍼어드민 정보 업데이트
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                log(LogLevel.INFO, f"슈퍼어드민 정보 업데이트: {data.get('username', 'Unknown')}")
                
                store_data = self.load_data()
                store_data['superadmin'] = {
                    "username": data.get('username', ''),
                    "password": data.get('password', ''),
                    "createdAt": datetime.now().isoformat(),
                    "lastModified": datetime.now().isoformat()
                }
                self.save_data(store_data)
                
                log(LogLevel.INFO, f"슈퍼어드민 정보 업데이트 완료: {data.get('username')}")
                self.send_json_response({"success": True})
            
            else:
                log(LogLevel.WARN, f"알 수 없는 POST 경로: {parsed_path.path}")
                self.send_json_response({"error": "Not Found"}, 404)
                
        except Exception as e:
            log_error(f"POST 요청 처리 중 오류: {parsed_path.path}", e)
            self.send_json_response({"error": "Internal Server Error"}, 500)
        finally:
            response_time = int((time.time() - start_time) * 1000)
            log_request("POST", parsed_path.path, 200, response_time)
    
    def do_OPTIONS(self):
        """CORS preflight 요청 처리"""
        log(LogLevel.INFO, f"OPTIONS 요청 수신: {self.path}")
        
        # CORS 헤더 설정
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()
        
        log_request("OPTIONS", self.path, 200)
    
    def do_DELETE(self):
        """DELETE 요청 처리"""
        log(LogLevel.INFO, f"DELETE 요청 수신: {self.path}")
        
        try:
            if self.path.startswith('/api/stores/'):
                # 가게 삭제
                store_id = self.path.split('/')[-1]
                log(LogLevel.INFO, f"가게 삭제 요청: {store_id}")
                
                data = self.load_data()
                store_found = False
                
                # 가게 목록에서 해당 가게 찾기 및 삭제
                for i, store in enumerate(data['stores']):
                    if store['id'] == store_id:
                        # 현재 선택된 가게가 삭제되는 가게라면 선택 해제
                        if data.get('currentStoreId') == store_id:
                            data['currentStoreId'] = None
                            log(LogLevel.INFO, f"현재 선택된 가게 삭제로 인한 선택 해제: {store_id}")
                        
                        # 가게 삭제
                        deleted_store = data['stores'].pop(i)
                        store_found = True
                        log(LogLevel.INFO, f"가게 삭제 완료: {deleted_store.get('name', 'Unknown')}")
                        break
                
                if not store_found:
                    log(LogLevel.WARN, f"삭제할 가게를 찾을 수 없음: {store_id}")
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 해당 가게의 설정도 삭제
                if store_id in data.get('settings', {}):
                    del data['settings'][store_id]
                    log(LogLevel.INFO, f"가게 설정 삭제 완료: {store_id}")
                
                self.save_data(data)
                self.send_json_response({"success": True, "message": "가게가 삭제되었습니다."})
                
            else:
                log(LogLevel.WARN, f"지원하지 않는 DELETE 경로: {self.path}")
                self.send_json_response({"error": "Not Found"}, 404)
                
        except Exception as e:
            log_error(f"DELETE 요청 처리 중 오류: {self.path}", e)
            self.send_json_response({"error": "Internal Server Error"}, 500)

def main():
    """메인 함수"""
    log(LogLevel.INFO, "API 서버 시작 중...")
    
    # Railway 환경 변수에서 포트 가져오기
    port = int(os.environ.get('PORT', 8081))
    
    try:
        server = HTTPServer(('', port), DataHandler)
        log(LogLevel.INFO, f"API 서버가 포트 {port}에서 시작되었습니다.")
        log(LogLevel.INFO, "서버 로그가 실시간으로 표시됩니다.")
        log(LogLevel.INFO, "서버 중지: Ctrl+C")
        print("=" * 60)
        
        server.serve_forever()
    except KeyboardInterrupt:
        log(LogLevel.INFO, "서버 중지 요청 수신")
    except Exception as e:
        log_error("서버 시작 실패", e)
    finally:
        log(LogLevel.INFO, "API 서버가 중지되었습니다.")

if __name__ == '__main__':
    main()