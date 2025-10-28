/**
 * 데이터베이스 관련 타입 정의
 * Prisma 스키마와 연동되는 타입들
 * 
 * @author DOCORE
 */

// 데이터 소스 타입
export type DataSource = 'json' | 'postgres';

// 데이터 어댑터 인터페이스
export interface DataAdapter {
  // 가게 관련
  getStores(): Promise<any[]>;
  getStoreById(id: string): Promise<any | null>;
  createStore(data: any): Promise<any>;
  updateStore(id: string, data: any): Promise<any>;
  deleteStore(id: string): Promise<boolean>;
  
  // 설정 관련
  getStoreSettings(storeId: string): Promise<any | null>;
  updateStoreSettings(storeId: string, data: any): Promise<any>;
  
  // 슈퍼어드민 관련
  getSuperAdmin(): Promise<any | null>;
  updateSuperAdmin(data: any): Promise<any>;
  
  // 활동 로그 관련
  getActivityLogs(page?: number, limit?: number): Promise<{ logs: any[]; total: number }>;
  createActivityLog(data: any): Promise<any>;
  
  // 릴리즈 노트 관련
  getReleaseNotes(): Promise<any[]>;
  
  // 분석 데이터 관련
  getAnalytics(): Promise<any | null>;
  updateAnalytics(data: any): Promise<any>;
  
  // 현재 가게 ID 관련
  getCurrentStoreId(): Promise<string | null>;
  setCurrentStoreId(storeId: string | null): Promise<void>;
  
  // 서브도메인 관련
  checkSubdomainAvailability(subdomain: string): Promise<boolean>;
  getStoreBySubdomain(subdomain: string): Promise<any | null>;
}

// JSON 데이터 구조 타입
export interface JsonData {
  superadmin: {
    username: string;
    password: string;
    createdAt: string;
    lastModified: string;
  };
  stores: Array<{
    id: string;
    name: string;
    subtitle?: string;
    phone?: string;
    address?: string;
    status?: string;
    subdomain?: string;
    subdomainStatus?: string;
    order?: number;
    createdAt: string;
    lastModified: string;
    pausedAt?: string;
  }>;
  currentStoreId: string | null;
  settings: {
    [storeId: string]: any;
  };
  deliveryOrders: any;
  images: any;
}

// 환경변수 타입
export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  DATA_BACKEND: DataSource;
  DATABASE_URL?: string;
  PORT?: number;
  API_PREFIX?: string;
  JWT_SECRET?: string;
  OPENAI_API_KEY?: string;
  CORS_ORIGIN?: string;
}
