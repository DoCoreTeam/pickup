/**
 * 가게페이지 메인 페이지
 * 기존 가게페이지 기능을 Next.js로 마이그레이션 예정
 * 
 * @author DOCORE
 */

export default function StorePage() {
  return (
    <div className="min-h-screen bg-gray-900">
      <div className="mobile-container">
        <div className="py-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-4">
              가게 정보 로딩 중...
            </h1>
            <p className="text-lg text-gray-300 mb-8">
              Next.js 15 App Router 기반 가게페이지
            </p>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    개발 중
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      현재 기본 구조만 생성되었습니다. 
                      기존 가게페이지 기능은 다음 단계에서 마이그레이션됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="bg-white rounded-lg p-6 text-gray-900">
                <h3 className="text-lg font-semibold mb-2">
                  배달 주문
                </h3>
                <p className="text-gray-600">
                  배달앱 주문 링크
                </p>
              </div>
              
              <div className="bg-white rounded-lg p-6 text-gray-900">
                <h3 className="text-lg font-semibold mb-2">
                  할인 안내
                </h3>
                <p className="text-gray-600">
                  할인 이벤트 정보
                </p>
              </div>
              
              <div className="bg-white rounded-lg p-6 text-gray-900">
                <h3 className="text-lg font-semibold mb-2">
                  주소 정보
                </h3>
                <p className="text-gray-600">
                  가게 주소 및 지도
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
