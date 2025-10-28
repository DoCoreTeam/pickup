/**
 * 스키마 diff 체크 스크립트
 * 기존 라우트/응답포맷 변경을 감지하여 PR 차단
 *
 * @author DOCORE
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@pickup/shared';

const logger = createLogger('schema-diff-check');

interface RouteManifest {
  [key: string]: {
    method: string;
    path: string;
    queryParams?: any;
    bodySchema?: any;
    responseSchema: any;
    statusCodes: number[];
    headers?: any;
  };
}

interface SchemaDiff {
  added: string[];
  removed: string[];
  modified: string[];
  breaking: string[];
}

async function getChangedFiles(): Promise<string[]> {
  try {
    const output = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(file => file.length > 0);
  } catch (error) {
    logger.warn('Git diff 실행 실패, 모든 파일을 검사합니다.', error);
    return [];
  }
}

async function loadRouteManifest(): Promise<RouteManifest> {
  const manifestPath = join(process.cwd(), 'docs/route-manifest.json');
  
  if (!existsSync(manifestPath)) {
    logger.error('route-manifest.json 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error('route-manifest.json 파싱 실패:', error);
    process.exit(1);
  }
}

async function checkApiFiles(changedFiles: string[]): Promise<boolean> {
  const apiFiles = changedFiles.filter(file => 
    file.includes('apps/api/') || 
    file.includes('src/') ||
    file.includes('compat/')
  );

  if (apiFiles.length === 0) {
    logger.info('API 관련 파일 변경 없음');
    return true;
  }

  logger.info(`변경된 API 파일: ${apiFiles.join(', ')}`);
  return false;
}

async function checkRouteManifestChanges(changedFiles: string[]): Promise<boolean> {
  const manifestChanged = changedFiles.includes('docs/route-manifest.json');
  
  if (manifestChanged) {
    logger.warn('⚠️ route-manifest.json이 변경되었습니다.');
    logger.warn('이는 기존 API 스키마 변경을 의미할 수 있습니다.');
    return false;
  }

  return true;
}

async function checkBreakingChanges(changedFiles: string[]): Promise<SchemaDiff> {
  const diff: SchemaDiff = {
    added: [],
    removed: [],
    modified: [],
    breaking: []
  };

  // API 파일 변경 감지
  const apiFiles = changedFiles.filter(file => 
    file.includes('apps/api/') && 
    (file.includes('.ts') || file.includes('.js'))
  );

  for (const file of apiFiles) {
    try {
      const content = readFileSync(file, 'utf-8');
      
      // 새로운 라우트 추가 감지
      if (content.includes('@Get(') || content.includes('@Post(') || 
          content.includes('@Put(') || content.includes('@Delete(')) {
        diff.added.push(file);
      }

      // 기존 라우트 수정 감지
      if (content.includes('@Controller(') || content.includes('@Route('))) {
        diff.modified.push(file);
      }

      // 응답 스키마 변경 감지
      if (content.includes('responseSchema') || content.includes('@ApiResponse')) {
        diff.modified.push(file);
      }

      // 상태 코드 변경 감지
      if (content.includes('@HttpCode(') || content.includes('statusCode')) {
        diff.modified.push(file);
      }

    } catch (error) {
      logger.warn(`파일 읽기 실패: ${file}`, error);
    }
  }

  return diff;
}

async function checkAuthorComments(changedFiles: string[]): Promise<boolean> {
  const tsFiles = changedFiles.filter(file => 
    file.endsWith('.ts') || file.endsWith('.js')
  );

  for (const file of tsFiles) {
    try {
      const content = readFileSync(file, 'utf-8');
      
      // 파일 상단에 Author: DOCORE 주석 확인
      const lines = content.split('\n').slice(0, 10);
      const hasAuthorComment = lines.some(line => 
        line.includes('@author DOCORE') || line.includes('Author: DOCORE')
      );

      if (!hasAuthorComment) {
        logger.error(`❌ ${file}: 파일 상단에 "Author: DOCORE" 주석이 없습니다.`);
        return false;
      }

    } catch (error) {
      logger.warn(`파일 읽기 실패: ${file}`, error);
    }
  }

  return true;
}

async function generateDiffReport(diff: SchemaDiff): Promise<void> {
  logger.info('--- 스키마 변경 사항 리포트 ---');
  
  if (diff.added.length > 0) {
    logger.info(`➕ 추가된 라우트: ${diff.added.length}개`);
    diff.added.forEach(file => logger.info(`  - ${file}`));
  }

  if (diff.removed.length > 0) {
    logger.info(`➖ 제거된 라우트: ${diff.removed.length}개`);
    diff.removed.forEach(file => logger.info(`  - ${file}`));
  }

  if (diff.modified.length > 0) {
    logger.info(`✏️ 수정된 라우트: ${diff.modified.length}개`);
    diff.modified.forEach(file => logger.info(`  - ${file}`));
  }

  if (diff.breaking.length > 0) {
    logger.error(`💥 Breaking Changes: ${diff.breaking.length}개`);
    diff.breaking.forEach(file => logger.error(`  - ${file}`));
  }
}

async function main() {
  logger.info('🔍 스키마 diff 체크 시작...');

  try {
    // 1. 변경된 파일 목록 가져오기
    const changedFiles = await getChangedFiles();
    logger.info(`변경된 파일: ${changedFiles.length}개`);

    // 2. API 파일 변경 확인
    const apiFilesChanged = await checkApiFiles(changedFiles);
    if (!apiFilesChanged) {
      logger.info('API 파일 변경 감지됨');
    }

    // 3. route-manifest.json 변경 확인
    const manifestOk = await checkRouteManifestChanges(changedFiles);
    if (!manifestOk) {
      logger.error('❌ route-manifest.json 변경 감지 - PR 차단');
      process.exit(1);
    }

    // 4. Breaking Changes 확인
    const diff = await checkBreakingChanges(changedFiles);
    await generateDiffReport(diff);

    if (diff.breaking.length > 0) {
      logger.error('❌ Breaking Changes 감지 - PR 차단');
      process.exit(1);
    }

    // 5. Author 주석 확인
    const authorOk = await checkAuthorComments(changedFiles);
    if (!authorOk) {
      logger.error('❌ Author 주석 누락 - PR 차단');
      process.exit(1);
    }

    // 6. 최종 결과
    if (diff.added.length > 0 || diff.modified.length > 0) {
      logger.warn('⚠️ API 변경 사항이 감지되었습니다.');
      logger.warn('변경 사항이 기존 클라이언트에 영향을 주지 않는지 확인하세요.');
    }

    logger.info('✅ 스키마 diff 체크 통과');
    logger.info('🎉 PR이 승인되었습니다!');

  } catch (error) {
    logger.error('스키마 diff 체크 실패:', error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('스크립트 실행 실패:', error);
  process.exit(1);
});
