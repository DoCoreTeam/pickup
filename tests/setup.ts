/**
 * Jest 테스트 설정
 * 전역 테스트 설정 및 모킹
 * 
 * @author DOCORE
 */

// 환경변수 설정
process.env.NODE_ENV = 'test';
process.env.DATA_BACKEND = 'json';
process.env.DUAL_WRITE = 'false';

// 글로벌 타임아웃 설정
jest.setTimeout(10000);

// 콘솔 에러 무시 (테스트 중 불필요한 에러 로그 방지)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
