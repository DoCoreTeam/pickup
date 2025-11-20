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
const zlib = require('zlib');

// 데이터베이스 서비스 import
const dbServices = require('../database/services');
const db = require('../database/connection');

// 환경변수 로드 (파일이 없어도 에러 없이 계속 진행 - Railway 등 클라우드 환경 대응)
try {
  require('dotenv').config({ path: path.join(__dirname, '../../env.database') });
} catch (e) {
  // 파일이 없어도 계속 진행
}

try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
} catch (e) {
  // 파일이 없어도 계속 진행
}

// AI 오케스트레이터
const aiOrchestrator = require('../ai/orchestrator');

const PORT = process.env.PORT || 8081;
const DATA_BACKEND = process.env.DATA_BACKEND || 'postgres';

// OpenAI 클라이언트 초기화 (API 키가 있을 때만)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000,
  });
} else {
  console.warn('⚠️ OPENAI_API_KEY가 설정되지 않았습니다. OpenAI 기능을 사용할 수 없습니다.');
}

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

// JSON 응답 전송 (Gzip 압축 지원)
function sendJsonResponse(res, statusCode, data, compress = true) {
  const jsonString = JSON.stringify(data, null, 2);
  const jsonBuffer = Buffer.from(jsonString, 'utf8');
  
  // Accept-Encoding 헤더 확인 및 압축 (1KB 이상인 경우만)
  const acceptEncoding = res.req?.headers['accept-encoding'] || '';
  const shouldCompress = compress && jsonBuffer.length > 1024 && acceptEncoding.includes('gzip');
  
  if (shouldCompress) {
    zlib.gzip(jsonBuffer, (err, compressed) => {
      if (err) {
        // 압축 실패 시 원본 전송
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(jsonBuffer);
        return;
      }
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': compressed.length
      });
      res.end(compressed);
    });
  } else {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(jsonBuffer);
  }
}

// 에러 응답 전송
function sendErrorResponse(res, statusCode, message) {
  sendJsonResponse(res, statusCode, { error: message });
}

// 요청 본문 파싱
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodySize = 0;
    const maxSize = 50 * 1024 * 1024; // 50MB 제한
    
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > maxSize) {
        req.destroy();
        reject(new Error('요청 본문이 너무 큽니다. 최대 50MB까지 허용됩니다.'));
        return;
      }
      body += chunk.toString('utf8');
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
    
    req.on('error', reject);
  });
}

// multipart/form-data 파싱 (파일 업로드용)
function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      reject(new Error('Content-Type must be multipart/form-data'));
      return;
    }

    // boundary 추출 (따옴표 제거 포함)
    let boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      reject(new Error('Boundary not found in Content-Type'));
      return;
    }
    // boundary 앞뒤 공백 및 따옴표 제거
    boundary = boundary.trim().replace(/^["']|["']$/g, '');
    const boundaryBuffer = Buffer.from(`--${boundary}`);

    const chunks = [];
    let totalSize = 0;
    const maxSize = 50 * 1024 * 1024; // 50MB 제한
    
    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy();
        reject(new Error('요청 본문이 너무 큽니다. 최대 50MB까지 허용됩니다.'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const fields = {};
        const files = {};

        // boundary로 파트 분리 (바이너리 기준)
        let searchIndex = 0;
        const parts = [];
        
        while (true) {
          const boundaryIndex = buffer.indexOf(boundaryBuffer, searchIndex);
          if (boundaryIndex === -1) break;
          
          if (searchIndex > 0) {
            // 이전 boundary 이후부터 현재 boundary까지가 하나의 파트
            parts.push(buffer.slice(searchIndex, boundaryIndex));
          }
          searchIndex = boundaryIndex + boundaryBuffer.length;
        }

        for (const partBuffer of parts) {
          // 헤더와 본문 분리 (\r\n\r\n 찾기)
          const headerEndMarker = Buffer.from('\r\n\r\n');
          const headerEndIndex = partBuffer.indexOf(headerEndMarker);
          
          if (headerEndIndex === -1) continue;
          
          // 헤더는 문자열로 파싱
          const headerBuffer = partBuffer.slice(0, headerEndIndex);
          const headers = headerBuffer.toString('utf8');
          
          // 본문은 Buffer 그대로 유지 (바이너리 데이터 보존)
          const bodyStartIndex = headerEndIndex + headerEndMarker.length;
          let bodyBuffer = partBuffer.slice(bodyStartIndex);
          
          // 본문 끝부분의 \r\n 제거 (boundary 앞의 개행)
          if (bodyBuffer.length >= 2 && bodyBuffer[bodyBuffer.length - 2] === 0x0D && bodyBuffer[bodyBuffer.length - 1] === 0x0A) {
            bodyBuffer = bodyBuffer.slice(0, -2);
          }

          // Content-Disposition 파싱
          const nameMatch = headers.match(/name="([^"]+)"/);
          if (!nameMatch) continue;

          const fieldName = nameMatch[1];
          const filenameMatch = headers.match(/filename="([^"]+)"/);

          if (filenameMatch) {
            // 파일 필드 - Buffer 그대로 사용
            const filename = filenameMatch[1];
            const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);
            
            files[fieldName] = {
              filename,
              contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
              buffer: bodyBuffer,
              size: bodyBuffer.length
            };
          } else {
            // 일반 필드 - 문자열로 변환
            fields[fieldName] = bodyBuffer.toString('utf8').trim();
          }
        }

        resolve({ fields, files });
      } catch (error) {
        log('ERROR', 'multipart 파싱 실패', { error: error.message, stack: error.stack });
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

// 전화번호 및 주소 유효성 검사용 정규식
const PHONE_DISPLAY_PATTERN = /^0\d{1,2}-\d{3,4}-\d{4}$/;
const ADDRESS_ALLOWED_PATTERN = /^[가-힣A-Za-z0-9\s\-.,#/()]+$/;

/**
 * 전화번호를 통일된 하이픈 포맷(예: 010-1234-5678)으로 정규화한다.
 * @param {string} raw 사용자 입력 전화번호
 * @returns {string} 정상 포맷 또는 빈 문자열
 */
function normalizePhoneNumber(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 11) {
    return '';
  }

  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    if (digits.length === 10) {
      return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return '';
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return '';
}

/**
 * 전화번호 유효성을 검사한다.
 * @param {string} raw 사용자 입력 전화번호
 * @returns {{isValid:boolean, normalized:string}}
 */
function validatePhoneNumber(raw) {
  const normalized = normalizePhoneNumber(raw);
  return {
    normalized,
    isValid: Boolean(normalized) && PHONE_DISPLAY_PATTERN.test(normalized)
  };
}

function sanitizeAddressSegment(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// 쿠키 파싱 함수
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
    }
  });
  
  return cookies;
}

/**
 * 주소 입력값을 검증하고 통일된 형태로 반환한다.
 * @param {object} rawData 요청 데이터의 주소 필드
 * @returns {{isValid:boolean, message?:string, sanitized?:object}}
 */
