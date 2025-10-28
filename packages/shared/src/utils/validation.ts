/**
 * 유효성 검사 유틸리티
 * Zod를 사용한 스키마 검증
 * 
 * @author DOCORE
 */

import { z } from 'zod';

// 가게 생성 스키마
export const CreateStoreSchema = z.object({
  name: z.string().min(1, '가게명은 필수입니다'),
  subtitle: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

// 가게 업데이트 스키마
export const UpdateStoreSchema = z.object({
  name: z.string().min(1, '가게명은 필수입니다').optional(),
  subtitle: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
  order: z.number().int().min(0).optional(),
});

// 가게 설정 스키마
export const StoreSettingsSchema = z.object({
  basic: z.object({
    storeName: z.string().optional(),
    storeSubtitle: z.string().optional(),
    storePhone: z.string().optional(),
    storeAddress: z.string().optional(),
  }).optional(),
  discount: z.object({
    enabled: z.boolean().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  delivery: z.object({
    ttaengUrl: z.string().url().optional().or(z.literal('')),
    baeminUrl: z.string().url().optional().or(z.literal('')),
    coupangUrl: z.string().url().optional().or(z.literal('')),
    yogiyoUrl: z.string().url().optional().or(z.literal('')),
    deliveryOrder: z.array(z.string()).optional(),
  }).optional(),
  pickup: z.object({
    enabled: z.boolean().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  images: z.object({
    mainLogo: z.string().optional(),
    menuImage: z.string().optional(),
  }).optional(),
  businessHours: z.record(z.object({
    enabled: z.boolean(),
    open: z.string(),
    close: z.string(),
  })).optional(),
  sectionOrder: z.array(z.object({
    id: z.string(),
    title: z.string(),
    icon: z.string(),
    description: z.string(),
  })).optional(),
  qrCode: z.object({
    url: z.string().optional(),
    filepath: z.string().optional(),
    createdAt: z.string().optional(),
  }).optional(),
});

// 활동 로그 생성 스키마
export const CreateActivityLogSchema = z.object({
  type: z.string().min(1, '타입은 필수입니다'),
  action: z.string().min(1, '액션은 필수입니다'),
  description: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  details: z.any().optional(),
  timestamp: z.string().datetime().optional(),
});

// 슈퍼어드민 업데이트 스키마
export const UpdateSuperAdminSchema = z.object({
  username: z.string().min(1, '사용자명은 필수입니다').optional(),
  password: z.string().min(1, '비밀번호는 필수입니다').optional(),
});

// 서브도메인 체크 스키마
export const SubdomainCheckSchema = z.object({
  subdomain: z.string()
    .min(1, '서브도메인은 필수입니다')
    .regex(/^[a-z0-9-]+$/, '서브도메인은 소문자, 숫자, 하이픈만 사용 가능합니다')
    .max(63, '서브도메인은 63자 이하여야 합니다'),
});

// QR 코드 생성 스키마
export const QRCodeGenerateSchema = z.object({
  storeId: z.string().min(1, '가게 ID는 필수입니다'),
  logoPath: z.string().optional(),
  size: z.number().int().min(100).max(2048).optional(),
});

// AI 콘텐츠 생성 스키마
export const AIContentGenerateSchema = z.object({
  storeName: z.string().min(1, '가게명은 필수입니다'),
  existingExamples: z.array(z.any()).optional(),
});

// 페이지네이션 스키마
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
});

// 유효성 검사 헬퍼 함수
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(`유효성 검사 실패: ${errorMessage}`);
    }
    throw error;
  }
}

// 안전한 유효성 검사 (에러 발생하지 않음)
export function safeValidateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return { success: false, error: errorMessage };
    }
    return { success: false, error: '알 수 없는 유효성 검사 오류' };
  }
}
