/**
 * 서킷 브레이커 서비스
 * OpenAI 호출 등 외부 API 호출에 대한 장애 격리
 * 
 * @author DOCORE
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@pickup/shared';

interface CircuitBreakerOptions {
  timeout: number;
  errorThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = createLogger('circuit-breaker');
  private breakers: Map<string, CircuitBreakerState> = new Map();

  constructor(private configService: ConfigService) {}

  /**
   * 서킷 브레이커로 함수 실행
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options: Partial<CircuitBreakerOptions> = {}
  ): Promise<T> {
    const opts: CircuitBreakerOptions = {
      timeout: options.timeout || 20000, // 20초
      errorThreshold: options.errorThreshold || 5, // 5회 실패
      resetTimeout: options.resetTimeout || 60000, // 1분
      monitoringPeriod: options.monitoringPeriod || 300000, // 5분
    };

    const breaker = this.getOrCreateBreaker(key, opts);
    
    // OPEN 상태이고 아직 재시도 시간이 안 됐으면 에러 반환
    if (breaker.state === 'OPEN' && Date.now() < breaker.nextAttemptTime) {
      this.logger.warn(`Circuit breaker OPEN for ${key}, rejecting request`);
      throw new Error(`Circuit breaker is OPEN for ${key}`);
    }

    // HALF_OPEN 상태로 전환
    if (breaker.state === 'OPEN' && Date.now() >= breaker.nextAttemptTime) {
      breaker.state = 'HALF_OPEN';
      this.logger.info(`Circuit breaker HALF_OPEN for ${key}, allowing one request`);
    }

    try {
      // 타임아웃 설정
      const result = await this.withTimeout(fn(), opts.timeout);
      
      // 성공 시 브레이커 리셋
      this.onSuccess(breaker, opts);
      
      return result;
    } catch (error) {
      // 실패 시 브레이커 상태 업데이트
      this.onFailure(breaker, opts);
      
      this.logger.error(`Circuit breaker failure for ${key}:`, error);
      throw error;
    }
  }

  /**
   * 브레이커 상태 조회
   */
  getState(key: string): CircuitBreakerState | null {
    return this.breakers.get(key) || null;
  }

  /**
   * 브레이커 리셋
   */
  reset(key: string): void {
    this.breakers.delete(key);
    this.logger.info(`Circuit breaker reset for ${key}`);
  }

  /**
   * 모든 브레이커 상태 조회
   */
  getAllStates(): Record<string, CircuitBreakerState> {
    const states: Record<string, CircuitBreakerState> = {};
    for (const [key, state] of this.breakers.entries()) {
      states[key] = { ...state };
    }
    return states;
  }

  private getOrCreateBreaker(key: string, options: CircuitBreakerOptions): CircuitBreakerState {
    if (!this.breakers.has(key)) {
      this.breakers.set(key, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      });
    }
    return this.breakers.get(key)!;
  }

  private onSuccess(breaker: CircuitBreakerState, options: CircuitBreakerOptions): void {
    breaker.failureCount = 0;
    breaker.state = 'CLOSED';
    this.logger.debug('Circuit breaker success, state reset to CLOSED');
  }

  private onFailure(breaker: CircuitBreakerState, options: CircuitBreakerOptions): void {
    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failureCount >= options.errorThreshold) {
      breaker.state = 'OPEN';
      breaker.nextAttemptTime = Date.now() + options.resetTimeout;
      this.logger.warn(`Circuit breaker OPEN after ${breaker.failureCount} failures`);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }
}