function validateOwnerAddress(rawData = {}) {
  const postalCode = sanitizeAddressSegment(rawData.storePostalCode || rawData.postalCode || '');
  const roadAddress = sanitizeAddressSegment(rawData.storeRoadAddress || rawData.roadAddress || '');
  const extraAddress = sanitizeAddressSegment(rawData.storeExtraAddress || rawData.extraAddress || '');
  const addressDetail = sanitizeAddressSegment(rawData.storeAddressDetail || rawData.addressDetail || '');

  if (!roadAddress) {
    return { isValid: false, message: '가게 도로명 주소를 입력해주세요.' };
  }
  if (!ADDRESS_ALLOWED_PATTERN.test(roadAddress)) {
    return { isValid: false, message: '도로명 주소에 허용되지 않는 문자가 포함되어 있습니다.' };
  }
  if (extraAddress && !ADDRESS_ALLOWED_PATTERN.test(extraAddress.replace(/^\(|\)$/g, ''))) {
    return { isValid: false, message: '참고 항목에 허용되지 않는 문자가 포함되어 있습니다.' };
  }
  if (!addressDetail) {
    return { isValid: false, message: '상세 주소를 입력해주세요.' };
  }
  if (!ADDRESS_ALLOWED_PATTERN.test(addressDetail)) {
    return { isValid: false, message: '상세 주소에 허용되지 않는 문자가 포함되어 있습니다.' };
  }

  const fullAddressSegments = [roadAddress];
  if (extraAddress) {
    fullAddressSegments.push(extraAddress);
  }
  if (addressDetail) {
    fullAddressSegments.push(addressDetail);
  }

  return {
    isValid: true,
    sanitized: {
      storePostalCode: postalCode,
      storeRoadAddress: roadAddress,
      storeExtraAddress: extraAddress,
      storeAddressDetail: addressDetail,
      storeAddress: fullAddressSegments.filter(Boolean).join(' ').trim()
    }
  };
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
    
    // 브라우저 캐싱 설정 (파일 타입별로 다른 캐시 정책)
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(ext);
    const isStaticAsset = /\.(css|js|woff|woff2|ttf|eot)$/i.test(ext);
    
    if (isImage || isStaticAsset) {
      // 이미지와 정적 자산: 1년 캐시 (파일명에 해시가 포함되어 있으면 안전)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString());
    } else if (ext === '.html') {
      // HTML 파일: 캐시하지 않음 (항상 최신 버전)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // 기타 파일: 1시간 캐시
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    
    // store.html이고 초기 데이터가 있으면 HTML에 데이터 주입
    if (ext === '.html' && filePath.endsWith('store.html') && req.initialStoreData) {
      try {
        // HTML 파일 읽기
        let htmlContent = fs.readFileSync(filePath, 'utf8');
        
        // </head> 태그 앞에 초기 데이터 주입
        const initialDataScript = `
    <script>
      // 서버에서 전달된 초기 데이터 (QR 접근 시 즉시 렌더링)
      window.__INITIAL_STORE_DATA__ = ${JSON.stringify(req.initialStoreData)};
    </script>`;
        
        htmlContent = htmlContent.replace('</head>', `${initialDataScript}\n  </head>`);
        
        // 수정된 HTML 전송
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', Buffer.byteLength(htmlContent, 'utf8'));
        res.writeHead(200);
        res.end(htmlContent, 'utf8');
        
        log('INFO', '초기 데이터 포함하여 store.html 서빙', { storeId: req.initialStoreData.store.id });
        return true;
      } catch (error) {
        log('WARN', '초기 데이터 주입 실패 (원본 파일 전송)', error);
        // 초기 데이터 주입 실패 시 원본 파일 전송
      }
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    
    // ETag 추가 (파일 수정 시간 기반)
    const etag = `"${stat.mtime.getTime()}-${stat.size}"`;
    res.setHeader('ETag', etag);
    
    // If-None-Match 헤더 확인 (304 Not Modified 응답)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.writeHead(304);
      res.end();
      return true;
    }
    
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
    
    // POST /api/events - 이벤트 로깅
    this.routes.set('POST /api/events', this.logStoreEvent.bind(this));

    // GET /api/dashboard/summary - 대시보드 요약
    this.routes.set('GET /api/dashboard/summary', this.getDashboardSummary.bind(this));
    // GET /api/dashboard/stores - 가게별 대시보드 메트릭
    this.routes.set('GET /api/dashboard/stores', this.getDashboardStores.bind(this));
    // GET /api/release-notes - 릴리즈 노트 조회
    this.routes.set('GET /api/release-notes', this.getReleaseNotes.bind(this));
    // POST /api/superadmin/check - 로그인 사전 확인
    this.routes.set('POST /api/superadmin/check', this.checkSuperAdminCredentials.bind(this));

    // GET /api/settings - 설정 조회
    this.routes.set('GET /api/settings', this.getSettings.bind(this));
    
    // GET /api/superadmin/info - 슈퍼어드민 정보 조회
    this.routes.set('GET /api/superadmin/info', this.getSuperAdminInfo.bind(this));
    
    // GET /api/db-stats - DB 통계 조회 (슈퍼어드민 전용)
    this.routes.set('GET /api/db-stats', this.getDbStats.bind(this));
    
    // POST /api/db-stats/reset - DB 통계 리셋 (슈퍼어드민 전용)
    this.routes.set('POST /api/db-stats/reset', this.resetDbStats.bind(this));
    
    // GET /api/users/ - 가게별 사용자 조회 (동적 라우팅)
    this.routes.set('GET /api/users/', this.getUsersByStore.bind(this));
    
    // 엠버서더 관련 API
    // GET /api/ambassadors - 엠버서더 목록 조회 (점주용)
    this.routes.set('GET /api/ambassadors', this.getAmbassadors.bind(this));
    // GET /api/ambassadors/stats - 통계 조회 (점주/슈퍼어드민)
    this.routes.set('GET /api/ambassadors/stats', this.getAmbassadorStats.bind(this));
    // GET /api/ambassadors/key/:key - 키로 엠버서더 조회 (공개, 가게 페이지용)
    this.routes.set('GET /api/ambassadors/key/:key', this.getAmbassadorByKey.bind(this));
    // POST /api/ambassadors - 엠버서더 생성
    this.routes.set('POST /api/ambassadors', this.createAmbassador.bind(this));
    // PUT /api/ambassadors/:id - 엠버서더 수정
    this.routes.set('PUT /api/ambassadors/:id', this.updateAmbassador.bind(this));
    // DELETE /api/ambassadors/:id - 엠버서더 삭제
    this.routes.set('DELETE /api/ambassadors/:id', this.deleteAmbassador.bind(this));
    // POST /api/ambassadors/visits - 방문 기록
    this.routes.set('POST /api/ambassadors/visits', this.logAmbassadorVisit.bind(this));
    // POST /api/ambassadors/calls - 전화 연결 기록
    this.routes.set('POST /api/ambassadors/calls', this.logAmbassadorCall.bind(this));
    
    // 점주 계정 및 입점 요청
    this.routes.set('POST /api/owners/request', this.requestOwnerAccount.bind(this));
    this.routes.set('GET /api/owners', this.getOwnerAccounts.bind(this));
    this.routes.set('POST /api/owners/login', this.postOwnerLogin.bind(this));
    this.routes.set('POST /api/owners/:ownerId/password', this.updateOwnerPasswordHandler.bind(this));
    
    // 점주 대표 가게 설정
    this.routes.set('POST /api/owner/primary-store', this.setOwnerPrimaryStore.bind(this));
    
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
    // POST /api/ai/seo/optimize - SEO 전략 생성
    this.routes.set('POST /api/ai/seo/optimize', this.postSeoOptimization.bind(this));
    // POST /api/ai/ab-tests/generate - A/B 테스트 전략 생성
    this.routes.set('POST /api/ai/ab-tests/generate', this.postAbTestPlan.bind(this));
    
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
    
    // POST /api/stores/:storeId/approve - 가게 승인
    this.routes.set('POST /api/stores/:storeId/approve', this.approveStore.bind(this));
    
    // POST /api/stores/:storeId/reject - 가게 거절
    this.routes.set('POST /api/stores/:storeId/reject', this.rejectStore.bind(this));
    
    // GET /api/stores/bulk-export - 가게 대량 내보내기
    this.routes.set('GET /api/stores/bulk-export', this.bulkExportStores.bind(this));
    
    // POST /api/stores/bulk-import - 가게 대량 가져오기
    this.routes.set('POST /api/stores/bulk-import', this.bulkImportStores.bind(this));
    
    // POST /api/stores/bulk-pause - 가게 대량 일시정지
    this.routes.set('POST /api/stores/bulk-pause', this.bulkPauseStores.bind(this));
    
    // POST /api/stores/bulk-resume - 가게 대량 재개
    this.routes.set('POST /api/stores/bulk-resume', this.bulkResumeStores.bind(this));
    
    // POST /api/stores/bulk-delete - 가게 대량 삭제
    this.routes.set('POST /api/stores/bulk-delete', this.bulkDeleteStores.bind(this));
    
    // GET /api/store/subdomain/:subdomain - 서브도메인으로 가게 조회
    this.routes.set('GET /api/store/subdomain/:subdomain', this.getStoreBySubdomain.bind(this));
    this.routes.set('POST /api/superadmin/update', this.updateSuperAdminAccount.bind(this));
    this.routes.set('POST /api/debug/log', this.logDebugMessage.bind(this));
  }

  async handleRequest(req, res) {
    const startTime = Date.now();
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;
    const pathname = parsedUrl.pathname;

    try {
      // CORS 헤더 설정
      setCorsHeaders(res);

      // OPTIONS 요청 처리
      if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // 정적 라우트 먼저 확인 (동적 라우트보다 우선)
      const routeKey = `${method} ${pathname}`;
      let handler = this.routes.get(routeKey);
      
      // 엠버서더 관련 API는 상세 로깅
      if (pathname.includes('/ambassadors/')) {
        log('INFO', `엠버서더 API 라우팅 시도: ${routeKey}`, { 
          hasStaticRoute: !!handler,
          staticRoutes: Array.from(this.routes.keys()).filter(k => k.includes('ambassadors'))
        });
      }
      
      // 정적 라우트가 없으면 동적 라우트 처리
      if (!handler) {
        if (pathname.startsWith('/api/ambassadors/')) {
          const parts = pathname.split('/');
          // 정적 라우트는 이미 확인했으므로 동적 라우트만 처리
          if (parts.length === 5 && parts[3] === 'key' && parts[4]) { // GET /api/ambassadors/key/:key
            handler = (req, res, parsedUrl) => this.getAmbassadorByKey(req, res, parsedUrl);
          } else if (parts.length === 4 && parts[3] && !parts[3].includes('?') && parts[3] !== 'visits' && parts[3] !== 'calls' && parts[3] !== 'stats') {
            // PUT/DELETE /api/ambassadors/:id (visits, calls, stats는 정적 라우트로 처리됨)
            const ambassadorId = parseInt(parts[3], 10);
            if (!isNaN(ambassadorId)) {
              if (method === 'PUT') {
                handler = (req, res, parsedUrl) => this.updateAmbassador(req, res, parsedUrl);
              } else if (method === 'DELETE') {
                handler = (req, res, parsedUrl) => this.deleteAmbassador(req, res, parsedUrl);
              }
            }
          }
        } else if (pathname.startsWith('/api/stores/')) {
          const parts = pathname.split('/');
        if (parts.length === 4 && parts[3]?.startsWith('bulk-')) {
          const bulkAction = parts[3];
          if (bulkAction === 'bulk-export' && method === 'GET') {
            handler = (req, res, parsedUrl) => this.bulkExportStores(req, res, parsedUrl);
          } else if (bulkAction === 'bulk-import' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.bulkImportStores(req, res, parsedUrl);
          } else if (bulkAction === 'bulk-pause' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.bulkPauseStores(req, res, parsedUrl);
          } else if (bulkAction === 'bulk-resume' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.bulkResumeStores(req, res, parsedUrl);
          } else if (bulkAction === 'bulk-delete' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.bulkDeleteStores(req, res, parsedUrl);
          }
        } else if (parts.length >= 4 && parts[3]) { // /api/stores/:storeId
          const storeId = parts[3];
          if (parts.length === 4) { // GET/PUT/DELETE /api/stores/:storeId
            if (method === 'GET') {
              handler = (req, res, parsedUrl) => this.getStoreById(req, res, parsedUrl);
            } else if (method === 'PUT') {
              handler = (req, res, parsedUrl) => this.updateStore(req, res, parsedUrl);
            } else if (method === 'DELETE') {
              handler = (req, res, parsedUrl) => this.deleteStore(req, res, parsedUrl);
            }
          } else if (parts.length >= 5 && parts[4] === 'owners') { // /api/stores/:storeId/owners
            if (parts.length === 5) {
              if (method === 'GET') {
                handler = (req, res, parsedUrl) => this.getStoreOwners(storeId, req, res, parsedUrl);
              } else if (method === 'POST') {
                handler = (req, res, parsedUrl) => this.linkOwnerToStoreHandler(storeId, req, res, parsedUrl);
              }
            } else if (parts.length === 6) {
              const ownerId = decodeURIComponent(parts[5]);
              if (method === 'DELETE') {
                handler = (req, res, parsedUrl) => this.unlinkOwnerFromStoreHandler(storeId, ownerId, req, res, parsedUrl);
              } else if (method === 'PATCH') {
                handler = (req, res, parsedUrl) => this.updateStoreOwnerLinkHandler(storeId, ownerId, req, res, parsedUrl);
              }
            }
          } else if (parts.length === 5) { // /api/stores/:storeId/action
            const action = parts[4];
            if (action === 'pause' && method === 'POST') {
              handler = (req, res, parsedUrl) => this.pauseStore(req, res, parsedUrl);
            } else if (action === 'resume' && method === 'POST') {
              handler = (req, res, parsedUrl) => this.resumeStore(req, res, parsedUrl);
            } else if (action === 'approve' && method === 'POST') {
              handler = (req, res, parsedUrl) => this.approveStore(req, res, parsedUrl);
            } else if (action === 'reject' && method === 'POST') {
              handler = (req, res, parsedUrl) => this.rejectStore(req, res, parsedUrl);
            }
          }
        }
      } else if (pathname.startsWith('/api/store/')) {
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
            } else if (parts.length === 5) {
              const subPath = parts[4];
              const extraPath = '';
              if (subPath === 'settings') { // GET/POST /api/store/:id/settings
                if (method === 'GET') {
                  handler = (req, res, parsedUrl) => this.getStoreSettings(storeId, req, res, parsedUrl);
                } else if (method === 'POST') {
                  handler = (req, res, parsedUrl) => this.updateStoreSettings(storeId, req, res, parsedUrl);
                }
              } else if (subPath === 'domain-settings') { // GET/POST /api/store/:id/domain-settings
                if (method === 'GET') {
                  handler = (req, res, parsedUrl) => this.getDomainSettings(req, res, parsedUrl);
                } else if (method === 'POST') {
                  handler = (req, res, parsedUrl) => this.saveDomainSettings(req, res, parsedUrl);
                }
              } else if (subPath === 'qr-code' || subPath === 'domain-qr') { // POST /api/store/:id/qr-code 또는 /api/store/:id/domain-qr
                if (method === 'POST') {
                  handler = (req, res, parsedUrl) => this.generateDomainQR(req, res, parsedUrl);
                }
              } else if (subPath === 'seo-settings') { // GET/POST /api/store/:id/seo-settings
                if (method === 'GET') {
                  log('DEBUG', 'SEO 설정 라우트 매칭', { storeId, method, pathname });
                  handler = (req, res, parsedUrl) => this.getSeoSettingsHandler(storeId, req, res, parsedUrl);
                } else if (method === 'POST') {
                  log('DEBUG', 'SEO 설정 저장 라우트 매칭', { storeId, method, pathname });
                  handler = (req, res, parsedUrl) => this.saveSeoSettingsHandler(storeId, req, res, parsedUrl);
                }
              } else if (subPath === 'ab-test-settings') { // GET/POST /api/store/:id/ab-test-settings
                if (method === 'GET') {
                  log('DEBUG', 'A/B 테스트 설정 라우트 매칭', { storeId, method, pathname });
                  handler = (req, res, parsedUrl) => this.getAbTestSettingsHandler(storeId, req, res, parsedUrl);
                } else if (method === 'POST') {
                  log('DEBUG', 'A/B 테스트 설정 저장 라우트 매칭', { storeId, method, pathname });
                  handler = (req, res, parsedUrl) => this.saveAbTestSettingsHandler(storeId, req, res, parsedUrl);
                }
              } else if (subPath === 'upload-image' && method === 'POST') {
                handler = (req, res, parsedUrl) => this.uploadImage(storeId, req, res, parsedUrl);
              } else if (subPath === 'upload-video' && method === 'POST') {
                handler = (req, res, parsedUrl) => this.uploadVideo(storeId, req, res, parsedUrl);
              }
            } else if (parts.length >= 6) {
              const subPath = parts[4];
              const extraSegment = (parts[5] || '').split('?')[0];
              if (subPath === 'settings') { // GET/POST /api/store/:id/settings
                if (method === 'GET') {
                  handler = (req, res, parsedUrl) => this.getStoreSettings(storeId, req, res, parsedUrl);
                } else if (method === 'POST') {
                  handler = (req, res, parsedUrl) => this.updateStoreSettings(storeId, req, res, parsedUrl);
                }
              } else if (subPath === 'domain-settings') { // GET/POST /api/store/:id/domain-settings
                if (method === 'GET') {
                  handler = (req, res, parsedUrl) => this.getDomainSettings(req, res, parsedUrl);
                } else if (method === 'POST') {
                  handler = (req, res, parsedUrl) => this.saveDomainSettings(req, res, parsedUrl);
                }
              } else if (subPath === 'seo-settings') {
                if (!extraSegment) {
                  if (method === 'GET') {
                    log('DEBUG', 'SEO 설정 라우트 매칭', { storeId, method, pathname });
                    handler = (req, res, parsedUrl) => this.getSeoSettingsHandler(storeId, req, res, parsedUrl);
                  } else if (method === 'POST') {
                    log('DEBUG', 'SEO 설정 저장 라우트 매칭', { storeId, method, pathname });
                    handler = (req, res, parsedUrl) => this.saveSeoSettingsHandler(storeId, req, res, parsedUrl);
                  }
                } else if (extraSegment === 'history' && method === 'GET') {
                  handler = (req, res, parsedUrl) => this.getSeoSettingsHistoryHandler(storeId, req, res, parsedUrl);
                }
              } else if (subPath === 'ab-test-settings') {
                if (!extraSegment) {
                  if (method === 'GET') {
                    log('DEBUG', 'A/B 테스트 설정 라우트 매칭', { storeId, method, pathname });
                    handler = (req, res, parsedUrl) => this.getAbTestSettingsHandler(storeId, req, res, parsedUrl);
                  } else if (method === 'POST') {
                    log('DEBUG', 'A/B 테스트 설정 저장 라우트 매칭', { storeId, method, pathname });
                    handler = (req, res, parsedUrl) => this.saveAbTestSettingsHandler(storeId, req, res, parsedUrl);
                  }
                } else if (extraSegment === 'history' && method === 'GET') {
                  handler = (req, res, parsedUrl) => this.getAbTestSettingsHistoryHandler(storeId, req, res, parsedUrl);
                }
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
        const match = pathname.match(/^\/api\/owners\/([^\/]+)(?:\/([^\/]+))?$/);
        if (match) {
          const ownerId = decodeURIComponent(match[1]);
          const action = match[2] || '';
          if (!action && method === 'GET') {
            handler = (req, res, parsedUrl) => this.getOwnerAccountDetailHandler(ownerId, req, res, parsedUrl);
          } else if (action === 'approve' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.approveOwnerAccount(ownerId, req, res, parsedUrl);
          } else if (action === 'reject' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.rejectOwnerAccount(ownerId, req, res, parsedUrl);
          } else if (action === 'stores' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.createStoreForOwnerHandler(ownerId, req, res, parsedUrl);
          } else if (action === 'pause' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.pauseOwnerAccountHandler(ownerId, req, res, parsedUrl);
          } else if (action === 'resume' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.resumeOwnerAccountHandler(ownerId, req, res, parsedUrl);
          } else if (action === 'password' && method === 'POST') {
            handler = (req, res, parsedUrl) => this.updateOwnerPasswordHandler(ownerId, req, res, parsedUrl);
          } else if (!action && method === 'DELETE') {
            handler = (req, res, parsedUrl) => this.deleteOwnerAccountHandler(ownerId, req, res, parsedUrl);
          }
        }
      } else if (pathname.startsWith('/api/qr-codes/')) {
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) { // /api/qr-codes/:storeId
          const storeId = parts[3];
          handler = this.getQRCodesByStore.bind(this, storeId);
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
      } // if (!handler) 블록 닫기

      // 정적 라우트 확인
      if (!handler) {
        handler = this.routes.get(routeKey);
      }

      // /qr/ 경로로 접근하는 경우 DB에서 Base64 데이터를 읽어서 이미지로 반환 (Railway 환경 대응)
      if (!handler && pathname.startsWith('/qr/')) {
        const fileName = pathname.replace('/qr/', '').split('?')[0]; // 쿼리 파라미터 제거
        
        // 파일명에서 storeId 추출 (예: domain-store_xxx-timestamp.png)
        const match = fileName.match(/^domain-(.+?)-(\d+)\.png$/);
        if (match) {
          const storeId = match[1];
          
          try {
            // DB에서 QR 코드 정보 조회
            const settings = await dbServices.getStoreSettings(storeId);
            const qrCode = settings.qrCode || {};
            
            if (qrCode.base64) {
              // Base64 데이터를 이미지로 반환
              const base64Data = qrCode.base64.replace(/^data:image\/png;base64,/, '');
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              setCorsHeaders(res);
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Content-Length', imageBuffer.length);
              res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1년 캐시
              
              res.writeHead(200);
              res.end(imageBuffer);
              
              const responseTime = Date.now() - startTime;
              logRequest(method, pathname, 200, responseTime);
              return;
            }
          } catch (error) {
            log('WARN', 'QR 코드 DB 조회 실패', { fileName, storeId, error: error.message });
          }
        }
        
        // 파일 시스템에서도 시도 (하위 호환성)
        const qrDir = path.join(__dirname, '../../qr');
        const filePath = path.join(qrDir, fileName);
        if (serveStaticFile(req, res, filePath)) {
          const responseTime = Date.now() - startTime;
          logRequest(method, pathname, 200, responseTime);
          return;
        }
        
        // 둘 다 실패하면 404
        sendErrorResponse(res, 404, 'QR 코드를 찾을 수 없습니다.');
        return;
      }

      if (handler) {
        // API 핸들러 실행
        log('INFO', `API 핸들러 실행 시작: ${method} ${pathname}`, { handler: handler.name || 'anonymous' });
        try {
          await handler(req, res, parsedUrl);
          const responseTime = Date.now() - startTime;
          // 느린 API 응답 로깅 (500ms 이상)
          if (responseTime > 500) {
            log('WARN', `느린 API 응답: ${method} ${pathname}`, { responseTime });
          }
          log('INFO', `API 핸들러 실행 완료: ${method} ${pathname}`, { statusCode: res.statusCode || 200, responseTime });
          logRequest(method, pathname, res.statusCode || 200, responseTime);
        } catch (error) {
          const responseTime = Date.now() - startTime;
          log('ERROR', `API 핸들러 실행 실패: ${method} ${pathname}`, { error: error.message, stack: error.stack, responseTime });
          if (!res.headersSent) {
            sendErrorResponse(res, 500, 'Internal Server Error');
          }
          logRequest(method, pathname, 500, responseTime);
        }
        return;
      }

      const allowedHtmlPaths = new Set(['/store.html', '/owner/request.html', '/admin/login.html']);

      // store 페이지 라우팅 (동적 path)
      if (pathname === '/store' || pathname.startsWith('/store/')) {
        const publicPath = path.join(__dirname, '../../');
        const storeFilePath = path.join(publicPath, 'store.html');
        if (fs.existsSync(storeFilePath)) {
          if (serveStaticFile(req, res, storeFilePath)) {
            logRequest(method, pathname, 200, Date.now() - startTime);
            return;
          }
        }
        sendErrorResponse(res, 404, '가게 페이지를 찾을 수 없습니다.');
        return;
      }

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
              // 정상 운영 중인 가게는 store.html 서빙 (초기 데이터 포함)
              filePath = path.join(publicPath, 'store.html');
              
              // 서버 사이드에서 초기 데이터 생성 (가게 정보 + 로고만)
              try {
                const settings = await dbServices.getStoreSettingsOptimized(store.id, ['images']);
                // images 필드 추출 (mainLogo가 있을 때만 포함)
                const imagesData = settings?.settings?.images || settings?.images || {};
                const hasLogo = Boolean(imagesData?.mainLogo && imagesData.mainLogo.trim());
                
                const initialData = {
                  store: {
                    id: store.id,
                    name: store.name,
                    subtitle: store.subtitle,
                    phone: store.phone,
                    address: store.address,
                    status: store.status
                  },
                  settings: {
                    // mainLogo가 있을 때만 images 포함
                    images: hasLogo ? imagesData : null
                  }
                };
                
                // HTML에 초기 데이터 주입을 위한 플래그 설정
                req.initialStoreData = initialData;
                log('INFO', '초기 데이터 준비 완료', { storeId: store.id, hasLogo });
              } catch (error) {
                log('WARN', '초기 데이터 로드 실패 (무시)', error);
                // 초기 데이터 로드 실패해도 계속 진행
              }
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
      // /assets/uploads/ 경로 처리 (업로드된 이미지)
      else if (pathname.startsWith('/assets/uploads/')) {
        // /assets/uploads/storeId/filename 형식
        const uploadsPath = pathname.substring('/assets/uploads/'.length);
        filePath = path.join(__dirname, '../../assets/uploads', uploadsPath);
        
        log('INFO', '업로드된 이미지 요청', { pathname, filePath });
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
      
      // 보안을 위해 상위 디렉토리 접근 방지 (업로드된 이미지는 예외)
      const uploadsBasePath = path.join(__dirname, '../../assets/uploads');
      if (!filePath.startsWith(publicPath) && !filePath.startsWith(uploadsBasePath)) {
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
    // DB 연결 확인
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    try {
      // 데이터 전송량 절감: 최대 20개 가게만 반환
      const storesResult = await dbServices.getStores({ 
        page: 1, 
        pageSize: 20, // 500에서 20으로 대폭 감소
        includeSummary: false 
      });
      
      const stores = Array.isArray(storesResult?.data)
        ? storesResult.data
        : Array.isArray(storesResult)
          ? storesResult
          : [];
      
      // 병렬 처리로 최적화 (Promise.all 사용)
      const [superadmin, currentStoreId] = await Promise.all([
        dbServices.getSuperAdmin(),
        dbServices.getCurrentStoreId()
      ]);
      
      const data = {
        superadmin,
        stores,
        currentStoreId,
        settings: {}, // 설정은 개별 API로 조회하도록 변경
        deliveryOrders: {},
        images: {}
      };
      
      sendJsonResponse(res, 200, data);
    } catch (error) {
      log('ERROR', '데이터 조회 실패', error);
      sendErrorResponse(res, 500, '데이터 조회 실패');
    }
  }

  async getStores(req, res, parsedUrl) {
    // DB 연결 확인
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    try {
      const query = parsedUrl.query || {};
      const {
        storeId = '',
        ownerId = '',
        status = '',
        keyword = '',
        createdDate = '',
        page = '1',
        pageSize = '20',
        sortBy = 'createdAt',
        sortOrder = ''
      } = query;

      const includeSummary = query.includeSummary !== 'false';

      // 점주 계정인지 확인 (쿠키 또는 헤더에서)
      const cookies = parseCookies(req.headers.cookie || '');
      const isSuperAdmin = cookies.is_superadmin === 'true';
      const requestOwnerId = cookies.owner_id || req.headers['x-owner-id'] || null;

      // 점주 계정이고 ownerId가 없으면 자동으로 본인 ownerId로 필터링
      let finalOwnerId = ownerId || null;
      if (!isSuperAdmin && requestOwnerId && !ownerId) {
        finalOwnerId = requestOwnerId;
      }

      // 점주 계정일 때는 owner 정보가 필요 없으면 제외 (성능 최적화)
      // 슈퍼어드민이나 가게 관리 섹션에서만 owner 정보 필요
      const includeOwners = query.includeOwners !== 'false' && (isSuperAdmin || query.includeOwners === 'true');

      const options = {
        storeId: storeId || null,
        ownerId: finalOwnerId || null,
        status: status || '',
        keyword,
        createdDate,
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || undefined,
        includeSummary,
        includeOwners // owner 정보 포함 여부 (성능 최적화)
      };

      const stores = await dbServices.getStores(options);
      
      // 점주 계정일 때는 연결된 점주가 있는 가게만 반환 (백엔드에서도 필터링)
      if (!isSuperAdmin && finalOwnerId && stores.data) {
        stores.data = stores.data.filter(store => {
          const owners = store.owners || [];
          return owners.some(owner => owner.id === finalOwnerId);
        });
        // 총 개수도 업데이트
        stores.total = stores.data.length;
      }

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
      // 강제 재연결 시도 파라미터 확인
      const forceReconnect = parsedUrl.query.reconnect === 'true';
      
      if (forceReconnect) {
        // 강제 재연결 요청 시 즉시 재연결 시도
        log('INFO', '강제 DB 재연결 요청 수신');
        try {
          // 기존 연결 종료
          await db.disconnect().catch(() => {});
          
          // 새 연결 시도
          await db.connect();
          
          // 전역 dbConnected 플래그 업데이트
          if (this.updateDbConnected) {
            this.updateDbConnected(true);
          }
          
          log('INFO', '✅ 강제 재연결 성공!');
        } catch (error) {
          log('ERROR', '강제 재연결 실패', { error: error.message });
          if (this.updateDbConnected) {
            this.updateDbConnected(false);
          }
        }
      }
      
      // DB 연결 상태 확인 (연결 실패 시에도 서버는 실행 중)
      const dbHealth = await db.healthCheck().catch(() => false);
      const dbStatus = dbHealth ? 'connected' : 'disconnected';
      
      // DB가 연결되지 않은 경우 503 반환 (서비스 일시 중단)
      if (!dbHealth) {
        sendJsonResponse(res, 503, {
          status: 'degraded',
          database: dbStatus,
          message: '데이터베이스 연결이 실패했습니다. 일부 기능이 제한될 수 있습니다.',
          reconnectHint: 'GET /api/healthz?reconnect=true 를 호출하여 수동 재연결을 시도할 수 있습니다.',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      sendJsonResponse(res, 200, {
        status: 'ok',
        database: dbStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      log('ERROR', '헬스체크 실패', error);
      sendJsonResponse(res, 503, {
        status: 'error',
        database: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
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
        // 슈퍼어드민 쿠키 설정 (DB 통계 등 권한 확인용)
        res.setHeader('Set-Cookie', `is_superadmin=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`); // 7일
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
      const { name, email, phone, storeId, message, requestData, password } = body;

      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const trimmedEmail = typeof email === 'string' ? email.trim() : '';

      if (!trimmedName || !trimmedEmail) {
        sendErrorResponse(res, 400, '이름과 이메일은 필수입니다.');
        return;
      }

      const trimmedPassword = typeof password === 'string' ? password.trim() : '';
      if (!trimmedPassword) {
        sendErrorResponse(res, 400, '비밀번호를 입력해주세요.');
        return;
      }

      if (trimmedPassword.length < 8) {
        sendErrorResponse(res, 400, '비밀번호는 8자 이상 입력해주세요.');
        return;
      }

      const { isValid: phoneValid, normalized: normalizedPhone } = validatePhoneNumber(phone);
      if (!phoneValid) {
        sendErrorResponse(res, 400, '연락처 형식이 올바르지 않습니다. 예: 010-1234-5678');
        return;
      }

      const ownerRequestData = (requestData && typeof requestData === 'object') ? requestData : {};
      const addressValidation = validateOwnerAddress(ownerRequestData);
      if (!addressValidation.isValid) {
        sendErrorResponse(res, 400, addressValidation.message || '주소 정보가 올바르지 않습니다.');
        return;
      }

      const sanitizedStoreName = sanitizeAddressSegment(ownerRequestData.storeName || ownerRequestData.name || '');
      if (!sanitizedStoreName) {
        sendErrorResponse(res, 400, '가게 이름을 입력해주세요.');
        return;
      }

      const sanitizedRequestData = {
        storeName: sanitizedStoreName,
        ...addressValidation.sanitized
      };

      const result = await dbServices.createOwnerRequest({
        name: trimmedName,
        email: trimmedEmail,
        phone: normalizedPhone,
        storeId,
        message,
        requestData: sanitizedRequestData,
        password: trimmedPassword
      });

      if (!result.success) {
        sendErrorResponse(res, 400, result.error || '입점 요청을 처리하지 못했습니다.');
        return;
      }

      sendJsonResponse(res, 200, {
        success: result.success,
        ownerId: result.ownerId,
        status: result.status,
        storeId: result.storeId || null,
        message: '입점 요청이 접수되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주 입점 요청 처리 실패', error);
      sendErrorResponse(res, 500, '입점 요청 처리에 실패했습니다.');
    }
  }

  async getOwnerAccounts(req, res, parsedUrl) {
    try {
      const { status } = parsedUrl.query || {};
      
      // 재발 방지: API 핸들러에서 받은 status 값 로그
      log('INFO', '점주 계정 목록 조회 요청', {
        requestedStatus: status,
        statusType: typeof status,
        statusLength: status ? status.length : 0,
        parsedUrlQuery: parsedUrl.query
      });
      
      // 재발 방지: status 값 검증 (허용된 값만 허용)
      const validStatuses = ['pending', 'active', 'suspended', 'rejected'];
      if (status && !validStatuses.includes(status)) {
        log('WARN', '점주 계정 목록 조회: 유효하지 않은 status 값', { status, validStatuses });
        sendErrorResponse(res, 400, `유효하지 않은 상태 값입니다. 허용된 값: ${validStatuses.join(', ')}`);
        return;
      }
      
      const owners = await dbServices.getOwnerAccounts(status || null);
      
      // 재발 방지: 응답 데이터 검증 로그
      if (status) {
        const mismatched = owners.filter(o => o.status !== status);
        if (mismatched.length > 0) {
          log('WARN', '점주 계정 목록 조회: 상태 불일치 계정 발견', {
            requestedStatus: status,
            mismatchedCount: mismatched.length,
            mismatched: mismatched.map(o => ({ id: o.id, email: o.email, status: o.status }))
          });
        }
        log('INFO', '점주 계정 목록 조회 완료', {
          status,
          count: owners.length,
          statuses: owners.map(o => o.status),
          ownerIds: owners.map(o => o.id),
          ownerEmails: owners.map(o => o.email)
        });
      } else {
        log('INFO', '점주 계정 목록 조회 완료 (전체)', {
          count: owners.length,
          statuses: [...new Set(owners.map(o => o.status))],
          statusCounts: owners.reduce((acc, o) => {
            acc[o.status] = (acc[o.status] || 0) + 1;
            return acc;
          }, {})
        });
      }
      
      sendJsonResponse(res, 200, {
        success: true,
        data: owners
      });
    } catch (error) {
      log('ERROR', '점주 계정 목록 조회 실패', error);
      sendErrorResponse(res, 500, '계정 목록 조회에 실패했습니다.');
    }
  }

  async getStoreOwners(storeId, req, res, parsedUrl) {
    if (!storeId) {
      sendErrorResponse(res, 400, 'storeId가 필요합니다.');
      return;
    }

    try {
      const owners = await dbServices.getOwnersByStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        data: owners
      });
    } catch (error) {
      log('ERROR', '가게 점주 목록 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 점주 목록을 불러오지 못했습니다.');
    }
  }

  async linkOwnerToStoreHandler(storeId, req, res, parsedUrl) {
    if (!storeId) {
      sendErrorResponse(res, 400, 'storeId가 필요합니다.');
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const ownerId = body?.ownerId;
      let role = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : 'manager';
      const makePrimary = Boolean(body?.makePrimary);

      if (!ownerId) {
        sendErrorResponse(res, 400, 'ownerId가 필요합니다.');
        return;
      }

      await dbServices.linkOwnerToStore(ownerId, storeId, { role, makePrimary });

      const owners = await dbServices.getOwnersByStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        owners,
        message: '점주 계정을 가게에 연결했습니다.'
      });
    } catch (error) {
      log('ERROR', '점주-가게 매핑 실패', error);
      sendErrorResponse(res, 500, error.message || '점주 계정 교체에 실패했습니다.');
    }
  }

  async updateStoreOwnerLinkHandler(storeId, ownerId, req, res, parsedUrl) {
    if (!storeId || !ownerId) {
      sendErrorResponse(res, 400, 'storeId와 ownerId가 필요합니다.');
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const makePrimary = Boolean(body?.makePrimary);
      const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';

      if (makePrimary || action === 'primary') {
        await dbServices.setPrimaryOwnerForStore(ownerId, storeId);
      }

      const owners = await dbServices.getOwnersByStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        owners,
        message: '점주 정보가 업데이트되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주-가게 매핑 업데이트 실패', error);
      sendErrorResponse(res, 500, error.message || '점주 정보 업데이트에 실패했습니다.');
    }
  }

  async unlinkOwnerFromStoreHandler(storeId, ownerId, req, res, parsedUrl) {
    if (!storeId || !ownerId) {
      sendErrorResponse(res, 400, 'storeId와 ownerId가 필요합니다.');
      return;
    }

    try {
      await dbServices.unlinkOwnerFromStore(ownerId, storeId);
      const owners = await dbServices.getOwnersByStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        owners,
        message: '점주 연결이 해제되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주-가게 연결 해제 실패', error);
      sendErrorResponse(res, 500, error.message || '점주 연결을 해제하지 못했습니다.');
    }
  }

  async approveOwnerAccount(ownerId, req, res, parsedUrl) {
     try {
      // 중복 승인 방지: 이미 승인된 계정인지 확인
      const existingOwner = await dbServices.getOwnerAccountDetail(ownerId);
      if (existingOwner && existingOwner.status === 'active') {
        sendErrorResponse(res, 400, '이미 승인된 계정입니다.');
        return;
      }
      
      const body = await parseRequestBody(req);
      const { storeId: manualStoreId = null, password } = body || {};
      const ownerDetail = existingOwner;

      const manualPassword = typeof password === 'string' ? password.trim() : '';
      if (manualPassword && manualPassword.length < 8) {
        sendErrorResponse(res, 400, '비밀번호는 8자 이상 입력해주세요.');
        return;
      }

      // 가게 ID 결정: 수동 입력 > 기존 연결 > 요청 데이터로 찾기/생성
      let resolvedStoreId = manualStoreId || ownerDetail.storeId || null;

      if (!resolvedStoreId) {
        const requestData = ownerDetail.requestData || {};
        const storeName = requestData.storeName || ownerDetail.ownerName || ownerDetail.email;
        const storeAddress = requestData.storeAddress || '';
        const storePhone = ownerDetail.phone || '';
        
        // 기존 가게 찾기 (한 번만)
        if (storeName && storeAddress) {
          const matchedStore = await dbServices.findStoreByNameAndAddress(
            storeName,
            storeAddress,
            storePhone || null
          );
          
          if (matchedStore) {
            resolvedStoreId = matchedStore.id;
          } else {
            // 기존 가게가 없으면 새로 생성
            try {
              const newStore = await dbServices.createStore({
                name: storeName,
                address: storeAddress,
                phone: storePhone,
                status: 'pending'
              });
              resolvedStoreId = newStore.id;
            } catch (error) {
              // 중복 가게 에러: 다시 한번 찾기 시도
              if (error.message && error.message.includes('동일한 가게가 이미 존재합니다')) {
                const retryStore = await dbServices.findStoreByNameAndAddress(
                  storeName,
                  storeAddress,
                  storePhone || null
                );
                if (retryStore) {
                  resolvedStoreId = retryStore.id;
                } else {
                  throw new Error(`동일한 가게가 존재하지만 연결할 수 없습니다: ${storeName}`);
                }
              } else {
                throw error;
              }
            }
          }
        }
      }

      // 비밀번호 처리
      const storedHash = ownerDetail.passwordHash || '';
      const hashPattern = /^[0-9a-f]{64}$/i;
      let passwordSource = 'request';
      let plainPasswordForNotice = null;
      let finalPasswordHash = null;

      if (manualPassword) {
        passwordSource = 'manual';
        plainPasswordForNotice = manualPassword;
        finalPasswordHash = dbServices.hashPassword(manualPassword);
      } else if (storedHash) {
        if (hashPattern.test(storedHash)) {
          finalPasswordHash = storedHash;
          passwordSource = 'request';
        } else {
          plainPasswordForNotice = storedHash;
          finalPasswordHash = dbServices.hashPassword(storedHash);
          passwordSource = 'request';
        }
      } else {
        passwordSource = 'generated';
        plainPasswordForNotice = this.generateTemporaryPassword();
        finalPasswordHash = dbServices.hashPassword(plainPasswordForNotice);
      }

      if (!finalPasswordHash) {
        sendErrorResponse(res, 500, '비밀번호를 설정하지 못했습니다.');
        return;
      }

      // 승인 작업 (트랜잭션으로 처리됨) - 간단하고 빠르게
      const updatedOwner = await dbServices.approveOwnerAccount(ownerId, {
        storeId: resolvedStoreId,
        passwordHash: finalPasswordHash
      });

      // 가게 정보 조회 (트랜잭션 내에서 이미 조회됨, 필요시에만 추가 조회)
      let storeRecord = null;
      if (resolvedStoreId && updatedOwner.stores && updatedOwner.stores.length > 0) {
        storeRecord = updatedOwner.stores[0];
      } else if (resolvedStoreId) {
        storeRecord = await dbServices.getStoreById(resolvedStoreId);
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
        tempPassword: passwordSource === 'request' ? null : plainPasswordForNotice,
        passwordSource,
         store: responseStore,
         message: '계정이 승인되었습니다.'
       });
     } catch (error) {
       log('ERROR', '점주 계정 승인 실패', error);
       const errorMessage = error.message || '계정 승인에 실패했습니다.';
       console.error('[점주 승인] 상세 에러:', error);
       sendErrorResponse(res, 500, errorMessage);
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

  // 슈퍼어드민 권한 확인 헬퍼 함수
  checkSuperAdmin(req) {
    // 쿠키 기반 확인
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieAuth = cookies.is_superadmin === 'true';
    
    // 세션 기반 확인 (프론트엔드에서 전달하는 경우)
    const sessionAuth = req.headers['x-superadmin-auth'] === 'true';
    
    return cookieAuth || sessionAuth;
  }

  // DB 통계 조회 (슈퍼어드민 전용)
  async getDbStats(req, res, parsedUrl) {
    try {
      // 슈퍼어드민 권한 확인 (쿠키 + 세션 기반)
      if (!this.checkSuperAdmin(req)) {
        sendErrorResponse(res, 403, '슈퍼어드민 권한이 필요합니다.');
        return;
      }

      const stats = db.getDbStats();
      sendJsonResponse(res, 200, {
        success: true,
        data: stats
      });
    } catch (error) {
      log('ERROR', 'DB 통계 조회 실패', error);
      sendErrorResponse(res, 500, 'DB 통계 조회 실패');
    }
  }

  // DB 통계 리셋 (슈퍼어드민 전용)
  async resetDbStats(req, res, parsedUrl) {
    try {
      // 슈퍼어드민 권한 확인 (쿠키 + 세션 기반)
      if (!this.checkSuperAdmin(req)) {
        sendErrorResponse(res, 403, '슈퍼어드민 권한이 필요합니다.');
        return;
      }

      db.resetDbStats();
      log('INFO', 'DB 통계 리셋됨');
      sendJsonResponse(res, 200, {
        success: true,
        message: 'DB 통계가 리셋되었습니다.'
      });
    } catch (error) {
      log('ERROR', 'DB 통계 리셋 실패', error);
      sendErrorResponse(res, 500, 'DB 통계 리셋 실패');
    }
  }

  async getSettings(req, res, parsedUrl) {
    // DB 연결 확인
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    try {
      const storeId = parsedUrl.query.storeId;
      // fields 파라미터 처리: 없으면 null (최소 필드만 조회), '*'이면 전체, 아니면 배열로 변환
      let fields = null;
      if (parsedUrl.query.fields) {
        const fieldsParam = parsedUrl.query.fields.trim();
        if (fieldsParam === '*') {
          fields = '*'; // 전체 필드 명시적 요청
        } else if (fieldsParam.length > 0) {
          fields = fieldsParam.split(',').map(f => f.trim());
        }
      }
      // fields가 없으면 null (기본값: 최소 필드만 조회)
      
      if (storeId) {
        // 특정 가게 설정 조회 - fields 파라미터로 필요한 컬럼만 선택적 조회 (성능 최적화)
        // fields가 없으면 최소 필드만 조회 (성능 향상)
        const storeData = await dbServices.getStoreSettingsOptimized(storeId, fields);
        
        if (!storeData) {
          sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
          return;
        }
        
        const { settings } = storeData;
        
        // QR 코드 정보 확인 (Base64 우선, Railway 환경 대응)
        let qrCode = settings.qrCode || {
          url: '',
          filepath: '',
          createdAt: null,
        };
        
        // Base64 데이터가 있으면 그대로 사용 (Railway 환경에서 안전)
        if (qrCode.base64 && qrCode.base64.startsWith('data:image/png;base64,')) {
          // Base64 데이터가 있으면 그대로 사용
          // URL은 유지하여 프론트엔드 호환성 유지
        } else if (qrCode.url || qrCode.filepath) {
          // Base64가 없고 파일 경로만 있는 경우 (구버전 호환)
          const qrDir = path.join(__dirname, '../../qr');
          let fileName = '';
          
          // filepath에서 파일명 추출
          if (qrCode.filepath) {
            fileName = qrCode.filepath.replace(/^.*[\\\/]/, '');
          }
          // URL에서 파일명 추출 (예: /qr/domain-store_xxx.png)
          else if (qrCode.url) {
            fileName = qrCode.url.replace(/^.*[\\\/]/, '').split('?')[0]; // 쿼리 파라미터 제거
          }
          
          if (fileName) {
            const filePath = path.join(qrDir, fileName);
            
            if (!fs.existsSync(filePath)) {
              // 파일이 없으면 QR 코드 정보 초기화 및 DB 업데이트
              qrCode = {
                url: '',
                filepath: '',
                createdAt: null,
              };
              
              // DB에서도 QR 코드 정보 제거
              try {
                // 기존 설정을 가져와서 qrCode만 빈 객체로 업데이트
                const currentSettings = await dbServices.getStoreSettings(storeId);
                await dbServices.updateStoreSettings(storeId, {
                  ...currentSettings,
                  qrCode: {}
                });
              } catch (updateError) {
                log('WARN', 'QR 코드 정보 DB 업데이트 실패', updateError);
              }
            }
          }
        }
        
        // 응답 데이터 구성 (필드 필터링 지원)
        const responseData = {
          id: storeData.id,
        };

        // fields 파라미터가 있으면 해당 필드만 포함
        if (fields && fields.length > 0) {
          const allowedFields = new Set(fields.map(f => f.trim()));
          
          // basic은 항상 포함 (가게 기본 정보는 항상 필요)
          if (allowedFields.has('basic') || allowedFields.has('*')) {
            responseData.basic = {
              storeName: storeData.name,
              storeSubtitle: storeData.subtitle,
              storePhone: storeData.phone,
              storeAddress: storeData.address,
            };
          }
          
          if (allowedFields.has('discount') || allowedFields.has('*')) {
            responseData.discount = settings.discount || {
              title: '',
              enabled: false,
              description: '',
            };
          }
          
          if (allowedFields.has('delivery') || allowedFields.has('*')) {
            responseData.delivery = settings.delivery || {
              baeminUrl: '',
              ttaengUrl: '',
              yogiyoUrl: '',
              coupangUrl: '',
              deliveryOrder: [],
            };
          }
          
          if (allowedFields.has('pickup') || allowedFields.has('*')) {
            responseData.pickup = settings.pickup || {
              title: '',
              enabled: false,
              description: '',
            };
          }
          
          if (allowedFields.has('images') || allowedFields.has('*')) {
            // Base64 데이터가 있으면 URL로 변환 (하위 호환성)
            const images = settings.images || {};
            const processedImages = {};
            
            for (const [key, value] of Object.entries(images)) {
              if (typeof value === 'string') {
                // Base64 데이터인 경우 (data:image/... 형식)
                if (value.startsWith('data:image/')) {
                  // Base64 데이터는 그대로 반환 (기존 데이터 호환성)
                  // TODO: 마이그레이션 스크립트로 파일로 변환 후 URL로 교체
                  processedImages[key] = value;
                } else if (value.startsWith('/assets/uploads/')) {
                  // 이미 URL인 경우 그대로 반환
                  processedImages[key] = value;
                } else if (value) {
                  // 기타 경우 (빈 문자열이 아닌 경우)
                  processedImages[key] = value;
                }
              } else if (value) {
                // 객체인 경우 (동영상 등) 그대로 반환
                processedImages[key] = value;
              }
            }
            
            responseData.images = processedImages;
          }
          
          if (allowedFields.has('businessHours') || allowedFields.has('*')) {
            responseData.businessHours = settings.businessHours || {};
          }
          
          if (allowedFields.has('sectionOrder') || allowedFields.has('*')) {
            responseData.sectionOrder = settings.sectionOrder || [];
          }
          
          if (allowedFields.has('qrCode') || allowedFields.has('*')) {
            responseData.qrCode = qrCode;
          }
          
          if (allowedFields.has('seoSettings') || allowedFields.has('*')) {
            responseData.seoSettings = settings.seoSettings || {};
          }
          
          if (allowedFields.has('abTestSettings') || allowedFields.has('*')) {
            responseData.abTestSettings = settings.abTestSettings || {};
          }
          
          if (allowedFields.has('*')) {
            responseData.createdAt = storeData.createdAt;
            responseData.updatedAt = storeData.updatedAt;
          }
        } else {
          // fields가 없으면 모든 필드 반환 (하위 호환성)
          responseData.basic = {
            storeName: storeData.name,
            storeSubtitle: storeData.subtitle,
            storePhone: storeData.phone,
            storeAddress: storeData.address,
          };
          responseData.discount = settings.discount || {
            title: '',
            enabled: false,
            description: '',
          };
          responseData.delivery = settings.delivery || {
            baeminUrl: '',
            ttaengUrl: '',
            yogiyoUrl: '',
            coupangUrl: '',
            deliveryOrder: [],
          };
          responseData.pickup = settings.pickup || {
            title: '',
            enabled: false,
            description: '',
          };
          responseData.images = settings.images || {
            mainLogo: '',
            menuImage: '',
          };
          responseData.businessHours = settings.businessHours || {};
          responseData.sectionOrder = settings.sectionOrder || [];
          responseData.qrCode = qrCode;
          responseData.seoSettings = settings.seoSettings || {};
          responseData.abTestSettings = settings.abTestSettings || {};
          responseData.createdAt = storeData.createdAt;
          responseData.updatedAt = storeData.updatedAt;
        }
        
        sendJsonResponse(res, 200, responseData);
      } else {
        // storeId가 없으면 빈 객체 반환 (데이터 전송량 절감)
        // 전체 설정 조회는 더 이상 지원하지 않음 (개별 API 사용 권장)
        sendJsonResponse(res, 200, {});
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

  /**
   * SEO 최적화 제안을 생성한다.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async postSeoOptimization(req, res) {
    try {
      const body = await parseRequestBody(req);
      log('INFO', 'SEO 최적화 생성 요청', body);

      const plan = await aiOrchestrator.generateSeoPlan(body || {});

      sendJsonResponse(res, 200, {
        success: true,
        data: plan
      });
    } catch (error) {
      log('ERROR', 'SEO 최적화 제안 생성 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'SEO_GENERATION_FAILED',
          message: 'SEO 최적화 제안 생성에 실패했습니다.'
        }
      });
    }
  }

  /**
   * A/B 테스트 전략을 생성한다.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async postAbTestPlan(req, res) {
    try {
      const body = await parseRequestBody(req);
      log('INFO', 'A/B 테스트 전략 생성 요청', body);

      const plan = await aiOrchestrator.generateAbTestPlan(body || {});

      sendJsonResponse(res, 200, {
        success: true,
        data: plan
      });
    } catch (error) {
      log('ERROR', 'A/B 테스트 전략 생성 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'AB_TEST_GENERATION_FAILED',
          message: 'A/B 테스트 전략 생성에 실패했습니다.'
        }
      });
    }
  }

  /**
   * 저장된 SEO 설정을 조회한다.
   * @param {string} storeId 가게 ID
   */
  async getSeoSettingsHandler(storeId, req, res, parsedUrl) {
    try {
      const settings = await dbServices.getSeoSettingsForStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        data: settings
      });
    } catch (error) {
      log('ERROR', 'SEO 설정 조회 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'SEO_SETTINGS_FETCH_FAILED',
          message: 'SEO 설정을 불러오지 못했습니다.'
        }
      });
    }
  }

  /**
   * SEO 설정 히스토리를 조회한다.
   * @param {string} storeId 가게 ID
   */
  async getSeoSettingsHistoryHandler(storeId, req, res, parsedUrl) {
    try {
      const limitParam = parsedUrl?.query?.limit;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      const history = await dbServices.getSeoSettingsHistory(storeId, limit);
      sendJsonResponse(res, 200, {
        success: true,
        data: history
      });
    } catch (error) {
      log('ERROR', 'SEO 설정 히스토리 조회 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'SEO_HISTORY_FETCH_FAILED',
          message: 'SEO 설정 히스토리를 불러오지 못했습니다.'
        }
      });
    }
  }

  /**
   * SEO 설정을 저장한다.
   * @param {string} storeId 가게 ID
   */
  async saveSeoSettingsHandler(storeId, req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { seoSettings } = body || {};

      if (!seoSettings || typeof seoSettings !== 'object') {
        sendJsonResponse(res, 400, {
          success: false,
          error: {
            code: 'INVALID_SEO_SETTINGS',
            message: '저장할 SEO 설정 데이터가 필요합니다.'
          }
        });
        return;
      }

      const saved = await dbServices.saveSeoSettingsForStore(storeId, seoSettings);
      await this.logActivity('seo', 'SEO 설정 저장', 'SEO 설정을 저장했습니다.', storeId);

      sendJsonResponse(res, 200, {
        success: true,
        data: saved
      });
    } catch (error) {
      log('ERROR', 'SEO 설정 저장 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'SEO_SETTINGS_SAVE_FAILED',
          message: 'SEO 설정을 저장하지 못했습니다.'
        }
      });
    }
  }

  /**
   * 저장된 A/B 테스트 설정을 조회한다.
   * @param {string} storeId 가게 ID
   */
  async getAbTestSettingsHandler(storeId, req, res, parsedUrl) {
    try {
      const settings = await dbServices.getAbTestSettingsForStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        data: settings
      });
    } catch (error) {
      log('ERROR', 'A/B 테스트 설정 조회 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'AB_SETTINGS_FETCH_FAILED',
          message: 'A/B 테스트 설정을 불러오지 못했습니다.'
        }
      });
    }
  }

  /**
   * A/B 테스트 히스토리를 조회한다.
   * @param {string} storeId 가게 ID
   */
  async getAbTestSettingsHistoryHandler(storeId, req, res, parsedUrl) {
    try {
      const limitParam = parsedUrl?.query?.limit;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      const history = await dbServices.getAbTestSettingsHistory(storeId, limit);
      sendJsonResponse(res, 200, {
        success: true,
        data: history
      });
    } catch (error) {
      log('ERROR', 'A/B 테스트 히스토리 조회 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'AB_HISTORY_FETCH_FAILED',
          message: 'A/B 테스트 히스토리를 불러오지 못했습니다.'
        }
      });
    }
  }

  /**
   * A/B 테스트 설정을 저장한다.
   * @param {string} storeId 가게 ID
   */
  async saveAbTestSettingsHandler(storeId, req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { abTestSettings } = body || {};

      if (!abTestSettings || typeof abTestSettings !== 'object') {
        sendJsonResponse(res, 400, {
          success: false,
          error: {
            code: 'INVALID_AB_SETTINGS',
            message: '저장할 A/B 테스트 설정 데이터가 필요합니다.'
          }
        });
        return;
      }

      const saved = await dbServices.saveAbTestSettingsForStore(storeId, abTestSettings);
      await this.logActivity('ab-test', 'A/B 테스트 설정 저장', 'A/B 테스트 설정을 저장했습니다.', storeId);

      sendJsonResponse(res, 200, {
        success: true,
        data: saved
      });
    } catch (error) {
      log('ERROR', 'A/B 테스트 설정 저장 실패', error);
      sendJsonResponse(res, 500, {
        success: false,
        error: {
          code: 'AB_SETTINGS_SAVE_FAILED',
          message: 'A/B 테스트 설정을 저장하지 못했습니다.'
        }
      });
    }
  }

  // OpenAI API를 사용한 콘텐츠 생성 (통합)
  async generateWithOpenAI(type, basicInfo, customUserPrompt = '') {
    // OpenAI 클라이언트가 없으면 null 반환
    if (!openai) {
      log('WARN', 'OpenAI 클라이언트가 초기화되지 않았습니다. API 키를 확인하세요.');
      return null;
    }

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
      const qrCodeInfo = settings.qrCode || {};
      const subdomain = (store.subdomain || '').trim();
      const lastGeneratedAt = qrCodeInfo.createdAt || null;
      const qrLockedAt = subdomain
        ? (lastGeneratedAt || store.subdomainCreatedAt || store.subdomainLastModified || null)
        : null;
      const lastModified = store.subdomainLastModified || store.subdomainCreatedAt || store.updatedAt || null;

      // QR 코드 정보 정규화 (url 또는 base64 데이터 확인)
      const normalizedQrCode = {
        url: qrCodeInfo.url || '',
        base64: qrCodeInfo.base64 || '',
        domainUrl: qrCodeInfo.domainUrl || '',
        createdAt: qrCodeInfo.createdAt || null
      };
      
      // base64 데이터가 있지만 url이 없으면 base64를 url로 사용
      if (!normalizedQrCode.url && normalizedQrCode.base64) {
        normalizedQrCode.url = normalizedQrCode.base64;
      }

      log('INFO', '도메인 설정 조회', { 
        storeId, 
        hasQrUrl: Boolean(normalizedQrCode.url), 
        hasBase64: Boolean(normalizedQrCode.base64),
        qrCodeInfo 
      });

      const responseData = {
        subdomain,
        customDomain: '',
        qrLockedAt,
        lastModified,
        lastGeneratedAt,
        qrCode: normalizedQrCode,
        domainSettings: {
          subdomain,
          customDomain: '',
          qrLockedAt,
          lastModified,
          lastGeneratedAt
        }
      };

      sendJsonResponse(res, 200, {
        success: true,
        data: responseData
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
      const { subdomain, customDomain, role } = body || {};

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

      const requestRole = typeof role === 'string' ? role.toLowerCase() : '';
      const normalizedSubdomainInput = typeof subdomain === 'string' ? subdomain.trim() : '';

      if (normalizedSubdomainInput && !/^[a-zA-Z0-9_-]+$/.test(normalizedSubdomainInput)) {
        sendErrorResponse(res, 400, '서브도메인은 영문, 숫자, 하이픈, 언더스코어만 사용할 수 있습니다.');
        return;
      }

      if (customDomain && String(customDomain).trim().length > 0) {
        sendErrorResponse(res, 400, '커스텀 도메인은 현재 지원하지 않습니다.');
        return;
      }

      const currentSettings = await dbServices.getStoreSettings(storeId) || {};
      const existingSubdomain = (store.subdomain || '').trim();
      const hasExistingQr = Boolean(currentSettings.qrCode && currentSettings.qrCode.url);
      const isLockedStatus = (store.subdomainStatus || '').toLowerCase() === 'locked';
      const qrLocked = hasExistingQr || isLockedStatus;

      if (!existingSubdomain && !normalizedSubdomainInput) {
        sendErrorResponse(res, 400, '서브도메인을 입력해주세요.');
        return;
      }

      if (existingSubdomain) {
        const isSameSubdomain = normalizedSubdomainInput
          ? normalizedSubdomainInput === existingSubdomain
          : true;

        if (!isSameSubdomain) {
          if (qrLocked) {
            sendErrorResponse(res, 400, 'QR 코드가 생성된 이후에는 서브도메인을 변경할 수 없습니다.');
            return;
          }

          if (requestRole !== 'superadmin') {
            sendErrorResponse(res, 403, '서브도메인 변경은 슈퍼어드민만 가능합니다.');
            return;
          }
        }

        if (!normalizedSubdomainInput && requestRole !== 'superadmin') {
          sendErrorResponse(res, 403, '서브도메인을 삭제할 권한이 없습니다.');
          return;
        }
      }

      const effectiveSubdomain = normalizedSubdomainInput || existingSubdomain;
      if (!effectiveSubdomain) {
        sendErrorResponse(res, 400, '서브도메인을 입력해주세요.');
        return;
      }

      let domainRecord;
      try {
        domainRecord = await dbServices.updateStoreSubdomain(storeId, {
          subdomain: effectiveSubdomain,
          status: qrLocked ? 'locked' : 'active'
        });
      } catch (error) {
        if (error?.isSubdomainConflict) {
          sendErrorResponse(res, 409, '이미 사용 중인 서브도메인입니다.');
          return;
        }
        throw error;
      }

      await this.logActivity(
        'settings',
        '도메인 설정 저장',
        `서브도메인을 "${effectiveSubdomain}"로 업데이트했습니다.`,
        storeId
      );

      const lastGeneratedAt = currentSettings.qrCode?.createdAt || null;
      const qrLockedAt = (qrLocked || hasExistingQr)
        ? (lastGeneratedAt || domainRecord.subdomain_created_at || domainRecord.subdomain_last_modified || null)
        : null;
      const lastModified = domainRecord.subdomain_last_modified
        || domainRecord.subdomain_created_at
        || store.updatedAt
        || null;

      const responseData = {
        subdomain: effectiveSubdomain,
        customDomain: '',
        qrLockedAt,
        lastModified,
        lastGeneratedAt,
        qrCode: currentSettings.qrCode || {},
        domainSettings: {
          subdomain: effectiveSubdomain,
          customDomain: '',
          qrLockedAt,
          lastModified,
          lastGeneratedAt
        }
      };

      log('INFO', '도메인 설정 저장 완료', { storeId, subdomain: effectiveSubdomain });

      sendJsonResponse(res, 200, {
        success: true,
        message: '도메인 설정이 저장되었습니다.',
        data: responseData
      });
    } catch (error) {
      if (error?.isSubdomainConflict) {
        sendErrorResponse(res, 409, error.message || '이미 사용 중인 서브도메인입니다.');
        return;
      }
      log('ERROR', '도메인 설정 저장 실패', error);
      sendErrorResponse(res, 500, '도메인 설정 저장에 실패했습니다.');
    }
  }

  // 도메인 QR 생성
  async generateDomainQR(req, res, parsedUrl) {
    try {
      // URL에서 storeId 추출 시도 (예: /api/store/:storeId/qr-code)
      let storeId = parsedUrl.pathname.split('/')[3];
      const body = await parseRequestBody(req);
      
      // body에서 storeId가 있으면 우선 사용
      if (body.storeId) {
        storeId = body.storeId;
      }
      
      const { subdomain, role } = body || {};
      
      if (!storeId || !subdomain) {
        sendErrorResponse(res, 400, '가게 ID와 서브도메인이 필요합니다.');
        return;
      }

      const requestRole = typeof role === 'string' ? role.toLowerCase() : '';
      const allowedRoles = new Set(['superadmin', 'owner']);
      if (!allowedRoles.has(requestRole)) {
        sendErrorResponse(res, 403, 'QR 코드를 생성할 권한이 없습니다.');
        return;
      }

      const isOwnerRequest = requestRole === 'owner';

      // 가게 존재 여부 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      const currentSettings = await dbServices.getStoreSettings(storeId) || {};
      const existingSubdomain = (store.subdomain || '').trim();
      const existingQrInfo = currentSettings.qrCode || {};
      // QR 코드 존재 여부 확인: url 또는 base64 데이터가 있으면 존재하는 것으로 간주
      const hasExistingQr = Boolean(existingQrInfo.url || existingQrInfo.base64);
      const qrAlreadyLocked = hasExistingQr || (store.subdomainStatus || '').toLowerCase() === 'locked';

      log('INFO', 'QR 생성 요청 확인', { 
        storeId, 
        hasExistingQr, 
        qrUrl: existingQrInfo.url, 
        hasBase64: Boolean(existingQrInfo.base64),
        qrAlreadyLocked,
        isOwnerRequest 
      });

      if (isOwnerRequest && (hasExistingQr || qrAlreadyLocked)) {
        sendErrorResponse(res, 403, '점주는 이미 발급된 QR 코드를 다시 생성할 수 없습니다.');
        return;
      }
      
      // 도메인 URL 생성
      const normalizedSubdomain = subdomain.trim().replace(/^\/+|\/+$/g, '');
      if (!normalizedSubdomain) {
        sendErrorResponse(res, 400, '서브도메인을 입력해주세요.');
        return;
      }

      if (existingSubdomain && existingSubdomain !== normalizedSubdomain) {
        sendErrorResponse(res, 400, '서브도메인이 변경되었습니다. 먼저 도메인 설정을 업데이트해주세요.');
        return;
      }

      const origin = req.headers?.origin
        || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || `localhost:${PORT}`}`;
      const domainUrl = `${origin.replace(/\/+$/, '')}/${normalizedSubdomain}`;

      // Railway 환경 대응: QR 코드를 Base64로 변환하여 DB에 저장
      // 파일 시스템은 컨테이너 재시작 시 초기화되므로 DB에 저장하는 것이 안전함
      const qrCodeBase64 = await QRCode.toDataURL(domainUrl, {
        width: 512,
        margin: 2,
        type: 'image/png'
      });

      if (!qrCodeBase64 || !qrCodeBase64.startsWith('data:image/png;base64,')) {
        throw new Error('QR 코드 생성에 실패했습니다.');
      }

      // Base64 데이터만 추출 (data:image/png;base64, 제거)
      const base64Data = qrCodeBase64.replace(/^data:image\/png;base64,/, '');

      // Base64 데이터 크기 확인 (약 200KB 제한)
      const base64Size = base64Data.length;
      const estimatedSize = (base64Size * 3) / 4; // Base64는 원본보다 약 33% 큼
      if (estimatedSize > 200 * 1024) {
        throw new Error('QR 코드 크기가 너무 큽니다.');
      }

      const fileName = `domain-${storeId}-${Date.now()}.png`;
      const qrCodeUrl = `/qr/${fileName}`;

      const nowIso = new Date().toISOString();
      const mergedSettings = {
        delivery: currentSettings.delivery || {},
        discount: currentSettings.discount || {},
        pickup: currentSettings.pickup || {},
        images: currentSettings.images || {},
        basic: currentSettings.basic || {},
        businessHours: currentSettings.businessHours || {},
        sectionOrder: currentSettings.sectionOrder || [],
        qrCode: {
          url: qrCodeUrl,
          base64: qrCodeBase64, // Base64 데이터 저장 (Railway 환경 대응)
          domainUrl,
          subdomain: normalizedSubdomain,
          storeId,
          createdAt: nowIso
        }
      };

      // DB 저장
      await dbServices.updateStoreSettings(storeId, mergedSettings);
      await dbServices.updateStoreSubdomain(storeId, {
        subdomain: normalizedSubdomain,
        status: 'locked'
      });

      if (store.subdomain !== normalizedSubdomain) {
        await dbServices.updateStore(storeId, {
          name: store.name,
          subtitle: store.subtitle,
          phone: store.phone,
          address: store.address,
          subdomain: normalizedSubdomain
        });
      }

      await this.logActivity(
        'qr',
        isOwnerRequest ? '점주 QR 코드 생성' : (hasExistingQr ? 'QR 코드 재발급' : 'QR 코드 생성'),
        `역할: ${requestRole}, 서브도메인: ${normalizedSubdomain}`,
        storeId
      );

      const responseData = {
        subdomain: normalizedSubdomain,
        customDomain: '',
        qrLockedAt: nowIso,
        lastModified: nowIso,
        lastGeneratedAt: nowIso,
        qrCode: mergedSettings.qrCode,
        domainSettings: {
          subdomain: normalizedSubdomain,
          customDomain: '',
          qrLockedAt: nowIso,
          lastModified: nowIso,
          lastGeneratedAt: nowIso
        }
      };

      sendJsonResponse(res, 200, {
        success: true,
        qrCodeUrl,
        domainUrl,
        message: '도메인 QR 코드가 생성되었습니다.',
        data: responseData
      });
    } catch (error) {
      log('ERROR', '도메인 QR 생성 실패', error);
      sendErrorResponse(res, 500, error.message || '도메인 QR 코드 생성에 실패했습니다.');
    }
  }

  async deleteDomainQR(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId, role } = body || {};

      if (!storeId) {
        sendErrorResponse(res, 400, 'storeId가 필요합니다.');
        return;
      }

      const requestRole = typeof role === 'string' ? role.toLowerCase() : '';
      if (requestRole !== 'superadmin') {
        sendErrorResponse(res, 403, 'QR 코드를 삭제할 권한이 없습니다.');
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
        const relativeQrPath = qrCodeInfo.url.replace(/^\/+/, '');
        let qrPath = path.join(__dirname, '../../', relativeQrPath);
        if (!fs.existsSync(qrPath)) {
          const legacyPath = path.join(__dirname, '../../public', relativeQrPath);
          if (fs.existsSync(legacyPath)) {
            qrPath = legacyPath;
          }
        }
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
        qrCode: {}
      };

      await dbServices.updateStoreSettings(storeId, mergedSettings);
      await dbServices.updateStoreSubdomain(storeId, {
        subdomain: store.subdomain || null,
        status: store.subdomain ? 'active' : 'inactive'
      });

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

  async approveStore(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3];
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const approved = await dbServices.approveStore(storeId);
      sendJsonResponse(res, 200, {
        success: true,
        data: approved,
        message: '가게 입점 요청이 승인되었습니다.'
      });
    } catch (error) {
      log('ERROR', '가게 승인 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 승인에 실패했습니다.');
    }
  }

  async rejectStore(req, res, parsedUrl) {
    try {
      const parts = parsedUrl.pathname.split('/');
      const storeId = parts[3];
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      const body = await parseRequestBody(req);
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

      const rejected = await dbServices.rejectStore(storeId, reason);
      sendJsonResponse(res, 200, {
        success: true,
        data: rejected,
        message: '가게 입점 요청이 거절되었습니다.'
      });
    } catch (error) {
      log('ERROR', '가게 거절 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 거절에 실패했습니다.');
    }
  }

  // 이미지 업로드 핸들러 (파일 시스템 저장 방식)
  // 이미지를 /assets/uploads/{storeId}/ 폴더에 저장하고, DB에는 파일 경로(URL)만 저장
  async uploadImage(storeId, req, res, parsedUrl) {
    try {
      if (!storeId) {
        log('ERROR', '이미지 업로드 실패: 가게 ID 없음');
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      // 가게 존재 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        log('ERROR', '이미지 업로드 실패: 가게를 찾을 수 없음', { storeId });
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 요청 본문 파싱 (multipart/form-data만 지원)
      let imageType, fileBuffer, fileExtension, mimeType;
      
      try {
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('multipart/form-data')) {
          const parsed = await parseMultipartFormData(req);
          const file = parsed.files?.image;
          
          if (!file || !file.buffer) {
            sendErrorResponse(res, 400, '이미지 파일이 필요합니다.');
            return;
          }
          
          fileBuffer = file.buffer;
          imageType = parsed.fields?.imageType || 'mainLogo';
          mimeType = file.contentType || 'image/png';
          
          // 파일 확장자 결정
          const filename = file.filename || '';
          if (filename.includes('.')) {
            fileExtension = filename.split('.').pop().toLowerCase();
          } else {
            // MIME 타입에서 확장자 추출
            const mimeToExt = {
              'image/jpeg': 'jpg',
              'image/jpg': 'jpg',
              'image/png': 'png',
              'image/gif': 'gif',
              'image/webp': 'webp'
            };
            fileExtension = mimeToExt[mimeType] || 'png';
          }
        } else if (contentType.includes('application/json')) {
          // JSON 요청: Base64 데이터를 파일로 변환 (하위 호환성)
          const body = await parseRequestBody(req);
          const imageData = body.imageData || body.data;
          imageType = body.imageType || 'mainLogo';
          
          if (!imageData) {
            sendErrorResponse(res, 400, '이미지 데이터가 필요합니다.');
            return;
          }
          
          // Base64 데이터를 Buffer로 변환
          const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!base64Match) {
            sendErrorResponse(res, 400, '유효하지 않은 Base64 이미지 데이터입니다.');
            return;
          }
          
          mimeType = `image/${base64Match[1]}`;
          fileExtension = base64Match[1] === 'jpeg' ? 'jpg' : base64Match[1];
          fileBuffer = Buffer.from(base64Match[2], 'base64');
        } else {
          sendErrorResponse(res, 400, '지원하지 않는 Content-Type입니다. multipart/form-data 또는 application/json을 사용해주세요.');
          return;
        }
      } catch (parseError) {
        log('ERROR', '이미지 업로드 실패: 요청 파싱 오류', { error: parseError.message, storeId });
        sendErrorResponse(res, 400, `요청 파싱 실패: ${parseError.message}`);
        return;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        log('ERROR', '이미지 업로드 실패: 이미지 데이터 없음', { storeId });
        sendErrorResponse(res, 400, '이미지 데이터가 필요합니다.');
        return;
      }

      // 파일 크기 확인 (10MB 제한)
      if (fileBuffer.length > 10 * 1024 * 1024) {
        log('ERROR', '이미지 업로드 실패: 파일 크기 초과', { storeId, size: fileBuffer.length });
        sendErrorResponse(res, 400, '이미지 파일 크기는 10MB 이하여야 합니다.');
        return;
      }

      // 업로드 디렉토리 경로 설정
      const uploadsDir = path.join(__dirname, '../../assets/uploads', storeId);
      
      // 디렉토리가 없으면 생성
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        log('INFO', '업로드 디렉토리 생성', { path: uploadsDir });
      }

      // 파일명 생성 (타임스탬프 + 이미지 타입 + 확장자)
      const timestamp = Date.now();
      const filename = `${imageType}_${timestamp}.${fileExtension}`;
      const filePath = path.join(uploadsDir, filename);
      
      // 파일 저장
      fs.writeFileSync(filePath, fileBuffer);
      log('INFO', '이미지 파일 저장 완료', { storeId, filePath, size: fileBuffer.length });

      // 파일 URL 생성 (웹에서 접근 가능한 경로)
      const imageUrl = `/assets/uploads/${storeId}/${filename}`;

      // 현재 설정 가져오기
      const currentSettings = await dbServices.getStoreSettings(storeId);
      const settings = currentSettings || {};
      settings.images = settings.images || {};
      
      // 기존 이미지 파일이 있으면 삭제 (선택적 - 디스크 공간 절약)
      const oldImageUrl = settings.images[imageType];
      if (oldImageUrl && oldImageUrl.startsWith('/assets/uploads/')) {
        try {
          const oldFilePath = path.join(__dirname, '../../', oldImageUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            log('INFO', '기존 이미지 파일 삭제', { oldFilePath });
          }
        } catch (deleteError) {
          log('WARN', '기존 이미지 파일 삭제 실패 (무시)', { error: deleteError.message });
        }
      }
      
      // 파일 URL을 settings.images에 저장
      settings.images[imageType] = imageUrl;

      // 데이터베이스에 저장
      await dbServices.updateStoreSettings(storeId, settings);

      log('INFO', '이미지 업로드 완료 (파일 시스템 저장)', { storeId, imageType, imageUrl, size: fileBuffer.length });

      // 응답 반환
      sendJsonResponse(res, 200, {
        success: true,
        data: {
          imageType: imageType,
          imageUrl: imageUrl,
          size: fileBuffer.length,
          stored: true
        },
        message: '이미지가 업로드되어 저장되었습니다.'
      });
    } catch (error) {
      log('ERROR', '이미지 업로드 실패: 예상치 못한 오류', { storeId, error: error.message, stack: error.stack });
      sendErrorResponse(res, 500, error.message || '이미지 업로드에 실패했습니다.');
    }
  }

  // 동영상 업로드 핸들러 (Base64 데이터베이스 저장 방식)
  // 참고: 프론트엔드에서 이미 Base64로 변환하여 settings.images에 저장하므로
  // 이 엔드포인트는 호환성을 위해 유지하되, 파일 시스템 저장은 제거하고
  // Base64 데이터를 받아서 데이터베이스에 저장하도록 변경
  async uploadVideo(storeId, req, res, parsedUrl) {
    try {
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      // 가게 존재 확인
      const store = await dbServices.getStoreById(storeId);
      if (!store) {
        sendErrorResponse(res, 404, '가게를 찾을 수 없습니다.');
        return;
      }

      // 요청 본문 파싱 (JSON 또는 multipart/form-data)
      let body, videoData, videoType, videoInfo;
      
      try {
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          // JSON 요청: Base64 데이터 직접 전송
          body = await parseRequestBody(req);
          videoData = body.videoData || body.data;
          videoType = body.videoType || 'promoVideo';
          videoInfo = body.videoInfo || {};
        } else if (contentType.includes('multipart/form-data')) {
          // multipart 요청: Base64로 변환
          const parsed = await parseMultipartFormData(req);
          const file = parsed.files?.video;
          
          if (!file || !file.buffer) {
            sendErrorResponse(res, 400, '동영상 파일이 필요합니다.');
            return;
          }

          // 파일 확장자 확인
          const allowedExtensions = ['.mp4', '.webm', '.ogg'];
          const fileExt = path.extname(file.filename).toLowerCase();
          if (!allowedExtensions.includes(fileExt)) {
            sendErrorResponse(res, 400, '지원하지 않는 동영상 형식입니다. (mp4, webm, ogg만 가능)');
            return;
          }

          // 파일 크기 확인 (20MB 제한)
          if (file.size > 20 * 1024 * 1024) {
            sendErrorResponse(res, 400, '동영상 파일 크기는 20MB 이하여야 합니다.');
            return;
          }
          
          // 파일을 Base64로 변환
          videoData = `data:${file.mimetype || 'video/mp4'};base64,${file.buffer.toString('base64')}`;
          videoType = parsed.fields?.videoType || 'promoVideo';
          videoInfo = {
            type: file.mimetype || 'video/mp4',
            filename: file.filename,
            size: file.size,
            uploadedAt: new Date().toISOString()
          };
        } else {
          sendErrorResponse(res, 400, '지원하지 않는 Content-Type입니다.');
          return;
        }
      } catch (parseError) {
        log('ERROR', '동영상 업로드 실패: 요청 파싱 오류', { error: parseError.message, storeId });
        sendErrorResponse(res, 400, `요청 파싱 실패: ${parseError.message}`);
        return;
      }

      if (!videoData) {
        log('ERROR', '동영상 업로드 실패: 동영상 데이터 없음', { storeId });
        sendErrorResponse(res, 400, '동영상 데이터가 필요합니다.');
        return;
      }

      // Base64 데이터 크기 확인 (20MB 제한, Base64는 원본보다 약 33% 큼)
      const base64Size = videoData.length;
      const estimatedSize = (base64Size * 3) / 4;
      if (estimatedSize > 20 * 1024 * 1024) {
        log('ERROR', '동영상 업로드 실패: 파일 크기 초과', { storeId, estimatedSize });
        sendErrorResponse(res, 400, '동영상 파일 크기는 20MB 이하여야 합니다.');
        return;
      }

      // 현재 설정 가져오기
      const currentSettings = await dbServices.getStoreSettings(storeId);
      const settings = currentSettings || {};
      settings.images = settings.images || {};
      
      // Base64 데이터를 settings.images에 저장 (프론트엔드 형식과 동일하게)
      settings.images[videoType] = {
        src: videoData,
        ...videoInfo
      };

      // 데이터베이스에 저장
      await dbServices.updateStoreSettings(storeId, settings);

      log('INFO', '동영상 업로드 완료 (DB 저장)', { storeId, videoType, dataSize: base64Size });

      // 응답 반환
      sendJsonResponse(res, 200, {
        success: true,
        data: {
          videoType: videoType,
          size: estimatedSize,
          stored: true
        },
        message: '동영상이 데이터베이스에 저장되었습니다.'
      });
    } catch (error) {
      log('ERROR', '동영상 업로드 실패', { storeId, error: error.message, stack: error.stack });
      sendErrorResponse(res, 500, error.message || '동영상 업로드에 실패했습니다.');
    }
  }

  async bulkExportStores(req, res, parsedUrl) {
    try {
      const format = String(parsedUrl.query?.format || 'json').toLowerCase();
      const stores = await dbServices.getStoresForExport();

      if (format === 'csv') {
        const headers = ['id', 'name', 'subtitle', 'phone', 'address', 'status', 'subdomain', 'createdAt', 'lastModified'];
        const escapeCsv = value => {
          if (value === null || value === undefined) return '';
          const stringValue = String(value);
          if (/[",\n]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        };

        const csvContent = [
          headers.join(','),
          ...stores.map(store => headers.map(key => escapeCsv(store[key])).join(','))
        ].join('\n');

        const csvWithBom = '\uFEFF' + csvContent;
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="stores_${new Date().toISOString().split('T')[0]}.csv"`
        });
        res.end(csvWithBom);
        return;
      }

      sendJsonResponse(res, 200, {
        success: true,
        exportedAt: new Date().toISOString(),
        totalCount: stores.length,
        stores
      });
    } catch (error) {
      log('ERROR', '가게 대량 내보내기 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 데이터를 내보내지 못했습니다.');
    }
  }

  async bulkImportStores(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const format = String(body?.format || 'json').toLowerCase();

      let payloadStores = [];
      if (format === 'json') {
        payloadStores = Array.isArray(body?.stores) ? body.stores : [];
      } else if (format === 'csv') {
        const csvData = body?.csvData || '';
        const lines = csvData.split(/\r?\n/).filter(Boolean);
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(header => header.trim());
          payloadStores = lines.slice(1).map(line => {
            const values = line.split(',');
            const store = {};
            headers.forEach((header, index) => {
              store[header] = values[index] ? values[index].trim() : '';
            });
            return store;
          });
        }
      } else {
        sendErrorResponse(res, 400, '지원하지 않는 포맷입니다.');
        return;
      }

      if (!payloadStores.length) {
        sendErrorResponse(res, 400, '가져올 가게 정보가 없습니다.');
        return;
      }

      const importedIds = [];
      const errors = [];
      for (const entry of payloadStores) {
        const rawName = entry?.name || entry?.storeName || entry?.basic?.storeName || '';
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        if (!name) {
          errors.push({ item: entry, message: '가게명이 없습니다.' });
          continue;
        }

        const subtitle = (entry?.subtitle || entry?.basic?.storeSubtitle || '').toString();
        const phone = (entry?.phone || entry?.basic?.storePhone || '').toString();
        const address = (entry?.address || entry?.basic?.storeAddress || '').toString();
        const statusCandidate = (entry?.status || '').toString().toLowerCase();
        const allowedStatuses = new Set(['active', 'paused', 'pending', 'rejected']);
        const status = allowedStatuses.has(statusCandidate) ? statusCandidate : 'pending';

        try {
          const created = await dbServices.createStore({
            name,
            subtitle,
            phone,
            address,
            status
          });
          importedIds.push(created.id);
        } catch (error) {
          errors.push({ item: entry, message: error.message || '가게 생성 실패' });
        }
      }

      sendJsonResponse(res, 200, {
        success: true,
        importedCount: importedIds.length,
        failedCount: errors.length,
        importedIds,
        errors
      });
    } catch (error) {
      log('ERROR', '가게 대량 가져오기 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 데이터를 가져오지 못했습니다.');
    }
  }

  async bulkPauseStores(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const storeIds = Array.isArray(body?.storeIds) ? body.storeIds : [];
      const result = await dbServices.bulkUpdateStoreStatus(storeIds, 'paused');
      sendJsonResponse(res, 200, {
        success: true,
        pausedCount: result.updatedCount,
        affectedIds: result.affectedIds || []
      });
    } catch (error) {
      log('ERROR', '가게 대량 일시정지 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 일시정지에 실패했습니다.');
    }
  }

  async bulkResumeStores(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const storeIds = Array.isArray(body?.storeIds) ? body.storeIds : [];
      const result = await dbServices.bulkUpdateStoreStatus(storeIds, 'active');
      sendJsonResponse(res, 200, {
        success: true,
        resumedCount: result.updatedCount,
        affectedIds: result.affectedIds || []
      });
    } catch (error) {
      log('ERROR', '가게 대량 재개 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 재개에 실패했습니다.');
    }
  }

  async bulkDeleteStores(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const storeIds = Array.isArray(body?.storeIds) ? body.storeIds : [];
      const result = await dbServices.bulkDeleteStores(storeIds);
      sendJsonResponse(res, 200, {
        success: true,
        deletedCount: result.deletedCount,
        deletedIds: result.deletedIds || []
      });
    } catch (error) {
      log('ERROR', '가게 대량 삭제 실패', error);
      sendErrorResponse(res, 500, error.message || '가게 삭제에 실패했습니다.');
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

  async logStoreEvent(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { storeId, eventType, payload } = body || {};

      if (!storeId || !eventType) {
        sendErrorResponse(res, 400, 'storeId와 eventType은 필수입니다.');
        return;
      }

      const userAgent = req.headers['user-agent'] || '';
      const event = await dbServices.createStoreEvent({
        storeId,
        eventType,
        eventPayload: payload || {},
        userAgent
      });

      sendJsonResponse(res, 200, {
        success: true,
        event
      });
    } catch (error) {
      log('ERROR', '이벤트 로깅 실패', error);
      sendErrorResponse(res, 500, error.message || '이벤트 로그 저장에 실패했습니다.');
    }
  }

  async logDebugMessage(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const { source = 'frontend', message = '', detail = null } = body || {};
      log('WARN', '프론트 디버그 로그 수신', { source, message, detail });
      sendJsonResponse(res, 200, { success: true });
    } catch (error) {
      log('ERROR', '디버그 로그 수신 실패', error);
      sendErrorResponse(res, 500, error.message || '디버그 로그 저장에 실패했습니다.');
    }
  }

  async getDashboardSummary(req, res, parsedUrl) {
    try {
      const { storeId: rawStoreId = null, scope: rawScope = null, from = null, to = null } = parsedUrl.query || {};
      const normalizedScope = rawScope === 'all' ? 'all' : 'store';
      const normalizedStoreId = normalizedScope === 'all'
        ? null
        : (rawStoreId && rawStoreId !== 'all' ? rawStoreId : null);

      if (normalizedScope !== 'all' && !normalizedStoreId) {
        sendErrorResponse(res, 400, 'storeId가 필요합니다.');
        return;
      }

      const summary = await dbServices.getEventSummary({
        storeId: normalizedStoreId,
        from,
        to
      });

      sendJsonResponse(res, 200, {
        scope: normalizedScope,
        storeId: normalizedStoreId,
        ...summary
      });
    } catch (error) {
      log('ERROR', '대시보드 요약 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '대시보드 데이터를 불러오지 못했습니다.');
    }
  }

  async getDashboardStores(req, res, parsedUrl) {
    try {
      const { from = null, to = null, search = '', limit = '100' } = parsedUrl.query || {};
      const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 10), 500);

      const metrics = await dbServices.getEventTotalsByStore({
        from,
        to,
        search,
        limit: numericLimit
      });

      sendJsonResponse(res, 200, {
        success: true,
        data: metrics
      });
    } catch (error) {
      log('ERROR', '대시보드 가게 메트릭 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '가게별 대시보드 데이터를 불러오지 못했습니다.');
    }
  }

  async getReleaseNotes(req, res, parsedUrl) {
    try {
      const { limit = '10' } = parsedUrl.query || {};
      const releaseRows = await dbServices.getReleaseNotes({ limit });

      const normalizeFeatures = raw => {
        if (!raw) {
          return [];
        }

        if (Array.isArray(raw)) {
          return raw
            .map(entry => {
              if (!entry) return null;
              const category = entry.category || '업데이트';
              const items = Array.isArray(entry.items)
                ? entry.items.filter(Boolean)
                : entry.items
                  ? [entry.items].filter(Boolean)
                  : [];
              if (items.length === 0) return null;
              return { category, items };
            })
            .filter(Boolean);
        }

        if (typeof raw === 'object') {
          return Object.entries(raw)
            .map(([category, items]) => {
              const list = Array.isArray(items)
                ? items.filter(Boolean)
                : items
                  ? [items].filter(Boolean)
                  : [];
              if (list.length === 0) return null;
              return { category, items: list };
            })
            .filter(Boolean);
        }

        return [];
      };

      const normalizeList = raw => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(Boolean);
        if (typeof raw === 'object') {
          return Object.values(raw)
            .flat()
            .filter(Boolean);
        }
        return [raw].filter(Boolean);
      };

      const releaseNotes = releaseRows.map(row => ({
        version: row.version,
        codename: row.codename || null,
        releaseDate: row.release_date ? new Date(row.release_date).toISOString() : null,
        title: row.title || '',
        highlights: Array.isArray(row.highlights) ? row.highlights : normalizeList(row.highlights),
        features: normalizeFeatures(row.features),
        improvements: normalizeList(row.technical_improvements),
        bugFixes: normalizeList(row.bug_fixes)
      }));

      sendJsonResponse(res, 200, {
        success: true,
        releaseNotes
      });
    } catch (error) {
      log('ERROR', '릴리즈 노트 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '릴리즈 노트를 불러오지 못했습니다.');
    }
  }

  async checkSuperAdminCredentials(req, res, parsedUrl) {
    try {
      const body = await parseRequestBody(req);
      const username = body?.username?.trim();
      const password = body?.password?.trim();

      if (!username || !password) {
        sendErrorResponse(res, 400, '아이디와 비밀번호를 모두 입력해주세요.');
        return;
      }

      const result = await dbServices.authenticateSuperAdmin(username, password);
      if (!result?.success) {
        sendErrorResponse(res, 401, result?.error || '인증에 실패했습니다.');
        return;
      }

      sendJsonResponse(res, 200, {
        success: true,
        token: result.token || null,
        message: '슈퍼어드민 인증에 성공했습니다.'
      });
    } catch (error) {
      log('ERROR', '슈퍼어드민 인증 확인 실패', error);
      sendErrorResponse(res, 500, error.message || '슈퍼어드민 인증을 확인하지 못했습니다.');
    }
  }

  async getOwnerAccountDetailHandler(ownerId, req, res, parsedUrl) {
    try {
      const owner = await dbServices.getOwnerAccountDetail(ownerId);
      if (!owner) {
        sendErrorResponse(res, 404, '점주 계정을 찾을 수 없습니다.');
        return;
      }

      sendJsonResponse(res, 200, {
        success: true,
        owner
      });
    } catch (error) {
      log('ERROR', '점주 계정 상세 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '점주 계정 정보를 불러오지 못했습니다.');
    }
  }

  async createStoreForOwnerHandler(ownerId, req, res, parsedUrl) {
    if (!ownerId) {
      sendErrorResponse(res, 400, '점주 ID가 필요합니다.');
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const trimmedName = sanitizeAddressSegment(body?.name || '');

      if (!trimmedName) {
        sendErrorResponse(res, 400, '가게명을 입력해주세요.');
        return;
      }

      const { isValid: phoneValid, normalized: normalizedPhone } = validatePhoneNumber(body?.phone || '');
      if (!phoneValid) {
        sendErrorResponse(res, 400, '연락처 형식이 올바르지 않습니다. 예: 010-1234-5678');
        return;
      }

      const addressValidation = validateOwnerAddress({
        storePostalCode: body?.postalCode,
        storeRoadAddress: body?.roadAddress,
        storeExtraAddress: body?.extraAddress,
        storeAddressDetail: body?.addressDetail
      });

      if (!addressValidation.isValid) {
        sendErrorResponse(res, 400, addressValidation.message || '주소 정보가 올바르지 않습니다.');
        return;
      }

      const sanitizedSubtitle = sanitizeAddressSegment(body?.subtitle || '');
      const sanitizedCategory = sanitizeAddressSegment(body?.category || '');
      const sanitizedDescription = typeof body?.description === 'string' ? body.description.trim() : '';
      const memo = typeof body?.memo === 'string' ? body.memo.trim() : '';

      const storePayload = {
        name: trimmedName,
        subtitle: sanitizedSubtitle,
        phone: normalizedPhone,
        address: addressValidation.sanitized.storeAddress || '',
        status: 'pending',
        basic: {
          storeName: trimmedName,
          storeSubtitle: sanitizedSubtitle,
          storeCategory: sanitizedCategory,
          storeDescription: sanitizedDescription,
          storePhone: normalizedPhone,
          storeAddress: addressValidation.sanitized.storeAddress || '',
          storePostalCode: addressValidation.sanitized.storePostalCode || '',
          storeRoadAddress: addressValidation.sanitized.storeRoadAddress || '',
          storeExtraAddress: addressValidation.sanitized.storeExtraAddress || '',
          storeAddressDetail: addressValidation.sanitized.storeAddressDetail || ''
        }
      };

      const result = await dbServices.createStoreForOwner(ownerId, storePayload, memo);

      sendJsonResponse(res, 200, {
        success: true,
        store: result.store,
        owner: result.owner,
        message: '입점 신청이 접수되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주 가게 입점 신청 처리 실패', error);
      sendErrorResponse(res, 500, error.message || '입점 신청 처리에 실패했습니다.');
    }
  }

  async updateOwnerPasswordHandler(ownerId, req, res, parsedUrl) {
    if (!ownerId) {
      sendErrorResponse(res, 400, '점주 ID가 필요합니다.');
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword.trim() : '';
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword.trim() : '';
      const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword.trim() : '';

      // 입력 검증
      if (!currentPassword || !newPassword) {
        sendErrorResponse(res, 400, '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.');
        return;
      }

      // 새 비밀번호 확인 검증 (프론트에서도 확인하지만 백엔드에서도 재확인)
      if (confirmPassword && newPassword !== confirmPassword) {
        sendErrorResponse(res, 400, '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
        return;
      }

      if (newPassword.length < 8) {
        sendErrorResponse(res, 400, '새 비밀번호는 8자 이상 입력해주세요.');
        return;
      }

      if (newPassword === currentPassword) {
        sendErrorResponse(res, 400, '새 비밀번호는 기존 비밀번호와 달라야 합니다.');
        return;
      }

      // 점주 계정 정보 조회
      const ownerDetail = await dbServices.getOwnerAccountDetail(ownerId);
      if (!ownerDetail) {
        sendErrorResponse(res, 404, '점주 계정을 찾을 수 없습니다.');
        return;
      }

      // 현재 비밀번호 검증
      const storedHash = ownerDetail.passwordHash || '';
      const hashedCurrent = dbServices.hashPassword(currentPassword);
      const isStoredHashed = /^[0-9a-f]{64}$/i.test(storedHash);
      const passwordMatches = isStoredHashed
        ? storedHash === hashedCurrent
        : storedHash === currentPassword;

      if (!passwordMatches) {
        sendErrorResponse(res, 403, '현재 비밀번호가 일치하지 않습니다.');
        return;
      }

      // 새 비밀번호 해시 및 저장 (updateOwnerPassword 내부에서 해시 처리)
      const updatedOwner = await dbServices.updateOwnerPassword(ownerId, newPassword);

      sendJsonResponse(res, 200, {
        success: true,
        message: '비밀번호가 변경되었습니다.',
        owner: {
          id: updatedOwner.id,
          name: updatedOwner.owner_name,
          email: updatedOwner.email,
          status: updatedOwner.status
        }
      });
    } catch (error) {
      log('ERROR', '점주 비밀번호 변경 실패', error);
      const message = error && error.message ? error.message : '비밀번호를 변경할 수 없습니다.';
      const statusCode = error && error.message && error.message.includes('찾을 수 없습니다') ? 404 : 500;
      sendErrorResponse(res, statusCode, message);
    }
  }

  // 점주 본인의 대표 가게 설정
  async setOwnerPrimaryStore(req, res, parsedUrl) {
    try {
      // 점주 계정 인증 확인 (sessionStorage에서 가져온 owner_id와 비교)
      const body = await parseRequestBody(req);
      const storeId = typeof body?.storeId === 'string' ? body.storeId.trim() : '';
      const ownerId = typeof body?.ownerId === 'string' ? body.ownerId.trim() : '';

      // 세션에서 점주 ID 가져오기 (보안을 위해 쿼리 파라미터에서 가져오는 대신 body에서 받음)
      // 프론트엔드에서 sessionStorage의 owner_id를 body에 포함해서 보냄
      if (!ownerId) {
        sendErrorResponse(res, 400, '점주 ID가 필요합니다.');
        return;
      }

      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }

      // 대표 가게 설정
      await dbServices.setOwnerPrimaryStore(ownerId, storeId);

      sendJsonResponse(res, 200, {
        success: true,
        message: '대표 가게가 설정되었습니다.',
        storeId
      });
    } catch (error) {
      log('ERROR', '점주 대표 가게 설정 실패', error);
      sendErrorResponse(res, 500, error.message || '대표 가게 설정에 실패했습니다.');
    }
  }

  async pauseOwnerAccountHandler(ownerId, req, res, parsedUrl) {
    try {
      const result = await dbServices.pauseOwnerAccount(ownerId);
      sendJsonResponse(res, 200, {
        success: true,
        owner: result,
        message: '계정이 일시 중지되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주 계정 중지 실패', error);
      sendErrorResponse(res, 500, error.message || '계정 중지에 실패했습니다.');
    }
  }

  async resumeOwnerAccountHandler(ownerId, req, res, parsedUrl) {
    try {
      const result = await dbServices.resumeOwnerAccount(ownerId);
      sendJsonResponse(res, 200, {
        success: true,
        owner: result,
        message: '계정이 다시 활성화되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주 계정 재개 실패', error);
      sendErrorResponse(res, 500, error.message || '계정 재개에 실패했습니다.');
    }
  }

  // ===== 엠버서더 관련 API 핸들러 =====
  
  // 엠버서더 목록 조회
  async getAmbassadors(req, res, parsedUrl) {
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const query = parsedUrl.query || {};
      const storeId = query.storeId || '';
      
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }
      
      const status = query.status || null;
      const ambassadors = await dbServices.getAmbassadors(storeId, { status });
      
      sendJsonResponse(res, 200, {
        success: true,
        data: ambassadors
      });
    } catch (error) {
      log('ERROR', '엠버서더 목록 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '엠버서더 목록 조회에 실패했습니다.');
    }
  }
  
  // 엠버서더 통계 조회
  async getAmbassadorStats(req, res, parsedUrl) {
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const query = parsedUrl.query || {};
      const storeId = query.storeId || null;
      const ambassadorId = query.ambassadorId ? parseInt(query.ambassadorId, 10) : null;
      const startDate = query.startDate || null;
      const endDate = query.endDate || null;
      
      log('INFO', '엠버서더 통계 조회 요청', { storeId, ambassadorId, startDate, endDate });
      
      // 권한 확인 (점주는 자신의 가게만 조회 가능)
      const cookies = parseCookies(req.headers.cookie || '');
      const isSuperAdmin = cookies.is_superadmin === 'true';
      const requestOwnerId = cookies.owner_id || req.headers['x-owner-id'] || null;
      
      // 점주 계정이고 storeId가 없으면 에러
      if (!isSuperAdmin && !storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }
      
      // 점주 계정인 경우 자신의 가게인지 확인
      if (!isSuperAdmin && requestOwnerId && storeId) {
        const ownerStores = await dbServices.getStoresByOwner(requestOwnerId);
        const hasAccess = ownerStores.some(store => store.id === storeId);
        if (!hasAccess) {
          sendErrorResponse(res, 403, '접근 권한이 없습니다.');
          return;
        }
      }
      
      const stats = await dbServices.getAmbassadorStats(storeId, ambassadorId, {
        startDate,
        endDate
      });
      
      log('INFO', '엠버서더 통계 조회 결과', { 
        ambassadorCount: stats?.ambassadors?.length || 0,
        phoneStatsCount: stats?.phoneStats?.length || 0,
        stats: stats?.ambassadors?.map(a => ({ id: a.ambassadorId, visits: a.visitCount, calls: a.callCount }))
      });
      
      sendJsonResponse(res, 200, {
        success: true,
        data: stats
      });
    } catch (error) {
      log('ERROR', '엠버서더 통계 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '엠버서더 통계 조회에 실패했습니다.');
    }
  }
  
  // 키로 엠버서더 조회 (공개, 가게 페이지용)
  async getAmbassadorByKey(req, res, parsedUrl) {
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      // URL 파라미터에서 키 추출 (/api/ambassadors/key/:key)
      const parts = parsedUrl.pathname.split('/');
      const key = parts[parts.length - 1]?.split('?')[0]; // 쿼리 파라미터 제거
      
      if (!key) {
        sendErrorResponse(res, 400, '엠버서더 키가 필요합니다.');
        return;
      }
      
      const ambassador = await dbServices.getAmbassadorByKey(key);
      
      if (!ambassador) {
        sendErrorResponse(res, 404, '엠버서더를 찾을 수 없습니다.');
        return;
      }
      
      sendJsonResponse(res, 200, {
        success: true,
        data: ambassador
      });
    } catch (error) {
      log('ERROR', '엠버서더 조회 실패', error);
      sendErrorResponse(res, 500, error.message || '엠버서더 조회에 실패했습니다.');
    }
  }
  
  // 엠버서더 생성
  async createAmbassador(req, res, parsedUrl) {
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const body = await parseRequestBody(req);
      const { storeId, name, birthDate, phone, address, email } = body || {};
      
      if (!storeId) {
        sendErrorResponse(res, 400, '가게 ID가 필요합니다.');
        return;
      }
      
      if (!name || !name.trim()) {
        sendErrorResponse(res, 400, '엠버서더 이름은 필수입니다.');
        return;
      }
      
      // 권한 확인 (점주는 자신의 가게만 생성 가능)
      const cookies = parseCookies(req.headers.cookie || '');
      const isSuperAdmin = cookies.is_superadmin === 'true';
      const requestOwnerId = cookies.owner_id || req.headers['x-owner-id'] || null;
      
      if (!isSuperAdmin && requestOwnerId) {
        const ownerStores = await dbServices.getStoresByOwner(requestOwnerId);
        const hasAccess = ownerStores.some(store => store.id === storeId);
        if (!hasAccess) {
          sendErrorResponse(res, 403, '접근 권한이 없습니다.');
          return;
        }
      }
      
      const ambassador = await dbServices.createAmbassador(storeId, {
        name,
        birthDate,
        phone,
        address,
        email
      });
      
      sendJsonResponse(res, 201, {
        success: true,
        data: ambassador,
        message: '엠버서더가 생성되었습니다.'
      });
    } catch (error) {
      log('ERROR', '엠버서더 생성 실패', error);
      sendErrorResponse(res, 500, error.message || '엠버서더 생성에 실패했습니다.');
    }
  }
  
  // 엠버서더 수정
  async updateAmbassador(req, res, parsedUrl) {
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const parts = parsedUrl.pathname.split('/');
      const ambassadorId = parseInt(parts[parts.length - 1], 10);
      
      if (!ambassadorId || isNaN(ambassadorId)) {
        sendErrorResponse(res, 400, '엠버서더 ID가 필요합니다.');
        return;
      }
      
      const body = await parseRequestBody(req);
      const { name, birthDate, phone, address, email, status } = body || {};
      
      // 권한 확인 (점주는 자신의 가게 엠버서더만 수정 가능)
      const cookies = parseCookies(req.headers.cookie || '');
      const isSuperAdmin = cookies.is_superadmin === 'true';
      const requestOwnerId = cookies.owner_id || req.headers['x-owner-id'] || null;
      
      if (!isSuperAdmin && requestOwnerId) {
        // 엠버서더의 가게 ID 확인
        const ambassadorStoreId = await dbServices.getAmbassadorStoreId(ambassadorId);
        if (!ambassadorStoreId) {
          sendErrorResponse(res, 404, '엠버서더를 찾을 수 없습니다.');
          return;
        }
        
        const ownerStores = await dbServices.getStoresByOwner(requestOwnerId);
        const hasAccess = ownerStores.some(store => store.id === ambassadorStoreId);
        if (!hasAccess) {
          sendErrorResponse(res, 403, '접근 권한이 없습니다.');
          return;
        }
      }
      
      const ambassador = await dbServices.updateAmbassador(ambassadorId, {
        name,
        birthDate,
        phone,
        address,
        email,
        status
      });
      
      sendJsonResponse(res, 200, {
        success: true,
        data: ambassador,
        message: '엠버서더 정보가 수정되었습니다.'
      });
    } catch (error) {
      log('ERROR', '엠버서더 수정 실패', error);
      sendErrorResponse(res, 500, error.message || '엠버서더 수정에 실패했습니다.');
    }
  }
  
  // 엠버서더 삭제
  async deleteAmbassador(req, res, parsedUrl) {
    if (this.dbConnected && !this.dbConnected()) {
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const parts = parsedUrl.pathname.split('/');
      const ambassadorId = parseInt(parts[parts.length - 1], 10);
      
      if (!ambassadorId || isNaN(ambassadorId)) {
        sendErrorResponse(res, 400, '엠버서더 ID가 필요합니다.');
        return;
      }
      
      // 권한 확인 (점주는 자신의 가게 엠버서더만 삭제 가능)
      const cookies = parseCookies(req.headers.cookie || '');
      const isSuperAdmin = cookies.is_superadmin === 'true';
      const requestOwnerId = cookies.owner_id || req.headers['x-owner-id'] || null;
      
      if (!isSuperAdmin && requestOwnerId) {
        // 엠버서더의 가게 ID 확인
        const ambassadorStoreId = await dbServices.getAmbassadorStoreId(ambassadorId);
        if (!ambassadorStoreId) {
          sendErrorResponse(res, 404, '엠버서더를 찾을 수 없습니다.');
          return;
        }
        
        const ownerStores = await dbServices.getStoresByOwner(requestOwnerId);
        const hasAccess = ownerStores.some(store => store.id === ambassadorStoreId);
        if (!hasAccess) {
          sendErrorResponse(res, 403, '접근 권한이 없습니다.');
          return;
        }
      }
      
      await dbServices.deleteAmbassador(ambassadorId);
      
      sendJsonResponse(res, 200, {
        success: true,
        message: '엠버서더가 삭제되었습니다.'
      });
    } catch (error) {
      log('ERROR', '엠버서더 삭제 실패', error);
      sendErrorResponse(res, 500, error.message || '엠버서더 삭제에 실패했습니다.');
    }
  }
  
  // 엠버서더 방문 기록
  async logAmbassadorVisit(req, res, parsedUrl) {
    log('INFO', '엠버서더 방문 기록 API 호출됨', { method: req.method, url: req.url });
    
    if (this.dbConnected && !this.dbConnected()) {
      log('ERROR', '데이터베이스 연결 실패');
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const body = await parseRequestBody(req);
      log('INFO', '방문 기록 요청 본문 파싱 완료', { body: body ? { ...body, visitorPhone: body.visitorPhone ? body.visitorPhone.substring(0, 3) + '****' : null } : null });
      
      const { ambassadorId, storeId, visitorPhone } = body || {};
      
      log('INFO', '방문 기록 파라미터 확인', { 
        ambassadorId, 
        storeId, 
        hasVisitorPhone: !!visitorPhone,
        visitorPhoneLength: visitorPhone ? visitorPhone.length : 0
      });
      
      if (!ambassadorId || !storeId || !visitorPhone) {
        log('ERROR', '방문 기록 필수 정보 누락', { ambassadorId, storeId, hasVisitorPhone: !!visitorPhone });
        sendErrorResponse(res, 400, '필수 정보가 누락되었습니다.');
        return;
      }
      
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                       req.connection?.remoteAddress || 
                       req.socket?.remoteAddress || 
                       '';
      
      log('INFO', '방문 기록 DB 저장 시작', { 
        ambassadorId, 
        storeId, 
        visitorPhone: visitorPhone.substring(0, 3) + '****',
        hasUserAgent: !!userAgent,
        hasIpAddress: !!ipAddress
      });
      
      const result = await dbServices.logAmbassadorVisit(ambassadorId, storeId, visitorPhone, userAgent, ipAddress);
      
      log('INFO', '방문 기록 DB 저장 성공', { resultId: result?.id });
      
      sendJsonResponse(res, 201, {
        success: true,
        message: '방문 기록이 저장되었습니다.'
      });
    } catch (error) {
      log('ERROR', '엠버서더 방문 기록 실패', { 
        error: error.message, 
        stack: error.stack,
        body: req.body
      });
      sendErrorResponse(res, 500, error.message || '방문 기록 저장에 실패했습니다.');
    }
  }
  
  // 엠버서더 전화 연결 기록
  async logAmbassadorCall(req, res, parsedUrl) {
    log('INFO', '엠버서더 전화 연결 기록 API 호출됨', { method: req.method, url: req.url });
    
    if (this.dbConnected && !this.dbConnected()) {
      log('ERROR', '데이터베이스 연결 실패');
      sendErrorResponse(res, 503, '데이터베이스 연결이 실패했습니다.');
      return;
    }
    
    try {
      const body = await parseRequestBody(req);
      log('INFO', '전화 연결 기록 요청 본문 파싱 완료', { body: body ? { ...body, callerPhone: body.callerPhone ? body.callerPhone.substring(0, 3) + '****' : null } : null });
      
      const { ambassadorId, storeId, callerPhone } = body || {};
      
      log('INFO', '전화 연결 기록 파라미터 확인', { 
        ambassadorId, 
        storeId, 
        hasCallerPhone: !!callerPhone,
        callerPhoneLength: callerPhone ? callerPhone.length : 0
      });
      
      if (!ambassadorId || !storeId || !callerPhone) {
        log('ERROR', '전화 연결 기록 필수 정보 누락', { ambassadorId, storeId, hasCallerPhone: !!callerPhone });
        sendErrorResponse(res, 400, '필수 정보가 누락되었습니다.');
        return;
      }
      
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                       req.connection?.remoteAddress || 
                       req.socket?.remoteAddress || 
                       '';
      
      log('INFO', '전화 연결 기록 DB 저장 시작', { 
        ambassadorId, 
        storeId, 
        callerPhone: callerPhone.substring(0, 3) + '****',
        hasUserAgent: !!userAgent,
        hasIpAddress: !!ipAddress
      });
      
      const result = await dbServices.logAmbassadorCall(ambassadorId, storeId, callerPhone, userAgent, ipAddress);
      
      log('INFO', '전화 연결 기록 DB 저장 성공', { resultId: result?.id });
      
      sendJsonResponse(res, 201, {
        success: true,
        message: '전화 연결 기록이 저장되었습니다.'
      });
    } catch (error) {
      log('ERROR', '엠버서더 전화 연결 기록 실패', { 
        error: error.message, 
        stack: error.stack,
        body: req.body
      });
      sendErrorResponse(res, 500, error.message || '전화 연결 기록 저장에 실패했습니다.');
    }
  }

  async deleteOwnerAccountHandler(ownerId, req, res, parsedUrl) {
    try {
      const result = await dbServices.deleteOwnerAccount(ownerId);
      sendJsonResponse(res, 200, {
        success: true,
        result,
        message: '계정이 삭제되었습니다.'
      });
    } catch (error) {
      log('ERROR', '점주 계정 삭제 실패', error);
      sendErrorResponse(res, 500, error.message || '계정 삭제에 실패했습니다.');
    }
  }
 }
 
