#!/bin/bash
# 미친제육 프로젝트 서버 시작 스크립트

echo "🚀 미친제육 프로젝트 서버를 시작합니다..."
echo "📅 시작 시간: $(date '+%Y-%m-%d %H:%M:%S')"

# 프로젝트 루트 디렉토리로 이동
cd "$(dirname "$0")/.."

# 기존 프로세스 정리
echo "📋 기존 프로세스를 정리합니다..."
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
echo "✅ 기존 프로세스 정리 완료"

# HTTP 서버 시작 (백그라운드)
echo "🌐 HTTP 서버를 시작합니다... (포트 8080)"
cd src/frontend && python3 -m http.server 8080 &
HTTP_PID=$!
cd ../..
echo "✅ HTTP 서버 시작됨 (PID: $HTTP_PID)"

# API 서버 시작 (백그라운드)
echo "🔧 API 서버를 시작합니다... (포트 8081)"
python3 ./src/backend/api_server.py &
API_PID=$!
echo "✅ API 서버 시작됨 (PID: $API_PID)"

# 서버 시작 대기
echo "⏳ 서버 시작 대기 중... (3초)"
sleep 3

# 서버 상태 확인
echo "✅ 서버 상태를 확인합니다..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/)
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/api/data)

if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 304 ]; then
    echo "✅ HTTP 서버 정상 동작 (상태 코드: $HTTP_STATUS)"
else
    echo "❌ HTTP 서버 오류 (상태 코드: $HTTP_STATUS)"
fi

if [ "$API_STATUS" -eq 200 ]; then
    echo "✅ API 서버 정상 동작 (상태 코드: $API_STATUS)"
else
    echo "❌ API 서버 오류 (상태 코드: $API_STATUS)"
fi

echo ""
echo "🎉 서버가 성공적으로 시작되었습니다!"
echo "📱 접속 URL:"
echo "   관리자 페이지: http://localhost:8080/"
echo "   가게 페이지: http://localhost:8080/?store=스토어ID"
echo "   API 서버: http://localhost:8081/api/"
echo ""
echo "🛑 서버 중지: Ctrl+C 또는 ./scripts/stop.sh"
echo "📊 로그 확인: 실시간으로 터미널에서 확인 가능"
echo ""

# 프로세스 ID 저장
echo $HTTP_PID > .http_server.pid 2>/dev/null || true
echo $API_PID > .api_server.pid 2>/dev/null || true

# 대기
wait
