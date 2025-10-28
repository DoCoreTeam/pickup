/**
 * API 관련 타입 정의
 * 기존 API와 100% 호환되는 타입들
 * 
 * @author DOCORE
 */

// 슈퍼어드민 타입
export interface SuperAdmin {
  username: string;
  password: string;
  createdAt: string;
  lastModified: string;
}

// 가게 타입
export interface Store {
  id: string;
  name: string;
  subtitle?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'paused';
  subdomain?: string;
  subdomainStatus?: string;
  order?: number;
  createdAt: string;
  lastModified: string;
  pausedAt?: string;
}

// 가게 설정 타입
export interface StoreSettings {
  basic?: {
    storeName?: string;
    storeSubtitle?: string;
    storePhone?: string;
    storeAddress?: string;
  };
  discount?: {
    enabled?: boolean;
    title?: string;
    description?: string;
  };
  delivery?: {
    ttaengUrl?: string;
    baeminUrl?: string;
    coupangUrl?: string;
    yogiyoUrl?: string;
    deliveryOrder?: string[];
  };
  pickup?: {
    enabled?: boolean;
    title?: string;
    description?: string;
  };
  images?: {
    mainLogo?: string;
    menuImage?: string;
  };
  businessHours?: {
    [key: string]: {
      enabled: boolean;
      open: string;
      close: string;
    };
  };
  sectionOrder?: Array<{
    id: string;
    title: string;
    icon: string;
    description: string;
  }>;
  qrCode?: {
    url?: string;
    filepath?: string;
    createdAt?: string;
  };
}

// 활동 로그 타입
export interface ActivityLog {
  id: string;
  type: string;
  action: string;
  description?: string;
  userId?: string;
  userName?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: any;
  timestamp: string;
}

// 릴리즈 노트 타입
export interface ReleaseNote {
  version: string;
  codename?: string;
  releaseDate: string;
  title: string;
  highlights?: string[];
  features?: any[];
  bugFixes?: any[];
  technicalImprovements?: any[];
}

// API 응답 타입
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  message?: string;
}

// 페이지네이션 타입
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// 활동 로그 응답 타입
export interface ActivityLogsResponse {
  success: boolean;
  logs: ActivityLog[];
  pagination: Pagination;
}

// 릴리즈 노트 응답 타입
export interface ReleaseNotesResponse {
  success: boolean;
  releaseNotes: ReleaseNote[];
}

// 서브도메인 체크 응답 타입
export interface SubdomainCheckResponse {
  available: boolean;
  message: string;
}

// QR 코드 생성 요청 타입
export interface QRCodeGenerateRequest {
  storeId: string;
  logoPath?: string;
  size?: number;
}

// QR 코드 생성 응답 타입
export interface QRCodeGenerateResponse {
  success: boolean;
  qrCodeUrl?: string;
  filepath?: string;
}

// AI 콘텐츠 생성 요청 타입
export interface AIContentGenerateRequest {
  storeName: string;
  existingExamples?: any[];
}

// AI 콘텐츠 생성 응답 타입
export interface AIContentGenerateResponse {
  success: boolean;
  content?: any;
}
