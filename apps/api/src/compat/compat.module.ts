/**
 * 기존 API 호환 레이어 모듈
 * route-manifest.json의 각 엔드포인트를 1:1 대응
 * 
 * @author DOCORE
 */

import { Module } from '@nestjs/common';
import { CompatController } from './compat.controller';
import { CompatService } from './compat.service';

@Module({
  controllers: [CompatController],
  providers: [CompatService],
})
export class CompatModule {}
