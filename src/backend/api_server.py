#!/usr/bin/env python3
import json
import os
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
    
    def log_activity(self, log_type, action, description, user_id="system", user_name="시스템", target_type=None, target_id=None, target_name=None, details=None):
        """사용자 친화적 활동 로그 기록"""
        try:
            data = self.load_data()
            
            # activityLogs 배열이 없으면 생성
            if 'activityLogs' not in data:
                data['activityLogs'] = []
            
            # 새 로그 엔트리 생성
            log_entry = {
                "id": f"log_{int(datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}",
                "type": log_type,
                "action": action,
                "description": description,
                "timestamp": datetime.now().isoformat(),
                "userId": user_id,
                "userName": user_name,
                "targetType": target_type,
                "targetId": target_id,
                "targetName": target_name,
                "details": details or {}
            }
            
            # 로그를 배열의 맨 앞에 추가 (최신순)
            data['activityLogs'].insert(0, log_entry)
            
            # 최대 1000개 로그만 유지 (성능 고려)
            if len(data['activityLogs']) > 1000:
                data['activityLogs'] = data['activityLogs'][:1000]
            
            self.save_data(data)
            log(LogLevel.INFO, f"활동 로그 기록: {action} - {description}")
            
        except Exception as e:
            log_error(f"활동 로그 기록 실패: {action}", e)
    
    def serve_static_file(self, path):
        """정적 파일 서빙"""
        import mimetypes
        import os
        
        # 루트 경로 처리
        if path == '/':
            path = '/index.html'
        
        # 디렉토리 경로 처리 (index.html 자동 추가)
        if path.endswith('/'):
            # /admin/ -> /admin/index.html
            path = path + 'index.html'
        
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
            log(LogLevel.DEBUG, "POST 요청 데이터 수신", data)
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
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/order'):
                # 가게 순서 조회 (GET)
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                self.send_json_response({
                    "storeId": store_id,
                    "storeName": store['name'],
                    "currentOrder": store.get('order', 0)
                })
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/pause'):
                # 가게 중지
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 중지 상태 설정
                store['isPaused'] = True
                store['pausedAt'] = datetime.now().isoformat()
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 중지",
                    description=f"'{store['name']}' 가게를 중지했습니다. 고객 접속이 차단됩니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"pausedAt": store['pausedAt']}
                )
                
                log(LogLevel.INFO, f"가게 중지: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/resume'):
                # 가게 재개
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 재개 상태 설정
                store['isPaused'] = False
                if 'pausedAt' in store:
                    del store['pausedAt']
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 재개",
                    description=f"'{store['name']}' 가게를 재개했습니다. 고객 접속이 가능합니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"resumedAt": datetime.now().isoformat()}
                )
                
                log(LogLevel.INFO, f"가게 재개: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/pause'):
                # 가게 중지
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 중지 상태 설정
                store['isPaused'] = True
                store['pausedAt'] = datetime.now().isoformat()
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 중지",
                    description=f"'{store['name']}' 가게를 중지했습니다. 고객 접속이 차단됩니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"pausedAt": store['pausedAt']}
                )
                
                log(LogLevel.INFO, f"가게 중지: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/resume'):
                # 가게 재개
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 재개 상태 설정
                store['isPaused'] = False
                if 'pausedAt' in store:
                    del store['pausedAt']
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 재개",
                    description=f"'{store['name']}' 가게를 재개했습니다. 고객 접속이 가능합니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"resumedAt": datetime.now().isoformat()}
                )
                
                log(LogLevel.INFO, f"가게 재개: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path == '/api/activity-logs':
                # 활동 로그 조회
                data = self.load_data()
                logs = data.get('activityLogs', [])
                
                # 페이지네이션 지원
                query_params = parse_qs(parsed_path.query)
                page = int(query_params.get('page', ['1'])[0])
                limit = int(query_params.get('limit', ['50'])[0])
                
                start_idx = (page - 1) * limit
                end_idx = start_idx + limit
                
                paginated_logs = logs[start_idx:end_idx]
                
                self.send_json_response({
                    "logs": paginated_logs,
                    "total": len(logs),
                    "page": page,
                    "limit": limit,
                    "totalPages": (len(logs) + limit - 1) // limit
                })
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/order'):
                # 가게 순서 변경
                path_parts = parsed_path.path.split('/')
                store_id = path_parts[-2]  # /api/stores/{store_id}/order에서 store_id
                data = self.get_request_data()
                
                if not data or 'newOrder' not in data:
                    self.send_json_response({"error": "newOrder is required"}, 400)
                    return
                
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                old_order = store.get('order', 0)
                new_order = int(data['newOrder'])
                
                # 순서 변경
                store['order'] = new_order
                
                # 다른 가게들의 순서 조정
                for s in store_data['stores']:
                    if s['id'] != store_id:
                        current_order = s.get('order', 0)
                        if old_order < new_order:
                            # 아래로 이동: 기존 순서가 old_order와 new_order 사이인 가게들을 위로 이동
                            if old_order < current_order <= new_order:
                                s['order'] = current_order - 1
                        else:
                            # 위로 이동: 기존 순서가 new_order와 old_order 사이인 가게들을 아래로 이동
                            if new_order <= current_order < old_order:
                                s['order'] = current_order + 1
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 순서 변경",
                    description=f"'{store['name']}' 가게의 순서를 {old_order}번째에서 {new_order}번째로 변경했습니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"oldOrder": old_order, "newOrder": new_order}
                )
                
                log(LogLevel.INFO, f"가게 순서 변경: {store_id} -> {new_order}")
                self.send_json_response({"success": True})
            
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
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/order'):
                # 가게 순서 변경
                path_parts = parsed_path.path.split('/')
                store_id = path_parts[-2]  # /api/stores/{store_id}/order에서 store_id
                data = self.get_request_data()
                
                if not data or 'newOrder' not in data:
                    self.send_json_response({"error": "newOrder is required"}, 400)
                    return
                
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                old_order = store.get('order', 0)
                new_order = int(data['newOrder'])
                
                # 순서 변경
                store['order'] = new_order
                
                # 다른 가게들의 순서 조정
                for s in store_data['stores']:
                    if s['id'] != store_id:
                        current_order = s.get('order', 0)
                        if old_order < new_order:
                            # 아래로 이동: 기존 순서가 old_order와 new_order 사이인 가게들을 위로 이동
                            if old_order < current_order <= new_order:
                                s['order'] = current_order - 1
                        else:
                            # 위로 이동: 기존 순서가 new_order와 old_order 사이인 가게들을 아래로 이동
                            if new_order <= current_order < old_order:
                                s['order'] = current_order + 1
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 순서 변경",
                    description=f"'{store['name']}' 가게의 순서를 {old_order}번째에서 {new_order}번째로 변경했습니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"oldOrder": old_order, "newOrder": new_order}
                )
                
                log(LogLevel.INFO, f"가게 순서 변경: {store_id} -> {new_order}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path == '/api/superadmin/info':
                # 슈퍼어드민 정보 반환
                data = self.load_data()
                superadmin_info = data.get('superadmin', {})
                self.send_json_response(superadmin_info)
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/pause'):
                # 가게 중지
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 중지 상태 설정
                store['isPaused'] = True
                store['pausedAt'] = datetime.now().isoformat()
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 중지",
                    description=f"'{store['name']}' 가게를 중지했습니다. 고객 접속이 차단됩니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"pausedAt": store['pausedAt']}
                )
                
                log(LogLevel.INFO, f"가게 중지: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/resume'):
                # 가게 재개
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 재개 상태 설정
                store['isPaused'] = False
                if 'pausedAt' in store:
                    del store['pausedAt']
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 재개",
                    description=f"'{store['name']}' 가게를 재개했습니다. 고객 접속이 가능합니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"resumedAt": datetime.now().isoformat()}
                )
                
                log(LogLevel.INFO, f"가게 재개: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path.startswith('/store/'):
                # 가게별 페이지 서빙
                self.serve_static_file('/store.html')
            
            elif parsed_path.path == '/admin':
                # /admin을 /admin/으로 리다이렉트
                self.send_response(301)
                self.send_header('Location', '/admin/')
                self.end_headers()
                return
            
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
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 생성",
                    description=f"새로운 가게 '{new_store['name']}'을 생성했습니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=new_store['id'],
                    target_name=new_store['name'],
                    details={"phone": new_store.get('phone', ''), "address": new_store.get('address', '')}
                )
                
                log(LogLevel.INFO, f"가게 생성 완료: {new_store['id']}")
                self.send_json_response({"success": True, "store": new_store})
            
            elif parsed_path.path == '/api/data':
                # 전체 데이터 업데이트 (가게 전환용)
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                log(LogLevel.INFO, "전체 데이터 업데이트 요청")
                
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
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/images'):
                # 이미지 업로드
                store_id = parsed_path.path.split('/')[-2]
                
                try:
                    import cgi
                    import shutil
                    
                    # multipart/form-data 파싱
                    content_type = self.headers.get('Content-Type', '')
                    if not content_type.startswith('multipart/form-data'):
                        self.send_json_response({"error": "Content-Type must be multipart/form-data"}, 400)
                        return
                    
                    # 임시 파일 저장
                    form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD': 'POST'})
                    
                    if 'image' not in form or 'imageType' not in form:
                        self.send_json_response({"error": "image and imageType are required"}, 400)
                        return
                    
                    image_file = form['image']
                    image_type = form['imageType'].value
                    
                    if not image_file.filename:
                        self.send_json_response({"error": "No file uploaded"}, 400)
                        return
                    
                    # 파일 확장자 확인
                    if not image_file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg')):
                        self.send_json_response({"error": "Only image files are allowed"}, 400)
                        return
                    
                    # 업로드 디렉토리 생성
                    upload_dir = f"assets/images/uploads/{store_id}"
                    os.makedirs(upload_dir, exist_ok=True)
                    
                    # 파일 저장
                    filename = f"{image_type}_{int(datetime.now().timestamp() * 1000)}_{image_file.filename}"
                    file_path = os.path.join(upload_dir, filename)
                    
                    with open(file_path, 'wb') as f:
                        shutil.copyfileobj(image_file.file, f)
                    
                    # 데이터베이스에 이미지 경로 저장
                    store_data = self.load_data()
                    store = None
                    for s in store_data['stores']:
                        if s['id'] == store_id:
                            store = s
                            break
                    
                    if not store:
                        self.send_json_response({"error": "Store not found"}, 404)
                        return
                    
                    # 이미지 설정 업데이트
                    if 'settings' not in store:
                        store['settings'] = {}
                    if 'images' not in store['settings']:
                        store['settings']['images'] = {}
                    
                    store['settings']['images'][image_type] = f"/{file_path}"
                    self.save_data(store_data)
                    
                    # 활동 로그 기록
                    self.log_activity(
                        log_type="store",
                        action="이미지 업로드",
                        description=f"'{store['name']}' 가게의 {image_type} 이미지를 업로드했습니다.",
                        user_id="admin",
                        user_name="관리자",
                        target_type="store",
                        target_id=store_id,
                        target_name=store['name'],
                        details={"imageType": image_type, "filename": filename}
                    )
                    
                    log(LogLevel.INFO, f"이미지 업로드 완료: {store_id}/{image_type}")
                    self.send_json_response({"success": True, "imagePath": f"/{file_path}"})
                    
                except Exception as e:
                    log_error(f"이미지 업로드 실패: {store_id}", e)
                    self.send_json_response({"error": "Image upload failed"}, 500)
                    return
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/pause'):
                # 가게 중지
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 중지 상태 설정
                store['isPaused'] = True
                store['pausedAt'] = datetime.now().isoformat()
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 중지",
                    description=f"'{store['name']}' 가게를 중지했습니다. 고객 접속이 차단됩니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"pausedAt": store['pausedAt']}
                )
                
                log(LogLevel.INFO, f"가게 중지: {store_id}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path.startswith('/api/stores/') and parsed_path.path.endswith('/resume'):
                # 가게 재개
                store_id = parsed_path.path.split('/')[-2]
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 재개 상태 설정
                store['isPaused'] = False
                if 'pausedAt' in store:
                    del store['pausedAt']
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 재개",
                    description=f"'{store['name']}' 가게를 재개했습니다. 고객 접속이 가능합니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details={"resumedAt": datetime.now().isoformat()}
                )
                
                log(LogLevel.INFO, f"가게 재개: {store_id}")
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
                
                # 기존 설정이 있으면 병합, 없으면 새로 생성
                if store_id not in store_data['settings']:
                    store_data['settings'][store_id] = {}
                
                # 모든 설정 타입 업데이트
                for setting_type, setting_data in data.items():
                    if setting_type == 'basic':
                        # 기본 정보는 가게 정보에 직접 업데이트
                        store = None
                        for s in store_data['stores']:
                            if s['id'] == store_id:
                                store = s
                                break
                        
                        if store:
                            if 'storeName' in setting_data:
                                store['name'] = setting_data['storeName']
                            if 'storeSubtitle' in setting_data:
                                store['subtitle'] = setting_data['storeSubtitle']
                            if 'storePhone' in setting_data:
                                store['phone'] = setting_data['storePhone']
                            if 'storeAddress' in setting_data:
                                store['address'] = setting_data['storeAddress']
                    
                    elif setting_type == 'delivery':
                        # 배달앱 설정
                        if 'delivery' not in store_data['settings'][store_id]:
                            store_data['settings'][store_id]['delivery'] = {}
                        
                        for key, value in setting_data.items():
                            store_data['settings'][store_id]['delivery'][key] = value
                    
                    elif setting_type == 'discount':
                        # 할인 설정
                        if 'discount' not in store_data['settings'][store_id]:
                            store_data['settings'][store_id]['discount'] = {}
                        
                        for key, value in setting_data.items():
                            store_data['settings'][store_id]['discount'][key] = value
                    
                    elif setting_type == 'pickup':
                        # 픽업 설정
                        if 'pickup' not in store_data['settings'][store_id]:
                            store_data['settings'][store_id]['pickup'] = {}
                        
                        for key, value in setting_data.items():
                            store_data['settings'][store_id]['pickup'][key] = value
                    
                    else:
                        # 기타 설정
                        store_data['settings'][store_id][setting_type] = setting_data
                
                # 픽업 설정만 업데이트 (기존 로직 유지)
                if 'pickupTitle' in data or 'pickupDescription' in data or 'pickupTips' in data:
                    if 'pickup' not in store_data['settings'][store_id]:
                        store_data['settings'][store_id]['pickup'] = {}
                    
                    if 'pickupTitle' in data:
                        store_data['settings'][store_id]['pickup']['pickupTitle'] = data['pickupTitle']
                    if 'pickupDescription' in data:
                        store_data['settings'][store_id]['pickup']['pickupDescription'] = data['pickupDescription']
                    if 'pickupTips' in data:
                        store_data['settings'][store_id]['pickup']['pickupTips'] = data['pickupTips']
                    
                    store_data['settings'][store_id]['pickup']['lastModified'] = datetime.now().isoformat()
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="settings",
                    action="설정 저장",
                    description=f"가게 설정을 저장했습니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store_data['stores'][next(i for i, s in enumerate(store_data['stores']) if s['id'] == store_id)]['name'],
                    details={"settings": list(data.keys())}
                )
                
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
    
    def do_PUT(self):
        """PUT 요청 처리"""
        log(LogLevel.INFO, f"PUT 요청 수신: {self.path}")
        
        try:
            if self.path.startswith('/api/stores/'):
                # 가게 정보 업데이트
                store_id = self.path.split('/')[-1]
                log(LogLevel.INFO, f"가게 정보 업데이트 요청: {store_id}")
                
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_data = self.load_data()
                
                # 가게 찾기
                store = None
                for s in store_data['stores']:
                    if s['id'] == store_id:
                        store = s
                        break
                
                if not store:
                    self.send_json_response({"error": "Store not found"}, 404)
                    return
                
                # 가게 정보 업데이트
                if 'name' in data:
                    store['name'] = data['name']
                if 'subtitle' in data:
                    store['subtitle'] = data['subtitle']
                if 'phone' in data:
                    store['phone'] = data['phone']
                if 'address' in data:
                    store['address'] = data['address']
                
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 정보 수정",
                    description=f"'{store['name']}' 가게의 기본 정보를 수정했습니다.",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store['name'],
                    details=data
                )
                
                log(LogLevel.INFO, f"가게 정보 업데이트 완료: {store_id}")
                self.send_json_response({"success": True, "message": "가게 정보가 업데이트되었습니다."})
            
            else:
                self.send_json_response({"error": "Not found"}, 404)
                
        except Exception as e:
            log_error(f"PUT 요청 처리 실패: {self.path}", e)
            self.send_json_response({"error": "Internal server error"}, 500)
    
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