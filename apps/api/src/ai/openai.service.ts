/**
 * OpenAI 서비스
 * AI 콘텐츠 생성 및 관리
 * 
 * @author DOCORE
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createLogger } from '@pickup/shared';

const logger = createLogger('openai-service');

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다');
    }

    this.openai = new OpenAI({
      apiKey,
      timeout: 20000, // 20초 타임아웃
      maxRetries: 3, // 최대 3회 재시도
    });

    this.logger.log('OpenAI 서비스 초기화 완료');
  }

  /**
   * 채팅 완성 요청 (재시도 및 타임아웃 포함)
   */
  async chatCompletion(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options?: OpenAI.Chat.Completions.ChatCompletionCreateParams) {
    try {
      const startTime = Date.now();
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 1000,
        temperature: 0.7,
        ...options,
      });

      const duration = Date.now() - startTime;
      
      // PII/토큰 로깅 금지 (마스킹)
      logger.info('OpenAI 요청 완료', {
        duration: `${duration}ms`,
        model: options?.model || 'gpt-3.5-turbo',
        tokens: response.usage?.total_tokens || 0,
        requestId: response.id,
      });

      return response;
    } catch (error) {
      logger.error('OpenAI 요청 실패', {
        error: error.message,
        type: error.constructor.name,
      });
      throw error;
    }
  }

  /**
   * 메뉴 설명 생성
   */
  async generateMenuDescription(menuName: string, ingredients?: string[]): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '당신은 음식점 메뉴 설명을 작성하는 전문가입니다. 매력적이고 간결한 설명을 작성해주세요.',
      },
      {
        role: 'user',
        content: `메뉴명: ${menuName}${ingredients ? `\n재료: ${ingredients.join(', ')}` : ''}\n\n이 메뉴에 대한 매력적인 설명을 작성해주세요.`,
      },
    ];

    try {
      const response = await this.chatCompletion(messages);
      return response.choices[0]?.message?.content || '메뉴 설명을 생성할 수 없습니다.';
    } catch (error) {
      logger.error('메뉴 설명 생성 실패', error);
      throw new Error('메뉴 설명 생성에 실패했습니다.');
    }
  }

  /**
   * 할인 메시지 생성
   */
  async generateDiscountMessage(discountRate: number, menuName?: string): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '당신은 음식점 할인 이벤트 메시지를 작성하는 전문가입니다. 고객의 관심을 끌 수 있는 매력적인 메시지를 작성해주세요.',
      },
      {
        role: 'user',
        content: `할인율: ${discountRate}%${menuName ? `\n메뉴: ${menuName}` : ''}\n\n이 할인 이벤트에 대한 매력적인 메시지를 작성해주세요.`,
      },
    ];

    try {
      const response = await this.chatCompletion(messages);
      return response.choices[0]?.message?.content || '할인 메시지를 생성할 수 없습니다.';
    } catch (error) {
      logger.error('할인 메시지 생성 실패', error);
      throw new Error('할인 메시지 생성에 실패했습니다.');
    }
  }

  /**
   * 고객 피드백 분석
   */
  async analyzeCustomerFeedback(feedbackText: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    summary: string;
    suggestions: string[];
  }> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '당신은 고객 피드백을 분석하는 전문가입니다. 감정, 요약, 개선 제안을 제공해주세요.',
      },
      {
        role: 'user',
        content: `고객 피드백: ${feedbackText}\n\n이 피드백을 분석하여 감정(positive/negative/neutral), 요약, 개선 제안을 JSON 형태로 제공해주세요.`,
      },
    ];

    try {
      const response = await this.chatCompletion(messages);
      const content = response.choices[0]?.message?.content || '{}';
      
      try {
        return JSON.parse(content);
      } catch (parseError) {
        logger.warn('JSON 파싱 실패, 기본값 반환', { content });
        return {
          sentiment: 'neutral',
          summary: '피드백을 분석할 수 없습니다.',
          suggestions: ['고객과 직접 소통해보세요.'],
        };
      }
    } catch (error) {
      logger.error('고객 피드백 분석 실패', error);
      throw new Error('고객 피드백 분석에 실패했습니다.');
    }
  }

  /**
   * 픽업 안내 생성
   */
  async generatePickupInstructions(storeAddress: string, specialNotes?: string): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '당신은 음식점 픽업 안내를 작성하는 전문가입니다. 고객이 쉽게 이해할 수 있는 명확한 안내를 작성해주세요.',
      },
      {
        role: 'user',
        content: `가게 주소: ${storeAddress}${specialNotes ? `\n특별 안내: ${specialNotes}` : ''}\n\n픽업 안내를 작성해주세요.`,
      },
    ];

    try {
      const response = await this.chatCompletion(messages);
      return response.choices[0]?.message?.content || '픽업 안내를 생성할 수 없습니다.';
    } catch (error) {
      logger.error('픽업 안내 생성 실패', error);
      throw new Error('픽업 안내 생성에 실패했습니다.');
    }
  }
}
