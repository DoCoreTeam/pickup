/**
 * 로깅 유틸리티
 * 구조화된 로그 출력을 위한 헬퍼 함수들
 * 
 * @author DOCORE
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogData {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
  service?: string;
  requestId?: string;
}

export class Logger {
  private service: string;
  private requestId?: string;

  constructor(service: string, requestId?: string) {
    this.service = service;
    this.requestId = requestId;
  }

  private formatLog(level: LogLevel, message: string, data?: any): LogData {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      service: this.service,
      requestId: this.requestId,
    };
  }

  debug(message: string, data?: any): void {
    const logData = this.formatLog(LogLevel.DEBUG, message, data);
    console.log(`[${logData.timestamp}] [${logData.level}] [${logData.service}] ${message}`, data || '');
  }

  info(message: string, data?: any): void {
    const logData = this.formatLog(LogLevel.INFO, message, data);
    console.log(`[${logData.timestamp}] [${logData.level}] [${logData.service}] ${message}`, data || '');
  }

  warn(message: string, data?: any): void {
    const logData = this.formatLog(LogLevel.WARN, message, data);
    console.warn(`[${logData.timestamp}] [${logData.level}] [${logData.service}] ${message}`, data || '');
  }

  error(message: string, error?: Error | any): void {
    const logData = this.formatLog(LogLevel.ERROR, message, error);
    console.error(`[${logData.timestamp}] [${logData.level}] [${logData.service}] ${message}`, error || '');
  }
}

// 기본 로거 인스턴스
export const logger = new Logger('pickup-shared');

// 서비스별 로거 생성 헬퍼
export function createLogger(service: string, requestId?: string): Logger {
  return new Logger(service, requestId);
}
