/**
 * Node.js API 서버
 * 기존 Python API 서버를 Node.js로 교체
 * PostgreSQL 데이터베이스 사용
 *
 * @author DOCORE
 */

const http = require('http');
const url = require('url');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const QRCode = require('qrcode');
const OpenAI = require('openai');

// 데이터베이스 서비스 import
const dbServices = require('../database/services');
const db = require('../database/connection');

// 환경변수 로드
require('dotenv').config({ path: path.join(__dirname, '../../env.database') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const PORT = process.env.PORT || 8081;
const DATA_BACKEND = process.env.DATA_BACKEND || 'postgres';

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000,
});

// 로그 함수
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [${level}] ${message} | ${JSON.stringify(data)}`);
  } else {
    console.log(`[${timestamp}] [${level}] ${message}`);
  }
}

function logRequest(method, path, statusCode, responseTime = null) {
  const timestamp = new Date().toISOString();
  if (responseTime) {
    console.log(`[${timestamp}] [INFO] ${method} ${path} -> ${statusCode} (${responseTime}ms)`);
  } else {
    console.log(`[${timestamp}] [INFO] ${method} ${path} -> ${statusCode}`);
  }
}

// CORS 헤더 설정
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// JSON 응답 전송
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

// 에러 응답 전송
function sendErrorResponse(res, statusCode, message) {
  sendJsonResponse(res, statusCode, { error: message });
}

// 요청 본문 파싱
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (req.headers['content-type']?.includes('application/json')) {
          resolve(JSON.parse(body));
        } else {
          resolve(querystring.parse(body));
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

// 정적 파일 서빙
function serveStaticFile(req, res, filePath) {
  try {
    console.log('🔍 [DEBUG] serveStaticFile 호출:', filePath);
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ [DEBUG] 파일이 존재하지 않음:', filePath);
      return false;
    }

    const stat = fs.statSync(filePath);
    console.log('🔍 [DEBUG] 파일 상태:', { size: stat.size, isDirectory: stat.isDirectory() });
    
    if (stat.isDirectory()) {
      // 디렉토리인 경우 index.html 찾기
      const indexPath = path.join(filePath, 'index.html');
      console.log('🔍 [DEBUG] index.html 경로:', indexPath);
      if (fs.existsSync(indexPath)) {
        filePath = indexPath;
        console.log('🔍 [DEBUG] index.html 사용:', filePath);
      } else {
        console.log('❌ [DEBUG] index.html이 존재하지 않음');
        return false;
      }
    }

    const ext = path.extname(filePath);
    const contentType = mime.lookup(ext) || 'application/octet-stream';
    console.log('🔍 [DEBUG] Content-Type:', contentType);
    
    // CORS 헤더 추가
    setCorsHeaders(res);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    
    console.log('🔍 [DEBUG] 파일 스트림 시작:', filePath);
    
    // 파일을 스트림으로 전송 (바이너리 파일 지원)
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    return true;
  } catch (error) {
    console.log('❌ [DEBUG] serveStaticFile 오류:', error);
    log('ERROR', '정적 파일 서빙 실패', { filePath, error: error.message });
    return false;
  }
}

// API 라우터
class APIRouter {
  constructor() {
    this.routes = new Map();
    this.setupRoutes();
  }

  generateTemporaryPassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  setupRoutes() {
    // GET /api/data - 전체 데이터 조회
    this.routes.set('GET /api/data', this.getData.bind(this));
    
    // GET /api/stores/:storeId - 개별 가게 조회 (더 구체적인 라우트를 먼저 등록)
    this.routes.set('GET /api/stores/:storeId', this.getStoreById.bind(this));
    
    // GET /api/stores - 가게 목록 조회
    this.routes.set('GET /api/stores', this.getStores.bind(this));
    
    // GET /api/current-store - 현재 가게 조회
    this.routes.set('GET /api/current-store', this.getCurrentStore.bind(this));
    
    // GET /api/healthz - 헬스체크
    this.routes.set('GET /api/healthz', this.getHealthCheck.bind(this));
    
    // POST /api/admin/login - 관리자 로그인
    this.routes.set('POST /api/admin/login', this.postAdminLogin.bind(this));
    
    // GET /api/activity-logs - 활동 로그 조회
    this.routes.set('GET /api/activity-logs', this.getActivityLogs.bind(this));
    
    // GET /api/release-notes - 릴리즈 노트 조회
    this.routes.set('GET /api/release-notes', this.getReleaseNotes.bind(this));
    
    // GET /api/settings - 설정 조회
    this.routes.set('GET /api/settings', this.getSettings.bind(this));
    
    // GET /api/superadmin/info - 슈퍼어드민 정보 조회
    this.routes.set('GET /api/superadmin/info', this.getSuperAdminInfo.bind(this));
    
    // GET /api/users/ - 가게별 사용자 조회 (동적 라우팅)
    this.routes.set('GET /api/users/', this.getUsersByStore.bind(this));
    
    // 점주 계정 및 입점 요청
    this.routes.set('POST /api/owners/request', this.requestOwnerAccount.bind(this));
    this.routes.set('GET /api/owners', this.getOwnerAccounts.bind(this));
    this.routes.set('POST /api/owners/login', this.postOwnerLogin.bind(this));
    
    // POST /api/store/select - 가게 선택
    this.routes.set('POST /api/store/select', (req, res, parsedUrl) => {
      log('INFO', '가게 선택 API 호출됨');
      sendJsonResponse(res, 200, { 
        success: true, 
        message: '가게가 선택되었습니다.',
        storeId: 'test_store_id' 
      });
    });
    
    // POST /api/current-store - 현재 가게 설정 (프론트엔드 호환성)
    this.routes.set('POST /api/current-store', this.postCurrentStore.bind(this));
    
    // POST /api/qr/generate - QR 코드 생성
    this.routes.set('POST /api/qr/generate', this.postQrGenerate.bind(this));
    
    // DELETE /api/qr/:storeId - QR 코드 삭제
    this.routes.set('DELETE /api/qr/:storeId', this.deleteQrCode.bind(this));
    
    // POST /api/activity-logs - 활동 로그 생성
    this.routes.set('POST /api/activity-logs', this.postActivityLog.bind(this));
    
    // POST /api/ai/generate-content - AI 콘텐츠 생성
    this.routes.set('POST /api/ai/generate-content', this.generateAIContent.bind(this));
    
    // POST /api/stores/update - 가게 정보 업데이트 (호환성)
    this.routes.set('POST /api/stores/update', this.postStoresUpdate.bind(this));
    
    // GET /api/store/:storeId/settings - 가게 설정 조회
    this.routes.set('GET /api/store/:storeId/settings', this.getStoreSettings.bind(this));
    
    // GET /api/store/:storeId/domain-settings - 도메인 설정 조회
    this.routes.set('GET /api/store/:storeId/domain-settings', this.getDomainSettings.bind(this));
    
    // POST /api/store/:storeId/domain-settings - 도메인 설정 저장
    this.routes.set('POST /api/store/:storeId/domain-settings', this.saveDomainSettings.bind(this));
    
    // POST /api/stores - 가게 생성
    this.routes.set('POST /api/stores', this.createStore.bind(this));
    
    // PUT /api/stores/:storeId - 가게 수정
    this.routes.set('PUT /api/stores/:storeId', this.updateStore.bind(this));
    
    // DELETE /api/stores/:storeId - 가게 삭제
    this.routes.set('DELETE /api/stores/:storeId', this.deleteStore.bind(this));
    
    // POST /api/stores/:storeId/pause - 가게 일시정지
    this.routes.set('POST /api/stores/:storeId/pause', this.pauseStore.bind(this));
    
    // POST /api/stores/:storeId/resume - 가게 재개
    this.routes.set('POST /api/stores/:storeId/resume', this.resumeStore.bind(this));
    
    // GET /api/store/subdomain/:subdomain - 서브도메인으로 가게 조회
    this.routes.set('GET /api/store/subdomain/:subdomain', this.getStoreBySubdomain.bind(this));
+    this.routes.set('POST /api/superadmin/update', this.updateSuperAdminAccount.bind(this));
  }

  async handleRequest(req, res) {
    const startTime = Date.now();
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;
    const pathname = parsedUrl.pathname;
    const routeKey = `${method} ${pathname}`;

    try {
      // CORS 헤더 설정
      setCorsHeaders(res);

      // OPTIONS 요청 처리
      if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // 동적 API 라우트 처리
      let handler = null;
      
      if (pathname.startsWith('/api/store/')) {
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) { // /api/store/:id
          // 서브도메인 라우트 먼저 확인
          if (parts.length === 5 && parts[3] === 'subdomain' && parts[4]) { // GET /api/store/subdomain/:subdomain
            const subdomain = parts[4];
            handler = (req, res, parsedUrl) => this.getStoreBySubdomain(req, res, parsedUrl);
          } else {
            // 일반 가게 라우트
            const storeId = parts[3];
            if (parts.length === 4) { // GET /api/store/:id
              handler = this.getStoreById.bind(this, storeId);
            } else if (parts.length === 5 && parts[4] === 'settings') { // GET/POST /api/store/:id/settings
              if (method === 'GET') {
                handler = (req, res, parsedUrl) => this.getStoreSettings(storeId, req, res, parsedUrl);
              } else if (method === 'POST') {
                handler = (req, res, parsedUrl) => this.updateStoreSettings(storeId, req, res, parsedUrl);
              }
            } else if (parts.length === 5 && parts[4] === 'domain-settings') { // GET/POST /api/store/:id/domain-settings
              if (method === 'GET') {
                handler = (req, res, parsedUrl) => this.getDomainSettings(req, res, parsedUrl);
              } else if (method === 'POST') {
                handler = (req, res, parsedUrl) => this.saveDomainSettings(req, res, parsedUrl);
              }
            }
          }
        }
      } else if (pathname.startsWith('/api/users/')) {
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) { // /api/users/:storeId
          const storeId = parts[3];
          handler = this.getUsersByStore.bind(this, storeId);
        }
      } else if (pathname.startsWith('/api/owners/')) {
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) {
          const ownerId = parts[3];
          const action = parts[4] || '';
          if (action === 'approve' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.approveOwnerAccount(ownerId, req, res, parsedUrl);
          } else if (action === 'reject' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.rejectOwnerAccount(ownerId, req, res, parsedUrl);
          }
        }
      } else if (pathname.startsWith('/api/qr-codes/')) {
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) { // /api/qr-codes/:storeId
          const storeId = parts[3];
          handler = this.getQRCodesByStore.bind(this, storeId);
        }
      } else if (pathname.startsWith('/api/stores/')) {
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) { // /api/stores/:storeId
          const storeId = parts[3];
          if (parts.length === 4) { // GET/PUT/DELETE /api/stores/:storeId
            if (method === 'GET') {
              handler = (req, res, parsedUrl) => this.getStoreById(req, res, parsedUrl);
            } else if (method === 'PUT') {
              handler = (req, res, parsedUrl) => this.updateStore(req, res, parsedUrl);
            } else if (method === 'DELETE') {
              handler = (req, res, parsedUrl) => this.deleteStore(req, res, parsedUrl);
            }
          } else if (parts.length === 5) { // /api/stores/:storeId/action
            const action = parts[4];
            if (action === 'pause' && method === 'POST') {
              handler = (req, res, parsedUrl) => this.pauseStore(req, res, parsedUrl);
            } else if (action === 'resume' && method === 'POST') {
              handler = (req, res, parsedUrl) => this.resumeStore(req, res, parsedUrl);
            }
          }
        }
      } else if (pathname.startsWith('/api/qr/')) {
              const parts = pathname.split('/');
              if (parts.length >= 4 && parts[3]) { // /api/qr/:storeId
                const storeId = parts[3];
                if (method === 'DELETE') {
                  handler = this.deleteQrCode.bind(this);
                }
              }
            } else if (pathname === '/api/ai/generate-content') {
              if (method === 'POST') {
                handler = this.generateAIContent.bind(this);
              }
            } else if (pathname === '/api/generate-domain-qr') {
              if (method === 'POST') {
                handler = this.generateDomainQR.bind(this);
              }
            } else if (pathname === '/api/delete-domain-qr') {
              if (method === 'DELETE') {
                handler = this.deleteDomainQR.bind(this);
              }
            }

      // 정적 라우트 확인
      if (!handler) {
        handler = this.routes.get(routeKey);
      }

      if (handler) {
        // API 핸들러 실행
        await handler(req, res, parsedUrl);
        const responseTime = Date.now() - startTime;
        logRequest(method, pathname, 200, responseTime);
        return;
      }

      const allowedHtmlPaths = new Set(['/store.html', '/owner/request.html']);

      // HTML 파일 직접 접근 차단 (보안) - 먼저 체크
      if (pathname.endsWith('.html') && !allowedHtmlPaths.has(pathname)) {
        sendErrorResponse(res, 404, '페이지를 찾을 수 없습니다.');
        return;
      }

      // URL 라우팅 (HTML 확장자 노출 방지)
      const publicPath = path.join(__dirname, '../../');
      let filePath;
      
      // /admin 또는 /admin/ -> /admin/dashboard.html
      if (pathname === '/admin' || pathname === '/admin/') {
        filePath = path.join(publicPath, 'admin/dashboard.html');
        console.log('🔍 [DEBUG] Admin 라우팅:', { pathname, filePath, exists: require('fs').existsSync(filePath) });
      }
      // /admin/* -> /admin/*.html (admin 하위 페이지들)
      else if (pathname.startsWith('/admin/')) {
        const adminPage = pathname.substring(7); // Remove '/admin/'
        if (adminPage && !adminPage.includes('.')) {
          filePath = path.join(publicPath, 'admin', adminPage + '.html');
        } else {
          filePath = path.join(publicPath, 'admin', adminPage);
        }
      }
      // /login -> /admin/login.html
      else if (pathname === '/login') {
        filePath = path.join(publicPath, 'admin/login.html');
      }
      // / -> /index.html
      else if (pathname === '/') {
        filePath = path.join(publicPath, 'index.html');
      }
      // /owner 또는 /owner/ -> /owner/request.html
      else if (pathname === '/owner' || pathname === '/owner/') {
        filePath = path.join(publicPath, 'owner/request.html');
      }
      // /owner/request -> /owner/request.html
      else if (pathname === '/owner/request') {
        filePath = path.join(publicPath, 'owner/request.html');
      }
      // /storename -> /store.html?subdomain=storename (서브도메인 라우팅)
      else if (pathname.startsWith('/') && !pathname.includes('.') && !pathname.startsWith('/api/')) {
        const subdomain = pathname.substring(1); // Remove leading '/'
        
        // 서브도메인으로 가게 조회
        try {
          const store = await dbServices.getStoreBySubdomain(subdomain);
          if (store) {
            // 가게가 일시정지 상태인지 확인
            if (store.status === 'paused') {
              // 일시정지된 가게는 paused.html로 리다이렉트
              filePath = path.join(publicPath, 'paused.html');
            } else {
              // 정상 운영 중인 가게는 store.html 서빙
              filePath = path.join(publicPath, 'store.html');
              // Note: 실제로는 클라이언트에서 subdomain을 읽어서 가게 정보를 로드해야 함
            }
          } else {
            // 서브도메인에 해당하는 가게가 없으면 기본 파일 경로 사용
            filePath = path.join(publicPath, pathname.substring(1));
          }
        } catch (error) {
          log('ERROR', '서브도메인 조회 실패', error);
          filePath = path.join(publicPath, pathname.substring(1));
        }
      }
      // 기타 정적 파일
      else {
        filePath = path.join(publicPath, pathname.substring(1));
      }
      
      console.log('🔍 [DEBUG] 정적 파일 경로:', { 
        __dirname, 
        publicPath, 
        pathname, 
        filePath,
        exists: require('fs').existsSync(filePath)
      });
      
      // Admin 라우팅 디버깅
      if (pathname === '/admin' || pathname === '/admin/') {
        console.log('🔍 [DEBUG] Admin 라우팅 상세:', { 
          pathname, 
          filePath, 
          exists: require('fs').existsSync(filePath),
          publicPath,
          __dirname
        });
      }
      
      // 보안을 위해 상위 디렉토리 접근 방지
      if (!filePath.startsWith(publicPath)) {
        logRequest(method, pathname, 403);
        sendErrorResponse(res, 403, 'Forbidden');
        return;
      }

      // 정적 파일 서빙
      if (serveStaticFile(req, res, filePath)) {
        const responseTime = Date.now() - startTime;
        logRequest(method, pathname, 200, responseTime);
        return;
      }

      // 404 처리
      logRequest(method, pathname, 404);
      sendErrorResponse(res, 404, 'Not Found');

    } catch (error) {
      const responseTime = Date.now() - startTime;
      log('ERROR', '요청 처리 실패', { error: error.message, route: routeKey });
      logRequest(method, pathname, 500, responseTime);
      sendErrorResponse(res, 500, 'Internal Server Error');
    }
  }

  async getData(req, res, parsedUrl) {
    try {
      const data = await dbServices.getAllData();
      sendJsonResponse(res, 200, data);
    } catch (error) {
      log('ERROR', '데이터 조회 실패', error);
      sendErrorResponse(res, 500, '데이터 조회 실패');
    }
  }

  async getStores(req, res, parsedUrl) {
    try {
      const { storeId } = parsedUrl.query || {};
      const stores = await dbServices.getStores(storeId || null);
      sendJsonResponse(res, 200, stores);
    } catch (error) {
      log('ERROR', '가게 목록 조회 실패', error);
      sendErrorResponse(res, 500, '가게 목록 조회 실패');
    }
  }

  async getStoreById(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3] || parsedUrl.query?.storeId;

      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      sendJsonResponse(res, 200, store);
    } catch (error) {
      log('ERROR', '가게 조회 실패', error);
      sendErrorResponse(res, 500, '가게 조회에 실패했습니다.');
    }
  }

  async getCurrentStore(req, res, parsedUrl) {
    try {
      const currentStoreId = await dbServices.getCurrentStoreId();
      if (!currentStoreId) {
        sendErrorResponse(res, 404, '현재 가게가 설정되지 않았습니다.');
        return;
      }

      const store = await dbServices.getStoreById(currentStoreId);
      if (!store) {
        sendErrorResponse(res, 404, '현재 가게를 찾을 수 없습니다.');
        return;
      }

      sendJsonResponse(res, 200, store);
    } catch (error) {
      log('ERROR', '현재 가게 조회 실패', error);
      sendErrorResponse(res, 500, '현재 가게 조회 실패');
    }
  }

  async getHealthCheck(req, res, parsedUrl) {
    try {
      const health = await db.healthCheck();
      sendJsonResponse(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: health
      });
    } catch (error) {
      log('ERROR', '헬스체크 실패', error);
      sendJsonResponse(res, 500, {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  async postAdminLogin(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { username, password } = body;

      if (!username || !password) {
        sendErrorResponse(res, 400, '사용자명과 비밀번호가 필요합니다.');
        return;
      }

      const result = await dbServices.authenticateSuperAdmin(username, password);
      
      if (result.success) {
        sendJsonResponse(res, 200, {
          success: true,
          token: result.token,
          message: '로그인 성공'
        });
      } else {
        sendErrorResponse(res, 401, result.error);
      }
    } catch (error) {
      log('ERROR', '관리자 로그인 실패', error);
      sendErrorResponse(res, 500, '로그인 처리 실패');
    }
  }

  async postOwnerLogin(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { email, password } = body;

      if (!email || !password) {
        sendErrorResponse(res, 400, '이메일과 비밀번호가 필요합니다.');
        return;
      }

      const result = await dbServices.authenticateStoreOwner(email, password);

      if (!result.success) {
        sendErrorResponse(res, 401, result.error || '로그인에 실패했습니다.');
        return;
      }

      await dbServices.recordOwnerLogin(result.owner.id);

      sendJsonResponse(res, 200, {
        success: true,
        owner: result.owner,
        message: '로그인 성공'
      });
    } catch (error) {
      log('ERROR', '점주 로그인 실패', error);
      sendErrorResponse(res, 500, '로그인 처리 실패');
    }
  }

  async getActivityLogs(req, res, parsedUrl) {
    try {
      const logs = await dbServices.getActivityLogs();
      sendJsonResponse(res, 200, logs);
    } catch (error) {
      log('ERROR', '활동 로그 조회 실패', error);
      sendErrorResponse(res, 500, '활동 로그 조회 실패');
    }
  }

  async requestOwnerAccount(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { name, email, phone, storeId, message, requestData } = body;

      if (!name || !email) {
        sendErrorResponse(res, 400, '이름과 이메일은 필수입니다.');
        return;
      }

      const result = await dbServices.createOwnerRequest({
        name,
        email,
        phone,
        storeId,
        message,
        requestData
      });

      sendJsonResponse(res, 200, {
        success: result.success,
        ownerId: result.ownerId,
        status: result.status,
        storeId: result.storeId || null,
        message: result.success
          ? '입점 요청이 접수되었습니다.'
          : result.error
      });
    } catch (error) {
      log('ERROR', '점주 입점 요청 처리 실패', error);
      sendErrorResponse(res, 500, '입점 요청 처리에 실패했습니다.');
    }
  }

  async getOwnerAccounts(req, res, parsedUrl) {
    try {
      const { status } = parsedUrl.query || {};
      const owners = await dbServices.getOwnerAccounts(status || null);
      sendJsonResponse(res, 200, {
        success: true,
        data: owners
      });
    } catch (error) {
      log('ERROR', '점주 계정 목록 조회 실패', error);
      sendErrorResponse(res, 500, '계정 목록 조회에 실패했습니다.');
    }
  }

  async approveOwnerAccount(ownerId, req, res, parsedUrl) {
     try {
       const body = await parseRequestBody(req);
       const { storeId: manualStoreId = null, password } = body || {};

       const ownerDetail = await dbServices.getOwnerAccountDetail(ownerId);
       if (!ownerDetail) {
         sendErrorResponse(res, 404, '입점 요청 정보를 찾을 수 없습니다.');
         return;
       }

       let resolvedStoreId = manualStoreId || ownerDetail.storeId || null;
       let storeRecord = null;

       if (!resolvedStoreId) {
         const requestData = ownerDetail.requestData || {};
         const newStore = await dbServices.createStore({
           name: requestData.storeName || ownerDetail.ownerName || ownerDetail.email,
           address: requestData.storeAddress || '',
           phone: ownerDetail.phone || '',
           status: 'pending'
         });
         resolvedStoreId = newStore.id;
         storeRecord = newStore;
       }

       const tempPassword = password || this.generateTemporaryPassword();

       const updatedOwner = await dbServices.approveOwnerAccount(ownerId, {
         storeId: resolvedStoreId,
         passwordHash: tempPassword
       });

       if (!storeRecord) {
         try {
           storeRecord = await dbServices.getStoreById(resolvedStoreId);
         } catch (error) {
           storeRecord = null;
         }
       }

       const responseStore = storeRecord ? {
         id: storeRecord.id || resolvedStoreId,
         name: storeRecord.name || storeRecord.basic?.storeName || ownerDetail.requestData?.storeName || '',
         address: storeRecord.address || storeRecord.basic?.storeAddress || ownerDetail.requestData?.storeAddress || ''
       } : {
         id: resolvedStoreId,
         name: ownerDetail.requestData?.storeName || '',
         address: ownerDetail.requestData?.storeAddress || ''
       };

       sendJsonResponse(res, 200, {
         success: true,
         owner: updatedOwner,
         tempPassword,
         store: responseStore,
         message: '계정이 승인되었습니다.'
       });
     } catch (error) {
       log('ERROR', '점주 계정 승인 실패', error);
       sendErrorResponse(res, 500, error.message || '계정 승인에 실패했습니다.');
     }
   }

  async rejectOwnerAccount(ownerId, req, res, parsedUrl) {
     try {
       const body = await parseRequestBody(req);
       const { reason = '' } = body || {};
       const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

       if (!trimmedReason) {
         sendErrorResponse(res, 400, '거절 사유를 입력해주세요.');
         return;
       }

       const result = await dbServices.rejectOwnerAccount(ownerId, trimmedReason);

       sendJsonResponse(res, 200, {
         success: true,
         owner: result,
         message: '요청이 거절되었습니다.'
       });
     } catch (error) {
       log('ERROR', '점주 계정 거절 실패', error);
       sendErrorResponse(res, 500, error.message || '요청 거절 처리에 실패했습니다.');
     }
   }

  async getReleaseNotes(req, res, parsedUrl) {
    try {
      const notes = await dbServices.getReleaseNotes();
      sendJsonResponse(res, 200, notes);
    } catch (error) {
      log('ERROR', '릴리즈 노트 조회 실패', error);
      sendErrorResponse(res, 500, '릴리즈 노트 조회 실패');
    }
  }

  async getSettings(req, res, parsedUrl) {
    try {
      const storeId = parsedUrl.query.storeId;
      
      if (storeId) {
        // 특정 가게 설정 조회 - 데이터베이스에서 읽기
        const store = await dbServices.getStoreById(storeId);
        if (!store) {
          sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
          return;
        }
        
        const settings = await dbServices.getStoreSettings(storeId);
        
        // 기본 정보는 store에서, 나머지는 settings에서 가져오기
        const storeData = {
          id: store.id,
          basic: {
            storeName: store.name,
            storeSubtitle: store.subtitle,
            storePhone: store.phone,
            storeAddress: store.address,
          },
          discount: settings.discount || {
            title: '',
            enabled: false,
            description: '',
          },
          delivery: settings.delivery || {
            baeminUrl: '',
            ttaengUrl: '',
            yogiyoUrl: '',
            coupangUrl: '',
            deliveryOrder: [],
          },
          pickup: settings.pickup || {
            title: '',
            enabled: false,
            description: '',
          },
          images: settings.images || {
            mainLogo: '',
            menuImage: '',
          },
          businessHours: settings.businessHours || {},
          sectionOrder: settings.sectionOrder || [],
          qrCode: settings.qrCode || {
            url: '',
            filepath: '',
            createdAt: null,
          },
          createdAt: store.createdAt,
          updatedAt: store.lastModified,
        };
        
        sendJsonResponse(res, 200, storeData);
      } else {
        // 전체 설정 조회 (기존 방식)
        const data = await dbServices.getAllData();
        sendJsonResponse(res, 200, data.settings || {});
      }
    } catch (error) {
      log('ERROR', '설정 조회 실패', error);
      sendErrorResponse(res, 500, '설정 조회 실패');
    }
  }

  // 가게 설정 조회
  async getStoreSettings(storeId, req, res, parsedUrl) {
    try {
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      const settings = await dbServices.getStoreSettings(storeId);
      log('INFO', '가게 설정 조회', { storeId });
      sendJsonResponse(res, 200, { success: true, data: settings });
    } catch (error) {
      log('ERROR', '가게 설정 조회 실패', { error: error.message, stack: error.stack });
      sendErrorResponse(res, 500, '가게 설정 조회 실패');
    }
  }

  async updateStoreSettings(storeId, req, res, parsedUrl) {
    try {
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 요청 본문 파싱 (parseRequestBody 함수 사용)
      const settings = await parseRequestBody(req);
      
      log('INFO', '설정 업데이트 요청', { 
        storeId, 
        settingsKeys: Object.keys(settings || {}),
        settingsType: typeof settings,
        settingsLength: JSON.stringify(settings || {}).length
      });
      
      // 설정 업데이트
      await dbServices.updateStoreSettings(storeId, settings);
      
      log('INFO', '설정 업데이트 완료', { storeId });
      
      sendJsonResponse(res, 200, { 
        success: true, 
        message: '설정이 업데이트되었습니다.',
        storeId: storeId
      });
    } catch (error) {
      log('ERROR', '설정 업데이트 실패', { error: error.message, stack: error.stack });
      sendErrorResponse(res, 500, '설정 업데이트 실패');
    }
  }

  async getSuperAdminInfo(req, res, parsedUrl) {
     try {
       const superadmin = await dbServices.getSuperAdmin();
       if (!superadmin) {
         sendErrorResponse(res, 404, '슈퍼어드민 정보를 찾을 수 없습니다. 데이터베이스를 초기화해주세요.');
         return;
       }
 
       sendJsonResponse(res, 200, superadmin);
     } catch (error) {
       log('ERROR', '슈퍼어드민 정보 조회 실패', error);
       sendErrorResponse(res, 500, '슈퍼어드민 정보를 가져오지 못했습니다.');
     }
   }

  async updateSuperAdminAccount(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const username = body?.username?.trim();
      const password = body?.password?.trim();

      if (!username) {
        sendErrorResponse(res, 400, '계정명을 입력해주세요.');
        return;
      }

      const updated = await dbServices.updateSuperAdminAccount({
        username,
        password: password || null
      });

      sendJsonResponse(res, 200, {
        success: true,
        data: {
          id: updated.id,
          username: updated.username,
          createdAt: updated.created_at,
          lastModified: updated.last_modified
        },
        message: '슈퍼어드민 계정 정보가 수정되었습니다.'
      });
    } catch (error) {
      log('ERROR', '슈퍼어드민 계정 수정 실패', error);
      sendErrorResponse(res, 500, error.message || '슈퍼어드민 계정 정보 수정에 실패했습니다.');
    }
  }

  async getUsersByStore(storeId, req, res, parsedUrl) {
    try {
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 가게별 사용자 데이터 (현재는 빈 배열 반환)
      sendJsonResponse(res, 200, []);
    } catch (error) {
      log('ERROR', '가게별 사용자 조회 실패', error);
      sendErrorResponse(res, 500, '가게별 사용자 조회 실패');
    }
  }

  async postCurrentStore(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId } = body;

      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 현재 가게 ID 설정
      await dbServices.setCurrentStoreId(storeId);

      sendJsonResponse(res, 200, {
        success: true,
        message: '가게가 선택되었습니다.',
        storeId: storeId
      });
    } catch (error) {
      log('ERROR', '현재 가게 설정 실패', error);
      sendErrorResponse(res, 500, '현재 가게 설정 실패');
    }
  }

  async postQrGenerate(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId, url } = body;

      if (!storeId || !url) {
        sendErrorResponse(res, 400, 'storeId와 url이 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // QR 코드 디렉토리 확인 및 생성
      const qrDir = path.join(__dirname, '../../assets/images/qrcodes');
      if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir, { recursive: true });
      }

      // QR 코드 파일명 생성 (타임스탬프 포함)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `qr_code_${storeId}_${timestamp}.png`;
      const filePath = path.join(qrDir, fileName);
      const qrCodeUrl = `/assets/images/qrcodes/${fileName}`;

        // QR 코드 생성 옵션 (이전 Python 버전과 동일한 고품질 설정)
        const qrOptions = {
          type: 'png',
          quality: 0.95,
          margin: 4,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          width: 1024,  // 이전 버전과 동일한 크기
          errorCorrectionLevel: 'H'  // 최고 수준 오류 정정 (로고 삽입 시 필수)
        };

      // QR 코드 생성
      await QRCode.toFile(filePath, url, qrOptions);
      
      log('INFO', 'QR 코드 파일 생성 완료', { 
        storeId, 
        url, 
        filePath, 
        qrCodeUrl,
        fileSize: fs.statSync(filePath).size 
      });
      
      // 데이터베이스에 QR 코드 정보 업데이트
      const qrCodeData = {
        url: qrCodeUrl,
        filepath: `assets/images/qrcodes/${fileName}`,
        createdAt: new Date().toISOString()
      };
      
      // 기존 설정을 가져와서 qrCode만 업데이트
      const existingSettings = await dbServices.getStoreSettings(storeId);
      existingSettings.qrCode = qrCodeData;
      
      await dbServices.updateStoreSettings(storeId, existingSettings);

      log('INFO', 'QR 코드 생성 완료', { storeId, url, qrCodeUrl });

      sendJsonResponse(res, 200, {
        success: true,
        data: {
          qrCodeUrl,
          storeId,
          url,
          fileSize: fs.statSync(filePath).size
        }
      });
    } catch (error) {
      log('ERROR', 'QR 코드 생성 실패', error);
      sendErrorResponse(res, 500, 'QR 코드 생성에 실패했습니다.');
    }
  }

  async deleteQrCode(req, res, parsedUrl) {
    try {
      const storeId = parsedUrl.pathname.split('/')[3]; // /api/qr/:storeId에서 storeId 추출
      
      if (!storeId) {
        sendErrorResponse(res, 400, 'storeId가 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 현재 설정에서 QR 코드 정보 가져오기
      const settings = await dbServices.getStoreSettings(storeId);
      if (!settings.qrCode || !settings.qrCode.filepath) {
        sendErrorResponse(res, 404, '삭제할 QR 코드가 없습니다.');
        return;
      }

      // QR 코드 파일 삭제
      const qrFilePath = path.join(__dirname, '../../', settings.qrCode.filepath);
      if (fs.existsSync(qrFilePath)) {
        fs.unlinkSync(qrFilePath);
        log('INFO', 'QR 코드 파일 삭제 완료', { storeId, filePath: qrFilePath });
      }

      // 데이터베이스에서 QR 코드 정보 제거
      settings.qrCode = null;
      await dbServices.updateStoreSettings(storeId, settings);

      log('INFO', 'QR 코드 삭제 완료', { storeId });

      sendJsonResponse(res, 200, {
        success: true,
        message: 'QR 코드가 성공적으로 삭제되었습니다.'
      });
    } catch (error) {
      log('ERROR', 'QR 코드 삭제 실패', error);
      sendErrorResponse(res, 500, 'QR 코드 삭제에 실패했습니다.');
    }
  }

  async postActivityLog(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId, action, details } = body;

      if (!storeId || !action) {
        sendErrorResponse(res, 400, 'storeId와 action이 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 활동 로그 생성
      const logEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        storeId,
        action,
        details: details || '',
        timestamp: new Date().toISOString(),
        user: 'admin' // 실제로는 인증된 사용자 정보 사용
      };

      // 데이터베이스에 활동 로그 저장
      await dbServices.createActivityLog(logEntry);
      log('INFO', '활동 로그 생성', logEntry);

      sendJsonResponse(res, 200, {
        success: true,
        data: logEntry
      });
    } catch (error) {
      log('ERROR', '활동 로그 생성 실패', error);
      sendErrorResponse(res, 500, '활동 로그 생성에 실패했습니다.');
    }
  }

  // AI 콘텐츠 생성 (최적화된 통합 버전)
  async generateAIContent(req, res, parsedUrl) {
    try {
      log('INFO', 'AI 콘텐츠 생성 요청 수신', { url: req.url, method: req.method });
      const body = await parseRequestBody(req);
      log('INFO', 'AI 콘텐츠 생성 요청 본문', body);
      const { type, storeName, storeSubtitle, storePhone, storeAddress, storeId, userPrompt } = body;

      if (!type) {
        log('ERROR', 'AI 콘텐츠 생성 실패: 타입 없음');
        sendErrorResponse(res, 400, '생성할 콘텐츠 타입이 필요합니다.');
        return;
      }

      // 가게 기본 정보
      const basicInfo = {
        storeName: storeName || '우리 가게',
        storeSubtitle: storeSubtitle || '맛있는 음식 전문점',
        storePhone: storePhone || '02-1234-5678',
        storeAddress: storeAddress || '서울시 강남구'
      };

      // AI 콘텐츠 생성 (OpenAI API 시도 후 폴백)
      let generatedContent = {};
      
      try {
        generatedContent = await this.generateWithOpenAI(type, basicInfo, userPrompt);
        log('INFO', 'OpenAI API 콘텐츠 생성 성공', { type, generatedContent });
      } catch (openaiError) {
        log('ERROR', 'OpenAI API 호출 실패, 폴백 사용', { 
          error: openaiError.message, 
          type: type,
          storeName: basicInfo.storeName
        });
        generatedContent = this.generateWithFallback(type, basicInfo);
        log('INFO', '폴백 콘텐츠 생성 완료', { type, generatedContent });
      }

      // 활동 로그 기록
      if (storeId) {
        await this.logActivity('ai', 'AI 콘텐츠 생성', `가게 '${basicInfo.storeName}'의 ${type} 콘텐츠를 AI로 생성했습니다.`, storeId);
      }

      log('INFO', 'AI 콘텐츠 생성 완료', { type, storeName: basicInfo.storeName, generatedContent });
      sendJsonResponse(res, 200, { 
        success: true, 
        content: generatedContent,
        type: type,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      log('ERROR', 'AI 콘텐츠 생성 실패', error);
      sendErrorResponse(res, 500, 'AI 콘텐츠 생성에 실패했습니다.');
    }
  }

  // OpenAI API를 사용한 콘텐츠 생성 (통합)
  async generateWithOpenAI(type, basicInfo, customUserPrompt = '') {
    const systemPrompt = this.getSystemPrompt(type);
    const userPrompt = this.getUserPrompt(type, basicInfo, customUserPrompt);
    
    // 디버깅 로그 추가
    log('INFO', 'AI 프롬프트 생성', {
      type,
      customUserPrompt,
      systemPrompt: systemPrompt.substring(0, 100) + '...',
      userPrompt: userPrompt.substring(0, 200) + '...'
    });
    
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || (type === 'subtitle' ? 200 : 1000),
      response_format: { type: 'json_object' }
    });

    const aiResponse = JSON.parse(response.choices[0].message.content);
    log('INFO', 'AI 응답 생성 완료', { type, aiResponse });
    return this.formatAIResponse(type, aiResponse);
  }

  // 시스템 프롬프트 생성 (타입별)
  getSystemPrompt(type) {
    if (type === 'subtitle') {
      return `당신은 한국의 음식점 마케팅 전문가입니다. 
