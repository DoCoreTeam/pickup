/**
 * 캐시 서비스
 * Upstash Redis를 사용한 read-through 캐시
 * 
 * @author DOCORE
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { createLogger } from '@pickup/shared';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = createLogger('cache-service');
  private redis: Redis | null = null;
  private isEnabled = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get('REDIS_URL');
    
    if (redisUrl) {
      try {
        this.redis = new Redis({ url: redisUrl });
        this.isEnabled = true;
        this.logger.log('✅ Redis 캐시 서비스 초기화 완료');
      } catch (error) {
        this.logger.warn('Redis 연결 실패, 캐시 비활성화', error);
        this.isEnabled = false;
      }
    } else {
      this.logger.info('Redis URL이 설정되지 않음, 캐시 비활성화');
    }
  }

  /**
   * 캐시에서 데이터 조회
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled || !this.redis) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      if (value) {
        this.logger.debug(`Cache hit: ${key}`);
        return value as T;
      }
      this.logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * 캐시에 데이터 저장
   */
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
    if (!this.isEnabled || !this.redis) {
      return false;
    }

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      this.logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * 캐시에서 데이터 삭제
   */
  async del(key: string): Promise<boolean> {
    if (!this.isEnabled || !this.redis) {
      return false;
    }

    try {
      await this.redis.del(key);
      this.logger.debug(`Cache delete: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * 패턴으로 캐시 키 삭제
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.isEnabled || !this.redis) {
      return 0;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(`Cache delete pattern: ${pattern} (${keys.length} keys)`);
        return keys.length;
      }
      return 0;
    } catch (error) {
      this.logger.error(`Cache delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Read-through 캐시 패턴
   * 캐시에 없으면 데이터베이스에서 조회 후 캐시에 저장
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    // 캐시에서 조회 시도
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 캐시에 없으면 데이터베이스에서 조회
    const data = await fetchFn();
    
    // 캐시에 저장 (비동기, 실패해도 데이터는 반환)
    this.set(key, data, ttlSeconds).catch(error => {
      this.logger.warn(`Failed to cache data for key ${key}:`, error);
    });

    return data;
  }

  /**
   * 캐시 상태 확인
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isEnabled || !this.redis) {
      return false;
    }

    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * 캐시 통계 조회
   */
  async getStats(): Promise<{
    enabled: boolean;
    connected: boolean;
    memoryUsage?: string;
    keyCount?: number;
  }> {
    const stats = {
      enabled: this.isEnabled,
      connected: false,
    };

    if (this.isEnabled && this.redis) {
      try {
        stats.connected = await this.isHealthy();
        
        // Redis INFO 명령으로 메모리 사용량 조회
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
        if (memoryMatch) {
          stats.memoryUsage = memoryMatch[1];
        }

        // 키 개수 조회
        const keys = await this.redis.keys('*');
        stats.keyCount = keys.length;
      } catch (error) {
        this.logger.error('Failed to get cache stats:', error);
      }
    }

    return stats;
  }
}
