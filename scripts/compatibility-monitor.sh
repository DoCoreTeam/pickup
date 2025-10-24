#!/bin/bash
# 🔍 호환성 모니터링 스크립트
# 시스템 변경사항을 추적하고 회귀를 방지

echo "🔍 호환성 모니터링 시작..."
echo "📅 모니터링 시간: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 모니터링 결과 파일
MONITOR_FILE=".compatibility-monitor.json"
BASELINE_FILE=".compatibility-baseline.json"

# 현재 상태 캡처
capture_current_state() {
    echo -e "${BLUE}📊 현재 상태 캡처 중...${NC}"
    
    # API 상태 캡처
    API_DATA=$(curl -s http://localhost:8081/api/data 2>/dev/null || echo "{}")
    API_STORES=$(curl -s http://localhost:8081/api/stores 2>/dev/null || echo "[]")
    
    # HTTP 상태 캡처
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
    
    # 현재 상태 JSON 생성
    cat > "$MONITOR_FILE" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "api": {
    "data_endpoint": $API_DATA,
    "stores_endpoint": $API_STORES,
    "status": "ok"
  },
  "http": {
    "status_code": $HTTP_STATUS,
    "status": "ok"
  },
  "server": {
    "http_port": 8080,
    "api_port": 8081,
    "status": "running"
  }
}
EOF
    
    echo "✅ 현재 상태 캡처 완료: $MONITOR_FILE"
}

# 기준선과 비교
compare_with_baseline() {
    echo -e "${BLUE}🔍 기준선과 비교 중...${NC}"
    
    if [ ! -f "$BASELINE_FILE" ]; then
        echo -e "${YELLOW}⚠️ 기준선 파일이 없습니다. 현재 상태를 기준선으로 설정합니다.${NC}"
        cp "$MONITOR_FILE" "$BASELINE_FILE"
        echo "✅ 기준선 설정 완료: $BASELINE_FILE"
        return 0
    fi
    
    # JSON 비교 (jq 사용)
    if command -v jq >/dev/null 2>&1; then
        # API 데이터 비교
        API_DIFF=$(jq -n --argjson current "$(<$MONITOR_FILE)" --argjson baseline "$(<$BASELINE_FILE)" \
            'if $current.api.data_endpoint == $baseline.api.data_endpoint then "identical" else "different" end')
        
        # HTTP 상태 비교
        HTTP_DIFF=$(jq -n --argjson current "$(<$MONITOR_FILE)" --argjson baseline "$(<$BASELINE_FILE)" \
            'if $current.http.status_code == $baseline.http.status_code then "identical" else "different" end')
        
        echo "📊 API 데이터: $API_DIFF"
        echo "📊 HTTP 상태: $HTTP_DIFF"
        
        if [ "$API_DIFF" = "different" ] || [ "$HTTP_DIFF" = "different" ]; then
            echo -e "${RED}❌ 기준선과 차이가 발견되었습니다!${NC}"
            echo "🔍 상세 비교:"
            echo "--- 현재 상태 ---"
            cat "$MONITOR_FILE" | jq .
            echo "--- 기준선 ---"
            cat "$BASELINE_FILE" | jq .
            return 1
        else
            echo -e "${GREEN}✅ 기준선과 일치합니다.${NC}"
            return 0
        fi
    else
        echo -e "${YELLOW}⚠️ jq가 설치되지 않았습니다. 단순 비교를 수행합니다.${NC}"
        if diff -q "$MONITOR_FILE" "$BASELINE_FILE" >/dev/null; then
            echo -e "${GREEN}✅ 기준선과 일치합니다.${NC}"
            return 0
        else
            echo -e "${RED}❌ 기준선과 차이가 발견되었습니다!${NC}"
            return 1
        fi
    fi
}

# 호환성 검증 실행
run_compatibility_check() {
    echo -e "${BLUE}🛡️ 호환성 검증 실행...${NC}"
    
    if [ -f "scripts/compatibility-check.sh" ]; then
        if ./scripts/compatibility-check.sh; then
            echo -e "${GREEN}✅ 호환성 검증 통과${NC}"
            return 0
        else
            echo -e "${RED}❌ 호환성 검증 실패${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️ 호환성 검증 스크립트를 찾을 수 없습니다.${NC}"
        return 1
    fi
}

# 메인 실행
main() {
    # 현재 상태 캡처
    capture_current_state
    
    # 기준선과 비교
    if compare_with_baseline; then
        echo -e "${GREEN}🎉 기준선과 일치 - 시스템이 안정적입니다.${NC}"
    else
        echo -e "${RED}🚨 기준선과 차이 발견 - 추가 검증이 필요합니다.${NC}"
        
        # 호환성 검증 실행
        if run_compatibility_check; then
            echo -e "${GREEN}✅ 호환성 검증 통과 - 기준선을 업데이트합니다.${NC}"
            cp "$MONITOR_FILE" "$BASELINE_FILE"
        else
            echo -e "${RED}❌ 호환성 검증 실패 - 시스템에 문제가 있습니다.${NC}"
            exit 1
        fi
    fi
    
    echo -e "\n${BLUE}📋 모니터링 결과${NC}"
    echo "============================================================"
    echo "📅 모니터링 시간: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "📊 상태 파일: $MONITOR_FILE"
    echo "📊 기준선 파일: $BASELINE_FILE"
    echo -e "${GREEN}✅ 모니터링 완료${NC}"
}

# 스크립트 실행
main "$@"