(async () => {
  if (require.main !== module) {
    return;
  }

  // DB 연결 상태 플래그
  let dbConnected = false;
  let dbConnectionAttempts = 0;
  const MAX_DB_RETRY_ATTEMPTS = 5;
  const DB_RETRY_INTERVAL = 30000; // 30초

  // DB 연결 시도 함수
  async function attemptDbConnection() {
    try {
      await db.connect();
      dbConnected = true;
      dbConnectionAttempts = 0;
      log('INFO', 'PostgreSQL 데이터베이스 연결이 완료되었습니다.');
      return true;
    } catch (error) {
      dbConnected = false;
      dbConnectionAttempts++;
      const errorMessage = error.message || '알 수 없는 오류';
      
      // 데이터 전송 할당량 초과 에러인 경우 특별 처리
      if (errorMessage.includes('data transfer quota') || errorMessage.includes('exceeded')) {
        log('ERROR', 'PostgreSQL 데이터베이스 연결 실패: 데이터 전송 할당량 초과', { 
          error: errorMessage,
          hint: 'Neon DB 플랜을 업그레이드하거나 할당량이 리셋될 때까지 대기하세요.'
        });
      } else {
        log('ERROR', 'PostgreSQL 데이터베이스 연결에 실패했습니다.', { error: errorMessage });
      }
      
      // 최대 재시도 횟수 초과 시에도 서버는 계속 실행
      if (dbConnectionAttempts >= MAX_DB_RETRY_ATTEMPTS) {
        log('WARN', `DB 연결 재시도 횟수 초과 (${MAX_DB_RETRY_ATTEMPTS}회). 백그라운드 재연결을 계속 시도합니다.`);
      }
      
      return false;
    }
  }

  // 초기 DB 연결 시도
  await attemptDbConnection();

  // 백그라운드 재연결 로직 (연결이 실패한 경우에만)
  let reconnectTimer = null;
  function scheduleReconnect(immediate = false) {
    if (dbConnected) {
      return; // 이미 연결되어 있으면 재연결 불필요
    }
    
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    const delay = immediate ? 0 : DB_RETRY_INTERVAL;
    
    reconnectTimer = setTimeout(async () => {
      log('INFO', 'DB 재연결 시도 중...');
      const connected = await attemptDbConnection();
      if (!connected) {
        scheduleReconnect(); // 실패 시 다시 스케줄링
      } else {
        log('INFO', '✅ DB 재연결 성공! 서비스가 정상적으로 작동합니다.');
      }
    }, delay);
  }

  // 연결 실패 시 백그라운드 재연결 시작 (즉시 시도)
  if (!dbConnected) {
    scheduleReconnect(true); // 즉시 재연결 시도
  }
  
  // 주기적 연결 상태 확인 및 재연결 (5분마다)
  setInterval(async () => {
    if (!dbConnected) {
      log('INFO', '주기적 DB 연결 상태 확인 중...');
      const connected = await attemptDbConnection();
      if (connected) {
        log('INFO', '✅ 주기적 확인: DB 재연결 성공!');
      }
    }
  }, 5 * 60 * 1000); // 5분마다

  const router = new APIRouter();
  
  // DB 연결 상태를 라우터에 주입 (API 핸들러에서 사용 가능하도록)
  router.dbConnected = () => dbConnected;
  
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

  const gracefulShutdown = async signal => {
    log('INFO', `${signal} 신호 수신, 서버 종료를 준비합니다.`);
    
    // 재연결 타이머 정리
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    
    server.close(async () => {
      try {
        if (dbConnected) {
          await db.disconnect();
        }
      } catch (error) {
        log('ERROR', '데이터베이스 연결 해제 중 오류가 발생했습니다.', { error: error.message });
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  server.listen(PORT, async () => {
    log('INFO', `API 서버가 포트 ${PORT}에서 실행 중입니다.`);
    if (!dbConnected) {
      log('WARN', '⚠️ DB 연결이 실패했지만 서버는 계속 실행됩니다. DB가 필요한 API는 에러를 반환합니다.');
    } else {
      // 서버 기동 시 store_settings 전체를 메모리에 로드 (성능 최적화)
      try {
        await dbServices.loadAllStoreSettingsToMemory();
      } catch (error) {
        log('WARN', '⚠️ store_settings 메모리 캐시 로드 실패 (계속 진행)', { error: error.message });
      }
      
      // 서버 기동 시 엠버서더 테이블 생성
      try {
        await dbServices.ensureAmbassadorTables();
      } catch (error) {
        log('WARN', '⚠️ 엠버서더 테이블 생성 실패 (계속 진행)', { error: error.message });
      }
    }
  });
})();

 module.exports = APIRouter;