가게 이름을 보고 매력적인 하단 문구를 작성합니다.

**중요한 지침:**
- 사용자가 제공한 추가 요청사항을 반드시 반영하세요
- 사용자의 요청이 구체적이면 그에 맞춰 문구를 작성하세요
- 사용자의 요청이 모호하면 창의적으로 해석하여 적용하세요

**작성 원칙:**
1. 가게 이름에서 업종을 정확히 파악
2. 20자 이내로 간결하게
3. 고객이 기억하기 쉬운 문구
4. 해당 업종의 특성을 반영
5. 사용자의 요청사항을 우선적으로 고려

**출력 형식:**
반드시 JSON 형식으로만 응답하세요.
{
  "subtitle": "생성된 하단 문구"
}`;
    }
    
    return `당신은 한국의 음식점 마케팅 전문가입니다. 
가게 이름을 보고 업종을 파악하여, 고객들이 매력적으로 느낄 수 있는 할인 안내와 픽업 안내 문구를 작성합니다.

**중요한 지침:**
- 사용자가 제공한 추가 요청사항을 반드시 반영하세요
- 사용자의 요청이 구체적이면 그에 맞춰 문구를 작성하세요
- 사용자의 요청이 모호하면 창의적으로 해석하여 적용하세요
- 사용자의 요청사항이 기존 원칙과 충돌하면 사용자 요청을 우선하세요

