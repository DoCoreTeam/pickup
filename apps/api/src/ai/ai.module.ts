/**
 * AI 서비스 모듈
 * OpenAI API 연동 및 콘텐츠 생성
 * 
 * @author DOCORE
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIService } from './openai.service';

@Module({
  imports: [ConfigModule],
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class AiModule {}
