#!/usr/bin/env python3
import json
import os
import time
import fcntl
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import uuid
from datetime import datetime
import sys

# QR 생성기 import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.qr_generator import get_qr_generator
from backend.ai_content_generator import get_generator as get_ai_generator

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
    # 클래스 변수로 캐시 추가
    _data_cache = None
    _cache_timestamp = 0
    _cache_ttl = 5  # 5초 캐시
    
    def __init__(self, *args, **kwargs):
        self.data_file = 'assets/data/data.json'
        super().__init__(*args, **kwargs)
    
    def log_message(self, format, *args):
        """기본 로그 메시지 비활성화 (우리가 직접 관리)"""
        pass
    
    def migrate_settings(self, data):
        """기존 설정 데이터를 새로운 키 구조로 마이그레이션"""
        if 'settings' not in data:
            return data
            
        for store_id, settings in data['settings'].items():
            # 할인 설정 마이그레이션
            if 'discount' in settings:
                discount = settings['discount']
                if 'discountEnabled' in discount:
                    discount['enabled'] = discount.pop('discountEnabled')
                if 'discountTitle' in discount:
                    discount['title'] = discount.pop('discountTitle')
                if 'discountDescription' in discount:
                    discount['description'] = discount.pop('discountDescription')
            
            # 픽업 설정 마이그레이션
            if 'pickup' in settings:
                pickup = settings['pickup']
                if 'pickupEnabled' in pickup:
                    pickup['enabled'] = pickup.pop('pickupEnabled')
                if 'pickupTitle' in pickup:
                    pickup['title'] = pickup.pop('pickupTitle')
                if 'pickupDescription' in pickup:
                    pickup['description'] = pickup.pop('pickupDescription')
        
        return data
    
    def migrate_stores(self, data):
        """기존 가게 데이터를 새로운 구조로 마이그레이션"""
        if 'stores' not in data:
            return data
            
        for store in data['stores']:
            # status 필드가 없으면 기본값 설정
            if 'status' not in store:
                # 기존 isPaused 필드가 있으면 그에 따라 설정
                if 'isPaused' in store:
                    store['status'] = 'paused' if store['isPaused'] else 'active'
                    del store['isPaused']  # 기존 필드 제거
                else:
                    store['status'] = 'active'  # 기본값
        
        return data
    
    def load_data(self, use_cache=True):
        """데이터 파일 로드 (캐싱 지원)"""
        try:
            # 캐시 사용 가능하고 유효한 경우
            current_time = time.time()
            if use_cache and DataHandler._data_cache is not None:
                if (current_time - DataHandler._cache_timestamp) < DataHandler._cache_ttl:
                    return DataHandler._data_cache
            
            # 파일에서 로드
            if os.path.exists(self.data_file):
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    log(LogLevel.DEBUG, f"데이터 파일 로드 성공: {self.data_file}")
                    # 설정 데이터 마이그레이션
                    data = self.migrate_settings(data)
                    # 가게 데이터 마이그레이션
                    data = self.migrate_stores(data)
                    
                    # 캐시 업데이트
                    DataHandler._data_cache = data
                    DataHandler._cache_timestamp = current_time
                    
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
        """데이터 파일 저장 (파일 락 사용)"""
        lock_file = self.data_file + '.lock'
        max_retries = 3
        retry_delay = 0.1
        
        for attempt in range(max_retries):
            try:
                # 파일 락 획득 시도
                with open(lock_file, 'w') as lock_f:
                    try:
                        fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                        
                        # 임시 파일에 먼저 저장 (원자적 쓰기)
                        temp_file = self.data_file + '.tmp'
                        with open(temp_file, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                        
                        # 임시 파일을 원본 파일로 이동 (원자적 교체)
                        import shutil
                        shutil.move(temp_file, self.data_file)
                        
                        # 캐시 무효화
                        DataHandler._data_cache = None
                        DataHandler._cache_timestamp = 0
                        
                        log(LogLevel.DEBUG, f"데이터 파일 저장 성공: {self.data_file}")
                        return True
                        
                    except BlockingIOError:
                        # 다른 프로세스가 파일을 사용 중
                        if attempt < max_retries - 1:
                            log(LogLevel.WARN, f"파일 락 대기 중... (시도 {attempt + 1}/{max_retries})")
                            time.sleep(retry_delay * (attempt + 1))
                            continue
                        else:
                            log_error(f"파일 락 획득 실패: {self.data_file}")
                            return False
                    finally:
                        # 락 해제
                        fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
                        
            except Exception as e:
                log_error(f"데이터 파일 저장 실패: {self.data_file}", e)
                # 임시 파일이 남아있으면 삭제
                try:
                    temp_file = self.data_file + '.tmp'
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                except Exception as e:
                    pass
                return False
            finally:
                # 락 파일 정리
                try:
                    if os.path.exists(lock_file):
                        os.remove(lock_file)
                except Exception:
                    pass
        
        return False
    
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
            # Content-Length 헤더 확인
            if 'Content-Length' not in self.headers:
                log_error("Content-Length 헤더가 없습니다")
                return None
                
            content_length = int(self.headers['Content-Length'])
            if content_length <= 0:
                log_error(f"잘못된 Content-Length: {content_length}")
                return None
            
            # 데이터 읽기
            post_data = self.rfile.read(content_length)
            if not post_data:
                log_error("빈 요청 데이터")
                return None
            
            # JSON 파싱
            data = json.loads(post_data.decode('utf-8'))
            log(LogLevel.DEBUG, "POST 요청 데이터 수신", data)
            return data
            
        except json.JSONDecodeError as e:
            log_error(f"JSON 파싱 실패: {str(e)}")
            return None
        except UnicodeDecodeError as e:
            log_error(f"문자 인코딩 실패: {str(e)}")
            return None
        except ValueError as e:
            log_error(f"Content-Length 파싱 실패: {str(e)}")
            return None
        except Exception as e:
            log_error(f"POST 요청 데이터 파싱 실패: {str(e)}")
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
                store['status'] = 'paused'
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
                store['status'] = 'active'
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
                store['status'] = 'active'
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
                store['status'] = 'paused'
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
                store['status'] = 'active'
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
                store['status'] = 'active'
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
            
            elif parsed_path.path == '/api/release-notes':
                # 릴리즈 노트 조회
                data = self.load_data()
                release_notes = data.get('releaseNotes', [])
                
                # 최신순 정렬
                release_notes.sort(key=lambda x: x.get('releaseDate', ''), reverse=True)
                
                self.send_json_response({
                    "success": True,
                    "releaseNotes": release_notes
                })
            
            elif parsed_path.path == '/api/activity-logs':
                if self.command == 'GET':
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
                
                elif self.command == 'POST':
                    # 활동 로그 추가
                    try:
                        log_data = self.get_request_data()
                        
                        if not log_data:
                            self.send_json_response({"error": "로그 데이터가 필요합니다"}, 400)
                            return
                        
                        # 필수 필드 확인 (클라이언트에서 보내는 구조에 맞게 수정)
                        required_fields = ['type', 'action', 'description']
                        for field in required_fields:
                            if field not in log_data:
                                self.send_json_response({"error": f"필수 필드 '{field}'가 누락되었습니다"}, 400)
                                return
                        
                        # 데이터 로드
                        data = self.load_data()
                        
                        # activityLogs 배열 초기화 (없는 경우)
                        if 'activityLogs' not in data:
                            data['activityLogs'] = []
                        
                        # 새 로그 엔트리 생성 (클라이언트에서 보내는 구조에 맞게 수정)
                        new_log = {
                            "id": str(uuid.uuid4()),
                            "timestamp": log_data.get('timestamp', datetime.now().isoformat()),
                            "type": log_data['type'],
                            "action": log_data['action'],
                            "description": log_data['description'],
                            "details": log_data.get('details'),
                            "user": log_data.get('user', 'admin')
                        }
                        
                        # 로그 추가 (최신 순으로 정렬)
                        data['activityLogs'].insert(0, new_log)
                        
                        # 최대 1000개 로그만 유지 (메모리 절약)
                        if len(data['activityLogs']) > 1000:
                            data['activityLogs'] = data['activityLogs'][:1000]
                        
                        # 데이터 저장
                        self.save_data(data)
                        
                        log(LogLevel.INFO, f"활동 로그 추가: {log_data['action']} - {log_data.get('user', 'admin')}")
                        self.send_json_response({"success": True, "logId": new_log['id']}, 201)
                        
                    except Exception as e:
                        log_error("활동 로그 추가 실패", e)
                        self.send_json_response({"error": "활동 로그 추가에 실패했습니다"}, 500)
            
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
            
            elif parsed_path.path.startswith('/api/users/'):
                # 사용자 정보 조회 (/api/users/:id)
                user_id = parsed_path.path.split('/')[-1]
                data = self.load_data()
                
                # 사용자 정보 찾기 (가게 정보에서 사용자 정보 추출)
                user_info = None
                if 'stores' in data:
                    for store in data['stores']:
                        if store.get('id') == user_id:
                            user_info = {
                                "id": store.get('id'),
                                "name": store.get('name'),
                                "subtitle": store.get('subtitle'),
                                "phone": store.get('phone'),
                                "address": store.get('address'),
                                "status": store.get('status', 'active')
                            }
                            break
                
                if user_info:
                    # Cache-Control: no-store 헤더와 함께 응답
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    self.end_headers()
                    self.wfile.write(json.dumps(user_info, ensure_ascii=False).encode('utf-8'))
                else:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    self.end_headers()
                    error_response = {"error": "User not found"}
                    self.wfile.write(json.dumps(error_response, ensure_ascii=False).encode('utf-8'))
            
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
                                "enabled": False,
                                "title": "할인 이벤트",
                                "description": "할인 내용을 입력하세요"
                            },
                            "delivery": {
                                "ttaengUrl": "",
                                "baeminUrl": "",
                                "coupangUrl": "",
                                "yogiyoUrl": "",
                                "deliveryOrder": ["ttaeng", "baemin", "coupang", "yogiyo"]
                            },
                            "pickup": {
                                "enabled": False,
                                "title": "픽업 안내",
                                "description": "픽업 안내 내용을 입력하세요"
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
                store['status'] = 'paused'
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
                store['status'] = 'active'
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
                store['status'] = 'active'
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
            
            elif parsed_path.path == '/api/stores/bulk-export':
                # 대량 가게 내보내기 (CSV/JSON)
                log(LogLevel.INFO, "대량 가게 내보내기 요청")
                
                try:
                    data = self.load_data()
                    stores = data.get('stores', [])
                    
                    # 쿼리 파라미터로 포맷 지정 (기본값: json)
                    query_params = parse_qs(parsed_path.query)
                    export_format = query_params.get('format', ['json'])[0]
                    
                    if export_format == 'csv':
                        # CSV 형식으로 내보내기
                        import csv
                        import io
                        
                        output = io.StringIO()
                        writer = csv.DictWriter(output, fieldnames=['id', 'name', 'subtitle', 'phone', 'address', 'status', 'createdAt'])
                        writer.writeheader()
                        
                        for store in stores:
                            writer.writerow({
                                'id': store.get('id', ''),
                                'name': store.get('name', ''),
                                'subtitle': store.get('subtitle', ''),
                                'phone': store.get('phone', ''),
                                'address': store.get('address', ''),
                                'status': store.get('status', 'active'),
                                'createdAt': store.get('createdAt', '')
                            })
                        
                        csv_content = output.getvalue()
                        
                        # UTF-8 BOM 추가 (엑셀 호환)
                        bom = '\ufeff'
                        csv_with_bom = bom + csv_content
                        
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/csv; charset=utf-8')
                        self.send_header('Content-Disposition', 'attachment; filename="stores.csv"')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(csv_with_bom.encode('utf-8'))
                        
                        log(LogLevel.INFO, f"CSV 내보내기 완료: {len(stores)}개 가게")
                    else:
                        # JSON 형식으로 내보내기 (기본값)
                        export_data = {
                            'exportedAt': datetime.now().isoformat(),
                            'totalCount': len(stores),
                            'stores': stores
                        }
                        
                        self.send_json_response(export_data)
                        log(LogLevel.INFO, f"JSON 내보내기 완료: {len(stores)}개 가게")
                    
                    # 활동 로그 기록
                    try:
                        self.log_activity(
                            log_type="bulk",
                            action="대량 가게 내보내기",
                            description=f"{len(stores)}개 가게 데이터 내보내기 ({export_format.upper()} 형식)",
                            user_id="admin",
                            user_name="슈퍼어드민",
                            target_type="stores",
                            target_id="bulk_export",
                            target_name=f"{len(stores)}개 가게",
                            details={"exportFormat": export_format, "exportedCount": len(stores)}
                        )
                    except Exception as log_error:
                        log(LogLevel.WARN, f"활동 로그 기록 실패 (무시): {log_error}")
                
                except Exception as e:
                    log_error("대량 가게 내보내기 중 오류", e)
                    self.send_json_response({"error": str(e)}, 500)
            
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
                    log_error("가게 생성 요청 데이터 파싱 실패")
                    self.send_json_response({"error": "요청 데이터를 읽을 수 없습니다. 다시 시도해주세요."}, 400)
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
                    "status": "active",  # 기본값: 활성 상태
                    "createdAt": datetime.now().isoformat()
                }
                
                store_data['stores'].append(new_store)
                
                # 데이터 저장 시도
                if not self.save_data(store_data):
                    log_error(f"가게 저장 실패: {new_store['name']}")
                    self.send_json_response({
                        "error": "가게 정보 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
                        "details": "파일 저장 중 오류가 발생했습니다."
                    }, 500)
                    return
                
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
                
                # 변경 전 정보 저장 (활동 로그용)
                old_store_id = store_data.get('currentStoreId')
                old_store = next((s for s in store_data.get('stores', []) if s['id'] == old_store_id), None) if old_store_id else None
                old_store_name = old_store['name'] if old_store else '없음'
                
                # 새 가게 정보
                new_store = next((s for s in store_data.get('stores', []) if s['id'] == data['storeId']), None)
                new_store_name = new_store['name'] if new_store else data['storeId']
                
                store_data['currentStoreId'] = data['storeId']
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 전환",
                    description=f"현재 가게를 전환했습니다.\n이전: {old_store_name}\n현재: {new_store_name}",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=data['storeId'],
                    target_name=new_store_name,
                    details={
                        "oldStoreId": old_store_id,
                        "oldStoreName": old_store_name,
                        "newStoreId": data['storeId'],
                        "newStoreName": new_store_name
                    }
                )
                
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
                store['status'] = 'paused'
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
                store['status'] = 'active'
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
                store['status'] = 'active'
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
                
                # 데이터 저장 시도
                if not self.save_data(store_data):
                    log_error(f"가게 정보 저장 실패: {data['id']}")
                    self.send_json_response({
                        "error": "가게 정보 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
                        "details": "파일 저장 중 오류가 발생했습니다."
                    }, 500)
                    return
                
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
                
                # 변경 전 설정 저장 (활동 로그용)
                old_settings = {}
                if store_id in store_data['settings']:
                    import copy
                    old_settings = copy.deepcopy(store_data['settings'][store_id])
                
                # 기존 설정이 있으면 병합, 없으면 새로 생성
                if store_id not in store_data['settings']:
                    store_data['settings'][store_id] = {}
                
                # 모든 설정 타입 업데이트
                for setting_type, setting_data in data.items():
                    if setting_type == 'basic':
                        # 기본 정보는 가게 정보에 직접 업데이트 (기존 값 보존)
                        store = None
                        for s in store_data['stores']:
                            if s['id'] == store_id:
                                store = s
                                break
                        
                        if store:
                            # 기존 값이 있으면 보존하고, 새로운 값만 업데이트
                            if 'storeName' in setting_data and setting_data['storeName']:
                                store['name'] = setting_data['storeName']
                            if 'storeSubtitle' in setting_data and setting_data['storeSubtitle']:
                                store['subtitle'] = setting_data['storeSubtitle']
                            if 'storePhone' in setting_data and setting_data['storePhone']:
                                store['phone'] = setting_data['storePhone']
                            if 'storeAddress' in setting_data and setting_data['storeAddress']:
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
                
                # 데이터 저장 시도
                if not self.save_data(store_data):
                    log_error(f"설정 저장 실패: {store_id}")
                    self.send_json_response({
                        "error": "설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
                        "details": "파일 저장 중 오류가 발생했습니다."
                    }, 500)
                    return
                
                # 활동 로그 기록 (변경 전/후 명확히)
                store_name = store_data['stores'][next(i for i, s in enumerate(store_data['stores']) if s['id'] == store_id)]['name']
                new_settings = store_data['settings'][store_id]
                
                # 변경 사항 추적
                changes = []
                setting_names = {
                    'basic': '기본 정보',
                    'discount': '할인 설정',
                    'delivery': '배달앱 설정',
                    'pickup': '픽업 안내',
                    'images': '이미지 관리',
                    'qrCode': 'QR 코드',
                    'sectionOrder': 'UI 순서'
                }
                
                for setting_type in data.keys():
                    setting_name = setting_names.get(setting_type, setting_type)
                    old_value = old_settings.get(setting_type, {})
                    new_value = new_settings.get(setting_type, {})
                    
                    if old_value != new_value:
                        # 세부 변경 내용 추적
                        if setting_type == 'discount':
                            if old_value.get('enabled') != new_value.get('enabled'):
                                changes.append(f"{setting_name}: {'활성화' if new_value.get('enabled') else '비활성화'}")
                            elif old_value.get('title') != new_value.get('title') or old_value.get('description') != new_value.get('description'):
                                changes.append(f"{setting_name}: 내용 수정")
                        elif setting_type == 'pickup':
                            if old_value.get('enabled') != new_value.get('enabled'):
                                changes.append(f"{setting_name}: {'활성화' if new_value.get('enabled') else '비활성화'}")
                            elif old_value.get('title') != new_value.get('title') or old_value.get('description') != new_value.get('description'):
                                changes.append(f"{setting_name}: 내용 수정")
                        elif setting_type == 'delivery':
                            # 배달앱 URL 변경 확인
                            changed_apps = []
                            for app in ['ttaengUrl', 'baeminUrl', 'coupangUrl', 'yogiyoUrl']:
                                if old_value.get(app) != new_value.get(app):
                                    app_names = {'ttaengUrl': '땡겨요', 'baeminUrl': '배달의민족', 'coupangUrl': '쿠팡이츠', 'yogiyoUrl': '요기요'}
                                    changed_apps.append(app_names.get(app, app))
                            if changed_apps:
                                changes.append(f"{setting_name}: {', '.join(changed_apps)} 변경")
                            elif old_value.get('deliveryOrder') != new_value.get('deliveryOrder'):
                                changes.append(f"{setting_name}: 순서 변경")
                        elif setting_type == 'sectionOrder':
                            changes.append(f"{setting_name}: 순서 변경")
                        else:
                            changes.append(f"{setting_name}: 변경됨")
                
                # 로그 설명 생성
                if changes:
                    description = f"'{store_name}' 가게 설정이 변경되었습니다.\n\n변경 항목:\n" + "\n".join(f"• {change}" for change in changes)
                else:
                    description = f"'{store_name}' 가게 설정이 저장되었습니다."
                
                self.log_activity(
                    log_type="settings",
                    action="가게 설정 변경",
                    description=description,
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=store_name,
                    details={
                        "changedSettings": list(data.keys()),
                        "changes": changes,
                        "before": old_settings,
                        "after": new_settings
                    }
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
                    
                    # 활동 로그 기록
                    self.log_activity(
                        log_type="admin",
                        action="슈퍼어드민 로그인",
                        description=f"슈퍼어드민 '{data.get('username')}'이(가) 로그인했습니다.",
                        user_id=data.get('username'),
                        user_name="슈퍼어드민",
                        target_type="admin",
                        target_id="superadmin",
                        target_name="슈퍼어드민",
                        details={
                            "loginTime": datetime.now().isoformat(),
                            "username": data.get('username')
                        }
                    )
                    
                    self.send_json_response({"success": True, "message": "로그인 성공"})
                else:
                    log(LogLevel.WARN, f"슈퍼어드민 로그인 실패: {data.get('username')}")
                    
                    # 실패 로그 기록
                    self.log_activity(
                        log_type="admin",
                        action="슈퍼어드민 로그인 실패",
                        description=f"슈퍼어드민 로그인 시도 실패 (사용자명: {data.get('username')})",
                        user_id=data.get('username', 'unknown'),
                        user_name="알 수 없음",
                        target_type="admin",
                        target_id="superadmin",
                        target_name="슈퍼어드민",
                        details={
                            "attemptTime": datetime.now().isoformat(),
                            "username": data.get('username'),
                            "reason": "잘못된 사용자명 또는 비밀번호"
                        }
                    )
                    
                    self.send_json_response({"success": False, "message": "로그인 실패"})
            
            elif parsed_path.path == '/api/superadmin/update':
                # 슈퍼어드민 정보 업데이트
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                log(LogLevel.INFO, f"슈퍼어드민 정보 업데이트: {data.get('username', 'Unknown')}")
                
                store_data = self.load_data()
                
                # 변경 전 정보 저장 (활동 로그용)
                old_superadmin = store_data.get('superadmin', {})
                old_username = old_superadmin.get('username', '없음')
                
                store_data['superadmin'] = {
                    "username": data.get('username', ''),
                    "password": data.get('password', ''),
                    "createdAt": datetime.now().isoformat(),
                    "lastModified": datetime.now().isoformat()
                }
                self.save_data(store_data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="admin",
                    action="슈퍼어드민 정보 수정",
                    description=f"슈퍼어드민 정보가 수정되었습니다.\n이전 사용자명: {old_username}\n새 사용자명: {data.get('username')}\n비밀번호: 변경됨",
                    user_id="admin",
                    user_name="관리자",
                    target_type="admin",
                    target_id="superadmin",
                    target_name="슈퍼어드민",
                    details={
                        "oldUsername": old_username,
                        "newUsername": data.get('username'),
                        "passwordChanged": True,
                        "updatedAt": datetime.now().isoformat()
                    }
                )
                
                log(LogLevel.INFO, f"슈퍼어드민 정보 업데이트 완료: {data.get('username')}")
                self.send_json_response({"success": True})
            
            elif parsed_path.path == '/api/qr/generate':
                # QR 코드 생성
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_id = data.get('storeId')
                if not store_id:
                    self.send_json_response({"error": "storeId is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"QR 코드 생성 요청: {store_id}")
                
                try:
                    # 가게 정보 로드
                    store_data = self.load_data()
                    store = next((s for s in store_data.get('stores', []) if s['id'] == store_id), None)
                    
                    if not store:
                        self.send_json_response({"error": "Store not found"}, 404)
                        return
                    
                    # QR 코드에 인코딩할 URL 생성
                    base_url = data.get('baseUrl', 'http://localhost:8081')
                    qr_data = f"{base_url}/store.html?id={store_id}"
                    
                    # 로고 경로 가져오기 (images 객체에서)
                    logo_path = None
                    settings = store_data.get('settings', {}).get(store_id, {})
                    if 'images' in settings and 'mainLogo' in settings['images']:
                        logo_path = settings['images']['mainLogo']
                        log(LogLevel.INFO, f"로고 경로 발견: {logo_path}")
                    
                    # QR 생성기 가져오기
                    qr_gen = get_qr_generator()
                    
                    # QR 코드 생성 및 저장
                    result = qr_gen.generate_and_save(
                        data=qr_data,
                        store_id=store_id,
                        logo_path=logo_path,
                        size=1024
                    )
                    
                    if result['success']:
                        # settings에 QR 코드 정보 저장
                        if store_id not in store_data.get('settings', {}):
                            if 'settings' not in store_data:
                                store_data['settings'] = {}
                            store_data['settings'][store_id] = {}
                        
                        store_data['settings'][store_id]['qrCode'] = {
                            'url': result['url'],
                            'filepath': result['filepath'],
                            'createdAt': datetime.now().isoformat()
                        }
                        
                        self.save_data(store_data)
                        
                        # 활동 로그 기록
                        self.log_activity(
                            log_type="qr",
                            action="QR 코드 생성",
                            description=f"'{store['name']}' 가게의 QR 코드가 생성되었습니다.\n대상 URL: {qr_data}\n로고 포함: {'예 (' + logo_path + ')' if logo_path else '아니오'}",
                            user_id="admin",
                            user_name="관리자",
                            target_type="qr",
                            target_id=store_id,
                            target_name=store['name'],
                            details={
                                "qrCodeUrl": result['url'],
                                "targetUrl": qr_data,
                                "hasLogo": bool(logo_path),
                                "logoPath": logo_path,
                                "filepath": result['filepath']
                            }
                        )
                        
                        log(LogLevel.INFO, f"QR 코드 생성 완료: {store_id}")
                        self.send_json_response({
                            "success": True,
                            "qrCode": result['url'],
                            "message": result['message']
                        })
                    else:
                        log_error(f"QR 코드 생성 실패: {store_id}")
                        self.send_json_response({
                            "error": result['message']
                        }, 500)
                
                except Exception as e:
                    log_error(f"QR 코드 생성 중 오류: {store_id}", e)
                    self.send_json_response({"error": str(e)}, 500)
            
            elif parsed_path.path == '/api/ai/generate-content':
                # AI 콘텐츠 자동 생성
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_name = data.get('storeName')
                store_id = data.get('storeId')
                
                if not store_name:
                    self.send_json_response({"error": "storeName is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"AI 콘텐츠 생성 요청: {store_name}")
                
                try:
                    # 기존 고객 작성 예시 수집 (학습용)
                    db_data = self.load_data()
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
                    
                    # AI 생성기 호출
                    ai_generator = get_ai_generator()
                    result = ai_generator.generate_content(
                        store_name=store_name,
                        existing_examples=existing_examples[:5]  # 최대 5개 예시
                    )
                    
                    if result['success']:
                        log(LogLevel.INFO, f"AI 콘텐츠 생성 성공: {store_name}")
                        
                        # 활동 로그 기록
                        self.log_activity(
                            log_type="ai",
                            action="AI 콘텐츠 생성",
                            description=f"'{store_name}' 가게의 할인 설정과 픽업 안내를 AI가 자동 생성했습니다.\n분석: {result['data'].get('analysis', {}).get('category', '알 수 없음')} - {result['data'].get('analysis', {}).get('reasoning', '')}",
                            user_id="admin",
                            user_name="관리자",
                            target_type="ai",
                            target_id=store_id or store_name,
                            target_name=store_name,
                            details={
                                "model": result.get('model', 'gpt-4o-mini'),
                                "discountTitle": result['data']['discount']['title'],
                                "discountDescription": result['data']['discount']['description'],
                                "pickupTitle": result['data']['pickup']['title'],
                                "pickupDescription": result['data']['pickup']['description'],
                                "analysis": result['data'].get('analysis', {})
                            }
                        )
                        
                        self.send_json_response(result)
                    else:
                        log_error(f"AI 콘텐츠 생성 실패: {store_name}", result.get('error'))
                        self.send_json_response(result, 500)
                
                except Exception as e:
                    log_error(f"AI 콘텐츠 생성 중 오류: {store_name}", e)
                    self.send_json_response({"error": str(e)}, 500)
            
            elif parsed_path.path == '/api/stores/bulk-update':
                # 대량 가게 정보 수정
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_ids = data.get('storeIds', [])
                updates = data.get('updates', {})
                
                if not store_ids or not updates:
                    self.send_json_response({"error": "storeIds and updates are required"}, 400)
                    return
                
                log(LogLevel.INFO, f"대량 가게 수정 요청: {len(store_ids)}개 가게")
                
                try:
                    store_data = self.load_data()
                    updated_count = 0
                    updated_stores = []
                    
                    for store_id in store_ids:
                        for i, store in enumerate(store_data['stores']):
                            if store['id'] == store_id:
                                # 업데이트 적용
                                for key, value in updates.items():
                                    if key in ['name', 'subtitle', 'phone', 'address', 'status']:
                                        store_data['stores'][i][key] = value
                                store_data['stores'][i]['lastModified'] = datetime.now().isoformat()
                                updated_count += 1
                                updated_stores.append(store.get('name', store_id))
                                break
                    
                    if self.save_data(store_data):
                        # 활동 로그 기록
                        try:
                            self.log_activity(
                                log_type="bulk",
                                action="대량 가게 수정",
                                description=f"{updated_count}개 가게 정보 일괄 수정\n수정된 가게: {', '.join(updated_stores[:5])}{' 외 ' + str(len(updated_stores) - 5) + '개' if len(updated_stores) > 5 else ''}\n수정 내용: {', '.join(updates.keys())}",
                                user_id="admin",
                                user_name="슈퍼어드민",
                                target_type="stores",
                                target_id=",".join(store_ids[:5]),
                                target_name=f"{updated_count}개 가게",
                                details={"storeIds": store_ids, "updates": updates, "updatedCount": updated_count}
                            )
                        except Exception as log_error:
                            log(LogLevel.WARN, f"활동 로그 기록 실패 (무시): {log_error}")
                        
                        log(LogLevel.INFO, f"대량 가게 수정 완료: {updated_count}개")
                        self.send_json_response({"success": True, "updatedCount": updated_count})
                    else:
                        log_error("대량 가게 수정 저장 실패")
                        self.send_json_response({"error": "저장 실패"}, 500)
                
                except Exception as e:
                    log_error("대량 가게 수정 중 오류", e)
                    self.send_json_response({"error": str(e)}, 500)
            
            elif parsed_path.path == '/api/stores/bulk-delete':
                # 대량 가게 삭제
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_ids = data.get('storeIds', [])
                
                if not store_ids:
                    self.send_json_response({"error": "storeIds is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"대량 가게 삭제 요청: {len(store_ids)}개 가게")
                
                try:
                    store_data = self.load_data()
                    deleted_stores = []
                    
                    # 가게 삭제
                    store_data['stores'] = [
                        s for s in store_data['stores']
                        if s['id'] not in store_ids or (deleted_stores.append(s) or False)
                    ]
                    
                    # 설정 삭제
                    for store_id in store_ids:
                        if store_id in store_data.get('settings', {}):
                            del store_data['settings'][store_id]
                    
                    if self.save_data(store_data):
                        # 활동 로그 기록
                        try:
                            deleted_names = [s.get('name', s.get('id')) for s in deleted_stores]
                            self.log_activity(
                                log_type="bulk",
                                action="대량 가게 삭제",
                                description=f"{len(deleted_stores)}개 가게 일괄 삭제\n삭제된 가게: {', '.join(deleted_names[:5])}{' 외 ' + str(len(deleted_names) - 5) + '개' if len(deleted_names) > 5 else ''}",
                                user_id="admin",
                                user_name="슈퍼어드민",
                                target_type="stores",
                                target_id=",".join(store_ids[:5]),
                                target_name=f"{len(deleted_stores)}개 가게",
                                details={"storeIds": store_ids, "deletedCount": len(deleted_stores), "deletedStores": deleted_names}
                            )
                        except Exception as log_error:
                            log(LogLevel.WARN, f"활동 로그 기록 실패 (무시): {log_error}")
                        
                        log(LogLevel.INFO, f"대량 가게 삭제 완료: {len(deleted_stores)}개")
                        self.send_json_response({"success": True, "deletedCount": len(deleted_stores)})
                    else:
                        log_error("대량 가게 삭제 저장 실패")
                        self.send_json_response({"error": "저장 실패"}, 500)
                
                except Exception as e:
                    log_error("대량 가게 삭제 중 오류", e)
                    self.send_json_response({"error": str(e)}, 500)
            
            elif parsed_path.path == '/api/stores/bulk-pause':
                # 대량 가게 일시정지
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_ids = data.get('storeIds', [])
                
                if not store_ids:
                    self.send_json_response({"error": "storeIds is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"대량 가게 일시정지 요청: {len(store_ids)}개 가게")
                
                try:
                    store_data = self.load_data()
                    paused_count = 0
                    paused_stores = []
                    
                    for store_id in store_ids:
                        for i, store in enumerate(store_data['stores']):
                            if store['id'] == store_id:
                                store_data['stores'][i]['status'] = 'paused'
                                store_data['stores'][i]['lastModified'] = datetime.now().isoformat()
                                paused_count += 1
                                paused_stores.append(store.get('name', store_id))
                                break
                    
                    if self.save_data(store_data):
                        # 활동 로그 기록
                        try:
                            self.log_activity(
                                log_type="bulk",
                                action="대량 가게 일시정지",
                                description=f"{paused_count}개 가게 일괄 일시정지\n일시정지된 가게: {', '.join(paused_stores[:5])}{' 외 ' + str(len(paused_stores) - 5) + '개' if len(paused_stores) > 5 else ''}",
                                user_id="admin",
                                user_name="슈퍼어드민",
                                target_type="stores",
                                target_id=",".join(store_ids[:5]),
                                target_name=f"{paused_count}개 가게",
                                details={"storeIds": store_ids, "pausedCount": paused_count}
                            )
                        except Exception as log_error:
                            log(LogLevel.WARN, f"활동 로그 기록 실패 (무시): {log_error}")
                        
                        log(LogLevel.INFO, f"대량 가게 일시정지 완료: {paused_count}개")
                        self.send_json_response({"success": True, "pausedCount": paused_count})
                    else:
                        log_error("대량 가게 일시정지 저장 실패")
                        self.send_json_response({"error": "저장 실패"}, 500)
                
                except Exception as e:
                    log_error("대량 가게 일시정지 중 오류", e)
                    self.send_json_response({"error": str(e)}, 500)
            
            elif parsed_path.path == '/api/stores/bulk-resume':
                # 대량 가게 재개
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                store_ids = data.get('storeIds', [])
                
                if not store_ids:
                    self.send_json_response({"error": "storeIds is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"대량 가게 재개 요청: {len(store_ids)}개 가게")
                
                try:
                    store_data = self.load_data()
                    resumed_count = 0
                    resumed_stores = []
                    
                    for store_id in store_ids:
                        for i, store in enumerate(store_data['stores']):
                            if store['id'] == store_id:
                                store_data['stores'][i]['status'] = 'active'
                                store_data['stores'][i]['lastModified'] = datetime.now().isoformat()
                                resumed_count += 1
                                resumed_stores.append(store.get('name', store_id))
                                break
                    
                    if self.save_data(store_data):
                        # 활동 로그 기록
                        try:
                            self.log_activity(
                                log_type="bulk",
                                action="대량 가게 재개",
                                description=f"{resumed_count}개 가게 일괄 재개\n재개된 가게: {', '.join(resumed_stores[:5])}{' 외 ' + str(len(resumed_stores) - 5) + '개' if len(resumed_stores) > 5 else ''}",
                                user_id="admin",
                                user_name="슈퍼어드민",
                                target_type="stores",
                                target_id=",".join(store_ids[:5]),
                                target_name=f"{resumed_count}개 가게",
                                details={"storeIds": store_ids, "resumedCount": resumed_count}
                            )
                        except Exception as log_error:
                            log(LogLevel.WARN, f"활동 로그 기록 실패 (무시): {log_error}")
                        
                        log(LogLevel.INFO, f"대량 가게 재개 완료: {resumed_count}개")
                        self.send_json_response({"success": True, "resumedCount": resumed_count})
                    else:
                        log_error("대량 가게 재개 저장 실패")
                        self.send_json_response({"error": "저장 실패"}, 500)
                
                except Exception as e:
                    log_error("대량 가게 재개 중 오류", e)
                    self.send_json_response({"error": str(e)}, 500)
            
            elif parsed_path.path == '/api/stores/bulk-import':
                # 대량 가게 가져오기 (CSV/JSON)
                data = self.get_request_data()
                if not data:
                    self.send_json_response({"error": "Invalid data"}, 400)
                    return
                
                # CSV 형식 지원
                import_format = data.get('format', 'json')
                stores = []
                
                if import_format == 'csv':
                    # CSV 데이터 파싱
                    import csv
                    import io
                    
                    csv_data = data.get('csvData', '')
                    if not csv_data:
                        self.send_json_response({"error": "csvData is required"}, 400)
                        return
                    
                    # UTF-8 BOM 제거
                    if csv_data.startswith('\ufeff'):
                        csv_data = csv_data[1:]
                    
                    reader = csv.DictReader(io.StringIO(csv_data))
                    for row in reader:
                        stores.append({
                            'name': row.get('name', ''),
                            'subtitle': row.get('subtitle', ''),
                            'phone': row.get('phone', ''),
                            'address': row.get('address', ''),
                            'status': row.get('status', 'active')
                        })
                else:
                    # JSON 형식
                    stores = data.get('stores', [])
                
                if not stores:
                    self.send_json_response({"error": "stores is required"}, 400)
                    return
                
                log(LogLevel.INFO, f"대량 가게 가져오기 요청: {len(stores)}개 가게 ({import_format.upper()} 형식)")
                
                try:
                    store_data = self.load_data()
                    imported_count = 0
                    imported_stores = []
                    
                    for store in stores:
                        # 필수 필드 확인
                        if 'name' not in store:
                            continue
                        
                        # 새 가게 ID 생성
                        import secrets
                        store_id = f"store_{int(datetime.now().timestamp() * 1000)}_{secrets.token_hex(5)}"
                        
                        new_store = {
                            'id': store_id,
                            'name': store.get('name', ''),
                            'subtitle': store.get('subtitle', ''),
                            'phone': store.get('phone', ''),
                            'address': store.get('address', ''),
                            'createdAt': datetime.now().isoformat(),
                            'lastModified': datetime.now().isoformat(),
                            'status': store.get('status', 'active')
                        }
                        
                        store_data['stores'].append(new_store)
                        imported_count += 1
                        imported_stores.append(new_store['name'])
                    
                    if self.save_data(store_data):
                        # 활동 로그 기록
                        try:
                            self.log_activity(
                                log_type="bulk",
                                action="대량 가게 가져오기",
                                description=f"{imported_count}개 가게 일괄 가져오기\n가져온 가게: {', '.join(imported_stores[:5])}{' 외 ' + str(len(imported_stores) - 5) + '개' if len(imported_stores) > 5 else ''}",
                                user_id="admin",
                                user_name="슈퍼어드민",
                                target_type="stores",
                                target_id="bulk_import",
                                target_name=f"{imported_count}개 가게",
                                details={"importedCount": imported_count, "importedStores": imported_stores}
                            )
                        except Exception as log_error:
                            log(LogLevel.WARN, f"활동 로그 기록 실패 (무시): {log_error}")
                        
                        log(LogLevel.INFO, f"대량 가게 가져오기 완료: {imported_count}개")
                        self.send_json_response({"success": True, "importedCount": imported_count})
                    else:
                        log_error("대량 가게 가져오기 저장 실패")
                        self.send_json_response({"error": "저장 실패"}, 500)
                
                except Exception as e:
                    log_error("대량 가게 가져오기 중 오류", e)
                    self.send_json_response({"error": str(e)}, 500)
            
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
                
                # 변경 전 정보 저장 (활동 로그용)
                old_data = {
                    'name': store.get('name', ''),
                    'subtitle': store.get('subtitle', ''),
                    'phone': store.get('phone', ''),
                    'address': store.get('address', '')
                }
                
                # 변경된 항목 추적
                changed_fields = []
                changes = {}
                
                # 가게 정보 업데이트
                if 'name' in data and data['name'] != old_data['name']:
                    changes['name'] = {'old': old_data['name'], 'new': data['name']}
                    changed_fields.append('가게명')
                    store['name'] = data['name']
                if 'subtitle' in data and data['subtitle'] != old_data['subtitle']:
                    changes['subtitle'] = {'old': old_data['subtitle'], 'new': data['subtitle']}
                    changed_fields.append('하단 텍스트')
                    store['subtitle'] = data['subtitle']
                if 'phone' in data and data['phone'] != old_data['phone']:
                    changes['phone'] = {'old': old_data['phone'], 'new': data['phone']}
                    changed_fields.append('전화번호')
                    store['phone'] = data['phone']
                if 'address' in data and data['address'] != old_data['address']:
                    changes['address'] = {'old': old_data['address'], 'new': data['address']}
                    changed_fields.append('주소')
                    store['address'] = data['address']
                
                # 데이터 저장 시도
                if not self.save_data(store_data):
                    log_error(f"가게 정보 저장 실패: {store_id}")
                    self.send_json_response({
                        "error": "가게 정보 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
                        "details": "파일 저장 중 오류가 발생했습니다."
                    }, 500)
                    return
                
                # 활동 로그 기록 (변경된 항목이 있을 때만)
                if changed_fields:
                    change_description = '\n'.join([
                        f"{field}: {changes[key]['old']} → {changes[key]['new']}"
                        for field, key in [
                            ('가게명', 'name'),
                            ('하단 텍스트', 'subtitle'),
                            ('전화번호', 'phone'),
                            ('주소', 'address')
                        ]
                        if key in changes
                    ])
                    
                    self.log_activity(
                        log_type="store",
                        action="가게 정보 수정",
                        description=f"'{store['name']}' 가게의 기본 정보를 수정했습니다.\n변경 항목: {', '.join(changed_fields)}\n\n{change_description}",
                        user_id="admin",
                        user_name="관리자",
                        target_type="store",
                        target_id=store_id,
                        target_name=store['name'],
                        details={
                            "changedFields": changed_fields,
                            "changes": changes
                        }
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
                deleted_store = None
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
                had_settings = False
                if store_id in data.get('settings', {}):
                    del data['settings'][store_id]
                    had_settings = True
                    log(LogLevel.INFO, f"가게 설정 삭제 완료: {store_id}")
                
                self.save_data(data)
                
                # 활동 로그 기록
                self.log_activity(
                    log_type="store",
                    action="가게 삭제",
                    description=f"'{deleted_store.get('name', 'Unknown')}' 가게가 삭제되었습니다.\n가게 ID: {store_id}\n전화번호: {deleted_store.get('phone', '없음')}\n주소: {deleted_store.get('address', '없음')}\n설정 삭제: {'예' if had_settings else '아니오'}",
                    user_id="admin",
                    user_name="관리자",
                    target_type="store",
                    target_id=store_id,
                    target_name=deleted_store.get('name', 'Unknown'),
                    details={
                        "deletedStore": {
                            "id": store_id,
                            "name": deleted_store.get('name', ''),
                            "phone": deleted_store.get('phone', ''),
                            "address": deleted_store.get('address', ''),
                            "createdAt": deleted_store.get('createdAt', '')
                        },
                        "hadSettings": had_settings,
                        "deletedAt": datetime.now().isoformat()
                    }
                )
                
                self.send_json_response({"success": True, "message": "가게가 삭제되었습니다."})
            
            elif self.path.startswith('/api/qr/'):
                # QR 코드 삭제
                store_id = self.path.split('/')[-1]
                log(LogLevel.INFO, f"QR 코드 삭제 요청: {store_id}")
                
                try:
                    data = self.load_data()
                    
                    # 가게 정보 가져오기
                    store = next((s for s in data.get('stores', []) if s['id'] == store_id), None)
                    store_name = store['name'] if store else store_id
                    
                    # QR 코드 정보 가져오기
                    settings = data.get('settings', {}).get(store_id, {})
                    qr_code = settings.get('qrCode')
                    
                    if not qr_code:
                        log(LogLevel.WARN, f"삭제할 QR 코드가 없음: {store_id}")
                        self.send_json_response({"error": "QR code not found"}, 404)
                        return
                    
                    # 삭제 전 정보 저장 (활동 로그용)
                    deleted_filepath = qr_code.get('filepath', '')
                    deleted_url = qr_code.get('url', '')
                    
                    # 파일 삭제
                    if 'filepath' in qr_code:
                        filepath = qr_code['filepath']
                        if os.path.exists(filepath):
                            os.remove(filepath)
                            log(LogLevel.INFO, f"QR 코드 파일 삭제: {filepath}")
                    
                    # settings에서 QR 코드 정보 삭제
                    del data['settings'][store_id]['qrCode']
                    self.save_data(data)
                    
                    # 활동 로그 기록
                    self.log_activity(
                        log_type="qr",
                        action="QR 코드 삭제",
                        description=f"'{store_name}' 가게의 QR 코드가 삭제되었습니다.\n삭제된 파일: {deleted_filepath}\n삭제된 URL: {deleted_url}",
                        user_id="admin",
                        user_name="관리자",
                        target_type="qr",
                        target_id=store_id,
                        target_name=store_name,
                        details={
                            "deletedFile": deleted_filepath,
                            "deletedUrl": deleted_url,
                            "deletedAt": datetime.now().isoformat()
                        }
                    )
                    
                    log(LogLevel.INFO, f"QR 코드 삭제 완료: {store_id}")
                    self.send_json_response({"success": True, "message": "QR 코드가 삭제되었습니다."})
                    
                except Exception as e:
                    log_error(f"QR 코드 삭제 중 오류: {store_id}", e)
                    self.send_json_response({"error": str(e)}, 500)
                
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