**작성 원칙:**
1. 가게 이름에서 업종을 정확히 파악 (예: "미친제육" → 제육볶음 전문점)
2. 해당 업종의 특성을 반영한 자연스러운 문구
3. 고객 입장에서 매력적이고 신뢰감 있는 표현
4. UI를 헤치지 않는 적절한 길이 (할인 제목 15자 이내, 설명 50자 이내, 픽업 제목 20자 이내, 설명 80자 이내)
5. 과장되지 않고 실제로 사용 가능한 현실적인 내용
6. 한국 음식점 문화와 고객 심리를 반영
7. 사용자의 요청사항을 최우선으로 고려

**출력 형식:**
반드시 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 순수 JSON만 출력하세요.
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
    "reasoning": "이렇게 작성한 이유 (사용자 요청사항 반영 여부 포함)"
  }
}`;
  }

  // 사용자 프롬프트 생성 (타입별)
  getUserPrompt(type, basicInfo, customUserPrompt = '') {
    const baseInfo = `가게 이름: ${basicInfo.storeName}
가게 부제목: ${basicInfo.storeSubtitle}
전화번호: ${basicInfo.storePhone}
주소: ${basicInfo.storeAddress}`;

    if (type === 'subtitle') {
      let prompt = `${baseInfo}

위 가게의 하단에 표시할 매력적인 한 줄 문구를 작성해주세요. 
- 20자 이내로 간결하게
- 고객이 기억하기 쉬운 문구
- 해당 업종의 특성을 반영
- JSON 형식: {"subtitle": "문구"}`;

      if (customUserPrompt && customUserPrompt.trim()) {
        prompt += `\n\n**중요한 요청사항:** ${customUserPrompt}
