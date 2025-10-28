/**
 * Rate Limiting 설정
 * express-rate-limit을 사용한 요청 제한
 * 
 * @author DOCORE
 */

import { ConfigService } from '@nestjs/config';
import rateLimit from 'express-rate-limit';
import { createLogger } from '@pickup/shared';

const logger = createLogger('rate-limit');

export function createRateLimit(configService: ConfigService) {
  const windowMs = configService.get('RATE_LIMIT_WINDOW_MS', 900000); // 15분
  const max = configService.get('RATE_LIMIT_MAX', 100); // 최대 100 요청

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    // 프록시 헤더 고려
    trustProxy: true,
    // IP별로 제한
    keyGenerator: (req) => {
      // X-Forwarded-For 헤더에서 실제 IP 추출
      const forwarded = req.headers['x-forwarded-for'];
      const ip = forwarded ? forwarded.toString().split(',')[0].trim() : req.ip;
      return ip;
    },
    // 헬스체크는 제외
    skip: (req) => {
      return req.url === '/healthz' || req.url === '/api/healthz';
    },
    // 로깅
    onLimitReached: (req) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, URL: ${req.url}`);
    },
  });
}

// 엄격한 Rate Limiting (API 키 생성 등)
export function createStrictRateLimit(configService: ConfigService) {
  const windowMs = 60000; // 1분
  const max = 5; // 최대 5 요청

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        code: 'STRICT_RATE_LIMIT_EXCEEDED',
        message: '요청이 너무 빈번합니다. 1분 후 다시 시도해주세요.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = forwarded ? forwarded.toString().split(',')[0].trim() : req.ip;
      return ip;
    },
    onLimitReached: (req) => {
      logger.warn(`Strict rate limit exceeded for IP: ${req.ip}, URL: ${req.url}`);
    },
  });
}
