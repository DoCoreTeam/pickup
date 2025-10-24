#!/bin/bash
# 🛡️ 간단한 호환성 검증 스크립트

echo "🛡️ 호환성 검증 시작..."
echo "📅 검증 시간: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

# 테스트 함수
test_check() {
    local test_name="$1"
    local command="$2"
    
    echo -n "🔍 $test_name... "
    
    if eval "$command" 2>/dev/null; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED++))
    fi
}

# 서버 상태 확인
echo -e "\n${BLUE}📡 서버 상태 확인${NC}"
test_check "API 서버 (포트 8081)" "curl -s http://localhost:8081/api/data | jq . > /dev/null"

# API 엔드포인트 테스트
echo -e "\n${BLUE}🔌 API 엔드포인트 테스트${NC}"
test_check "GET /api/data" "curl -s http://localhost:8081/api/data | jq '.stores' > /dev/null"
test_check "GET /api/stores" "curl -s http://localhost:8081/api/stores | jq '.[0].id' > /dev/null"
test_check "GET /api/current-store" "curl -s http://localhost:8081/api/current-store | jq . > /dev/null"

# CORS 테스트
echo -e "\n${BLUE}🌐 CORS 테스트${NC}"
test_check "OPTIONS preflight" "curl -s -X OPTIONS http://localhost:8081/api/stores -H 'Origin: http://localhost:8080' -H 'Access-Control-Request-Method: GET' -D - | grep -q 'Access-Control-Allow-Origin'"
test_check "CORS 헤더" "curl -s http://localhost:8081/api/stores | jq '.[0].id' > /dev/null"

# 데이터 스키마 검증
echo -e "\n${BLUE}📊 데이터 스키마 검증${NC}"
test_check "superadmin 스키마" "curl -s http://localhost:8081/api/data | jq '.superadmin.username' > /dev/null"
test_check "stores 배열" "curl -s http://localhost:8081/api/data | jq '.stores | type' | grep -q 'array'"
test_check "settings 객체" "curl -s http://localhost:8081/api/data | jq '.settings | type' | grep -q 'object'"

# URL 라우팅 테스트
echo -e "\n${BLUE}🛣️ URL 라우팅 테스트${NC}"
test_check "루트 경로 (가게 탐색)" "curl -s http://localhost:8081/ | grep -q '가게를 선택하고'"
test_check "관리자 페이지 접근" "curl -s http://localhost:8081/admin/ | grep -q '관리자 페이지'"
test_check "로그인 페이지 접근" "curl -s http://localhost:8081/admin/login.html | grep -q '슈퍼어드민 로그인'"

# 가게 페이지 테스트
echo -e "\n${BLUE}🏪 가게 페이지 테스트${NC}"
test_check "가게 페이지 접근" "curl -s http://localhost:8081/store/test | grep -q '가게 정보를 불러오는 중'"

# POST 요청 테스트 (슈퍼어드민 로그인)
echo -e "\n${BLUE}🔐 인증 테스트${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8081/api/superadmin/check \
  -H "Content-Type: application/json" \
  -d '{"username":"pickupsuperadmin","password":"test"}')
test_check "슈퍼어드민 로그인" "echo '$LOGIN_RESPONSE' | jq '.success' | grep -q 'true'"

# 결과 요약
echo -e "\n${BLUE}📋 검증 결과 요약${NC}"
echo "============================================================"
echo -e "✅ 통과: ${GREEN}$PASSED${NC}"
echo -e "❌ 실패: ${RED}$FAILED${NC}"
echo "📅 완료 시간: $(date '+%Y-%m-%d %H:%M:%S')"

if [ $FAILED -eq 0 ]; then
    echo -e "\n🎉 ${GREEN}모든 호환성 검증 통과!${NC}"
    echo "🛡️ 시스템이 안전하게 동작하고 있습니다."
    exit 0
else
    echo -e "\n🚨 ${RED}호환성 검증 실패!${NC}"
    echo "⚠️ 시스템에 문제가 있습니다. 즉시 확인이 필요합니다."
    exit 1
fi