위 요청사항을 반드시 반영하여 문구를 작성해주세요.`;
      }

      return prompt;
    }
    
    let prompt = `${baseInfo}

위 가게의 할인 설정과 픽업 안내를 JSON 형식으로 작성해주세요.`;

    if (customUserPrompt && customUserPrompt.trim()) {
      prompt += `\n\n**중요한 요청사항:** ${customUserPrompt}
위 요청사항을 반드시 반영하여 할인 안내와 픽업 안내를 작성해주세요.`;
    }

    return prompt;
  }

  // AI 응답을 타입별로 포맷팅
  formatAIResponse(type, aiResponse) {
    if (type === 'subtitle') {
      return { subtitle: aiResponse.subtitle };
    } else if (type === 'discount') {
      return {
        title: aiResponse.discount.title,
        description: aiResponse.discount.description
      };
    } else if (type === 'pickup') {
      return {
        title: aiResponse.pickup.title,
        description: aiResponse.pickup.description
      };
    } else if (type === 'both') {
      return {
        discount: {
          title: aiResponse.discount.title,
          description: aiResponse.discount.description
        },
        pickup: {
          title: aiResponse.pickup.title,
          description: aiResponse.pickup.description
        }
      };
    }
    return {};
  }

  // 폴백 콘텐츠 생성 (통합)
  generateWithFallback(type, basicInfo) {
    if (type === 'subtitle') {
      return this.generateSubtitleContent(basicInfo);
    } else if (type === 'discount') {
      const content = this.generateDiscountContent(basicInfo);
      return { title: content.title, description: content.description };
    } else if (type === 'pickup') {
      const content = this.generatePickupContent(basicInfo);
      return { title: content.title, description: content.description };
    } else if (type === 'both') {
      const discountContent = this.generateDiscountContent(basicInfo);
      const pickupContent = this.generatePickupContent(basicInfo);
      return {
        discount: {
          title: discountContent.title,
          description: discountContent.description
        },
        pickup: {
          title: pickupContent.title,
          description: pickupContent.description
        }
      };
    }
    return {};
  }

  // 업종 분류 (공통 로직)
  getStoreCategory(storeName) {
    const name = storeName.toLowerCase();
    
    if (name.includes('제육') || name.includes('볶음') || name.includes('고기')) {
      return 'meat';
    } else if (name.includes('치킨') || name.includes('닭')) {
      return 'chicken';
    } else if (name.includes('분식') || name.includes('떡볶이') || name.includes('순대')) {
      return 'snack';
    } else if (name.includes('카페') || name.includes('커피') || name.includes('음료')) {
      return 'cafe';
    } else if (name.includes('피자') || name.includes('파스타')) {
      return 'pizza';
    } else if (name.includes('중국집') || name.includes('중식') || name.includes('짜장')) {
      return 'chinese';
    } else if (name.includes('일본') || name.includes('라멘') || name.includes('초밥')) {
      return 'japanese';
    } else if (name.includes('한식') || name.includes('김치')) {
      return 'korean';
    }
    return 'general';
  }

  // 업종별 콘텐츠 템플릿
  getContentTemplates() {
    return {
      meat: {
        discount: {
          title: '포장 주문 10% 할인!',
          description: (storeName) => `${storeName}에서 포장 주문하시면 10% 할인 혜택을 드립니다! 맛있는 제육볶음을 더 저렴하게 즐겨보세요.`
        },
        pickup: {
          title: '제육볶음 픽업 안내',
          description: '매장 1층 카운터에서 픽업해주세요. 주문번호를 말씀해주시면 빠르게 받으실 수 있습니다. 주차 공간이 마련되어 있어 편리하게 이용하실 수 있습니다.'
        },
        subtitle: '신선한 제육, 정성스러운 조리'
      },
      chicken: {
        discount: {
          title: '포장 시 2,000원 할인',
          description: '전화 주문 후 방문 픽업하시면 2,000원 할인! 바삭한 치킨을 더 저렴하게 드세요.'
        },
        pickup: {
          title: '치킨 픽업 안내',
          description: '매장 앞 픽업존에서 주문번호를 확인해주세요. 바삭한 치킨을 따뜻하게 받아가실 수 있습니다. 주차는 매장 앞 공용 주차장을 이용해주세요.'
        },
        subtitle: '바삭한 치킨, 특제 양념'
      },
      snack: {
        discount: {
          title: '포장 주문 5% 할인',
          description: '학생 할인 추가 제공! 포장 주문하시면 5% 할인 혜택을 드립니다.'
        },
        pickup: {
          title: '분식 픽업 안내',
          description: '매장 내 픽업 카운터에서 주문번호를 말씀해주세요. 학생 할인도 함께 적용됩니다. 빠른 픽업을 위해 미리 주문해주세요.'
        },
        subtitle: '정통 분식, 학생 할인'
      },
      cafe: {
        discount: {
          title: '테이크아웃 500원 할인',
          description: '일회용품 절약으로 환경도 지키고 할인도 받으세요! 테이크아웃 시 500원 할인.'
        },
        pickup: {
          title: '음료 픽업 안내',
          description: '매장 내 픽업대에서 주문번호를 확인해주세요. 일회용 컵 사용을 줄이기 위해 텀블러 지참을 권장합니다. 주문 후 5-10분 소요됩니다.'
        },
        subtitle: '신선한 원두, 정성스러운 추출'
      },
      pizza: {
        discount: {
          title: '포장 주문 15% 할인',
          description: (storeName) => `${storeName}에서 포장 주문하시면 15% 할인! 신선한 재료로 만든 피자를 더 저렴하게.`
        },
        pickup: {
          title: '피자 픽업 안내',
          description: '매장 1층 픽업존에서 주문번호를 말씀해주세요. 신선한 피자를 따뜻하게 받아가실 수 있습니다. 주차 공간이 넉넉하게 마련되어 있습니다.'
        },
        subtitle: '갓 구운 피자, 정통 이탈리안'
      },
      chinese: {
        discount: {
          title: '포장 주문 8% 할인',
          description: '전화 주문 후 방문 픽업하시면 8% 할인! 정통 중화요리를 더 저렴하게 즐기세요.'
        },
        pickup: {
          title: '중화요리 픽업 안내',
          description: '매장 내 픽업 카운터에서 주문번호를 확인해주세요. 정통 중화요리를 신선하게 받아가실 수 있습니다. 주차는 매장 뒤 주차장을 이용해주세요.'
        },
        subtitle: '정통 중화요리, 맛의 정석'
      },
      japanese: {
        discount: {
          title: '포장 주문 12% 할인',
          description: '신선한 일식을 더 저렴하게! 포장 주문 시 12% 할인 혜택을 드립니다.'
        },
        pickup: {
          title: '일식 픽업 안내',
          description: '매장 내 픽업 카운터에서 주문번호를 확인해주세요. 신선한 일식을 정성스럽게 준비해드립니다.'
        },
        subtitle: '신선한 일식, 정통 일본 맛'
      },
      korean: {
        discount: {
          title: '포장 주문 7% 할인',
          description: '정통 한식을 더 저렴하게! 포장 주문 시 7% 할인 혜택을 드립니다.'
        },
        pickup: {
          title: '한식 픽업 안내',
          description: '매장 내 픽업 카운터에서 주문번호를 확인해주세요. 정통 한식을 정성스럽게 준비해드립니다.'
        },
        subtitle: '정통 한식, 엄마의 손맛'
      },
      general: {
        discount: {
          title: '포장 주문 10% 할인!',
          description: (storeName) => `${storeName}에서 포장 주문하시면 10% 할인 혜택을 드립니다! 맛있는 음식을 더 저렴하게 즐겨보세요.`
        },
        pickup: {
          title: '픽업 장소 안내',
          description: '매장 1층 카운터에서 픽업해주세요. 주문번호를 말씀해주시면 빠르게 받으실 수 있습니다. 주차 공간이 마련되어 있어 편리하게 이용하실 수 있습니다.'
        },
        subtitle: '맛있는 음식, 정성스러운 조리'
      }
    };
  }

  // 할인 콘텐츠 생성 (최적화된 버전)
  generateDiscountContent(basicInfo) {
    const category = this.getStoreCategory(basicInfo.storeName);
    const templates = this.getContentTemplates();
    const template = templates[category] || templates.general;
    
    const title = template.discount.title;
    const description = typeof template.discount.description === 'function' 
      ? template.discount.description(basicInfo.storeName)
      : template.discount.description;
    
    return { title, description };
  }

  // 픽업 콘텐츠 생성 (최적화된 버전)
  generatePickupContent(basicInfo) {
    const category = this.getStoreCategory(basicInfo.storeName);
    const templates = this.getContentTemplates();
    const template = templates[category] || templates.general;
    
    let description = template.pickup.description;
    
    // 주소와 전화번호가 있으면 추가
    if (basicInfo.storeAddress) {
      description += `\n📍 주소: ${basicInfo.storeAddress}`;
    }
    if (basicInfo.storePhone) {
      description += `\n📞 문의: ${basicInfo.storePhone}`;
    }
    
    return { 
      title: template.pickup.title, 
      description 
    };
  }

  // 하단 텍스트 콘텐츠 생성 (최적화된 버전)
  generateSubtitleContent(basicInfo) {
    const category = this.getStoreCategory(basicInfo.storeName);
    const templates = this.getContentTemplates();
    const template = templates[category] || templates.general;
    
    return { subtitle: template.subtitle };
  }

  // 활동 로그 기록 헬퍼 함수
  async logActivity(logType, action, description, storeId) {
    try {
      const logEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        storeId: storeId || 'system',
        action,
        details: description,
        timestamp: new Date().toISOString(),
        user: 'admin'
      };

      // 실제로는 데이터베이스에 저장하지만, 여기서는 로그만 출력
      log('INFO', '활동 로그 기록', logEntry);
    } catch (error) {
      log('ERROR', '활동 로그 기록 실패', error);
    }
  }

  // POST /api/stores/update - 가게 정보 업데이트 (호환성)
  async postStoresUpdate(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      
      if (!body || !body.id) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const storeId = body.id;
      
      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 설정 업데이트
      await dbServices.updateStoreSettings(storeId, body);
      
      log('INFO', '가게 정보 업데이트 완료', { storeId });
      sendJsonResponse(res, 200, { 
        success: true, 
        message: '가게 정보가 업데이트되었습니다.',
        storeId: storeId
      });
    } catch (error) {
      log('ERROR', '가게 정보 업데이트 실패', error);
      sendErrorResponse(res, 500, '가게 정보 업데이트에 실패했습니다.');
    }
  }

  // 도메인 설정 조회
  async getDomainSettings(req, res, parsedUrl) {
    try {
      const storeId = parsedUrl.pathname.split('/')[3]; // /api/store/:storeId/domain-settings

      if (!storeId) {
        sendErrorResponse(res, 400, 'storeId가 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 가게 설정 조회
      const settings = await dbServices.getStoreSettings(storeId);
      const domainSettings = settings.domainSettings || {};

      sendJsonResponse(res, 200, {
        success: true,
        data: {
          subdomain: domainSettings.subdomain || '',
          customDomain: domainSettings.customDomain || '',
          qrCode: settings.qrCode || null,
          domainSettings: {
            subdomain: domainSettings.subdomain || '',
            customDomain: domainSettings.customDomain || '',
            qrCode: settings.qrCode || null
          }
        }
      });
    } catch (error) {
      log('ERROR', '도메인 설정 조회 실패', error);
      sendErrorResponse(res, 500, '도메인 설정 조회에 실패했습니다.');
    }
  }

  // 도메인 설정 저장
  async saveDomainSettings(req, res, parsedUrl) {
    try {
      const storeId = parsedUrl.pathname.split('/')[3]; // /api/store/:storeId/domain-settings
      const body = await parseRequestBody(req);
      const { subdomain, customDomain } = body;

      if (!storeId) {
        sendErrorResponse(res, 400, 'storeId가 필요합니다.');
        return;
      }

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 서브도메인 유효성 검사
      if (subdomain && !/^[a-zA-Z0-9_-]+$/.test(subdomain)) {
        sendErrorResponse(res, 400, '서브도메인은 영문, 숫자, 하이픈, 언더스코어만 사용할 수 있습니다.');
        return;
      }

      // 도메인 설정 업데이트
      const domainSettings = {
        subdomain: subdomain || '',
        customDomain: customDomain || '',
        lastModified: new Date().toISOString()
      };

      // store_settings 테이블에 도메인 설정 저장
      await dbServices.updateStoreSettings(storeId, { domainSettings });
      
      // stores 테이블에 서브도메인 저장 (getStoreBySubdomain에서 사용)
      if (subdomain) {
        await dbServices.updateStore(storeId, { 
          name: store.name,
          subtitle: store.subtitle,
          phone: store.phone,
          address: store.address,
          subdomain: subdomain
        });
      }
      
      log('INFO', '도메인 설정 저장 완료', { storeId, domainSettings });

      sendJsonResponse(res, 200, {
        success: true,
        message: '도메인 설정이 저장되었습니다.',
        data: domainSettings
      });
    } catch (error) {
      log('ERROR', '도메인 설정 저장 실패', error);
      sendErrorResponse(res, 500, '도메인 설정 저장에 실패했습니다.');
    }
  }

  // 도메인 QR 생성
  async generateDomainQR(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId, subdomain } = body;
      
      if (!storeId || !subdomain) {
        sendErrorResponse(res, 400, '가게 ID와 서브도메인이 필요합니다.');
        return;
      }
      
      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }
      
      // 도메인 URL 생성
      const normalizedSubdomain = subdomain.replace(/^\/+|\/+$/g, '');
      const origin = req.headers?.origin
        || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || `localhost:${PORT}`}`;
      const domainUrl = `${origin.replace(/\/+$/, '')}/${normalizedSubdomain}`;

      const qrDir = path.join(__dirname, '../../public/qr');
      if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir, { recursive: true });
      }

      const fileName = `domain-${storeId}-${Date.now()}.png`;
      const filePath = path.join(qrDir, fileName);

      await QRCode.toFile(filePath, domainUrl, {
        width: 512,
        margin: 2
      });

      const qrCodeUrl = `/qr/${fileName}`;

      const currentSettings = await dbServices.getStoreSettings(storeId);
      const mergedSettings = {
        delivery: currentSettings.delivery || {},
        discount: currentSettings.discount || {},
        pickup: currentSettings.pickup || {},
        images: currentSettings.images || {},
        businessHours: currentSettings.businessHours || {},
        sectionOrder: currentSettings.sectionOrder || [],
        domainSettings: (currentSettings.domainSettings || {}),
        qrCode: {
          url: qrCodeUrl,
          domainUrl,
          subdomain: normalizedSubdomain,
          storeId,
          createdAt: new Date().toISOString()
        }
      };

      await dbServices.updateStoreSettings(storeId, mergedSettings);

      sendJsonResponse(res, 200, {
        success: true,
        qrCodeUrl,
        domainUrl,
        message: '도메인 QR 코드가 생성되었습니다.'
      });
    } catch (error) {
      log('ERROR', '도메인 QR 생성 실패', error);
      sendErrorResponse(res, 500, error.message || '도메인 QR 코드 생성에 실패했습니다.');
    }
  }

  async deleteDomainQR(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId } = body || {};

      if (!storeId) {
        sendErrorResponse(res, 400, 'storeId가 필요합니다.');
        return;
      }

      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      const currentSettings = await dbServices.getStoreSettings(storeId);
      const qrCodeInfo = currentSettings.qrCode || {};

      if (qrCodeInfo.url) {
        const qrPath = path.join(__dirname, '../../public', qrCodeInfo.url.replace(/^\/+/, ''));
        if (fs.existsSync(qrPath)) {
          try {
            fs.unlinkSync(qrPath);
          } catch (error) {
            log('WARN', 'QR 코드 파일 삭제 실패', { error: error.message, qrPath });
          }
        }
      }

      const mergedSettings = {
        delivery: currentSettings.delivery || {},
        discount: currentSettings.discount || {},
        pickup: currentSettings.pickup || {},
        images: currentSettings.images || {},
        businessHours: currentSettings.businessHours || {},
        sectionOrder: currentSettings.sectionOrder || [],
        domainSettings: currentSettings.domainSettings || {},
        qrCode: {}
      };

      await dbServices.updateStoreSettings(storeId, mergedSettings);

      sendJsonResponse(res, 200, {
        success: true,
        message: '도메인 QR 코드가 삭제되었습니다.'
      });
    } catch (error) {
      log('ERROR', '도메인 QR 삭제 실패', error);
      sendErrorResponse(res, 500, error.message || '도메인 QR 코드 삭제에 실패했습니다.');
    }
  }

  async createStore(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const newStore = await dbServices.createStore(body || {});
      sendJsonResponse(res, 200, {
        success: true,
        data: newStore,
        message: '가게가 생성되었습니다.'
      });
    } catch (error) {
      log('ERROR', '가게 생성 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 생성에 실패했습니다.');
    }
  }

  async updateStore(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3];
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const body = await parseRequestBody(req);
      const updated = await dbServices.updateStore(storeId, body || {});
      sendJsonResponse(res, 200, {
        success: true,
        data: updated,
        message: '가게 정보가 수정되었습니다.'
      });
    } catch (error) {
      log('ERROR', '가게 수정 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 수정에 실패했습니다.');
    }
  }

  async deleteStore(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3];
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const result = await dbServices.deleteStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        message: result.message || '가게가 삭제되었습니다.'
      });
    } catch (error) {
      log('ERROR', '가게 삭제 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 삭제에 실패했습니다.');
    }
  }

  async pauseStore(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3];
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const paused = await dbServices.pauseStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        data: paused,
        message: '가게가 일시정지되었습니다.'
      });
    } catch (error) {
      log('ERROR', '가게 일시정지 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 일시정지에 실패했습니다.');
    }
  }

  async resumeStore(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3];
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const resumed = await dbServices.resumeStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        data: resumed,
        message: '가게가 다시 운영됩니다.'
      });
    } catch (error) {
      log('ERROR', '가게 재개 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 재개에 실패했습니다.');
    }
  }

  async getStoreBySubdomain(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const subdomain = parts[4];
      if (!subdomain) {
        sendErrorResponse(res, 400, '서브도메인이 필요합니다.');
        return;
      }

      const store = await dbServices.getStoreBySubdomain(subdomain);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      sendJsonResponse(res, 200, store);
    } catch (error) {
      log('ERROR', '서브도메인으로 가게 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 조회에 실패했습니다.');
    }
  }
 }
 
 if (require.main === module) {
   const router = new APIRouter();
   const server = http.createServer((req, res) => {
     router.handleRequest(req, res).catch(error => {
       log('ERROR', '요청 처리 중 예외 발생', { error: error.message, stack: error.stack });
       try {
         sendErrorResponse(res, 500, '서버 처리 중 오류가 발생했습니다.');
       } catch (responseError) {
         log('ERROR', '응답 전송 실패', { error: responseError.message });
       }
     });
   });

   server.listen(PORT, () => {
     log('INFO', `API 서버가 포트 ${PORT}에서 실행 중입니다.`);
   });
 }

 module.exports = APIRouter;
