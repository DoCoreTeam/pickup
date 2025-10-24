#!/bin/bash
# 미친제육 프로젝트 서버 중지 스크립트

echo "🛑 미친제육 프로젝트 서버를 중지합니다..."
echo "📅 중지 시간: $(date '+%Y-%m-%d %H:%M:%S')"

# 프로젝트 루트 디렉토리로 이동
cd "$(dirname "$0")/.."

# PID 파일에서 프로세스 ID 읽기
if [ -f .http_server.pid ]; then
    HTTP_PID=$(cat .http_server.pid)
    if ps -p $HTTP_PID > /dev/null 2>&1; then
        echo "🌐 HTTP 서버를 중지합니다... (PID: $HTTP_PID)"
        kill $HTTP_PID
        rm .http_server.pid
        echo "✅ HTTP 서버 중지 완료"
    else
        echo "🌐 HTTP 서버 프로세스가 이미 중지되었거나 존재하지 않습니다."
    fi
else
    echo "🌐 HTTP 서버 PID 파일이 없습니다."
fi

if [ -f .api_server.pid ]; then
    API_PID=$(cat .api_server.pid)
    if ps -p $API_PID > /dev/null 2>&1; then
        echo "🔧 API 서버를 중지합니다... (PID: $API_PID)"
        kill $API_PID
        rm .api_server.pid
        echo "✅ API 서버 중지 완료"
    else
        echo "🔧 API 서버 프로세스가 이미 중지되었거나 존재하지 않습니다."
    fi
else
    echo "🔧 API 서버 PID 파일이 없습니다."
fi

# 포트 기반 프로세스 정리 (백업)
echo "📋 포트 기반 프로세스를 정리합니다..."
HTTP_PROCESSES=$(lsof -ti:8080 2>/dev/null)
API_PROCESSES=$(lsof -ti:8081 2>/dev/null)

if [ ! -z "$HTTP_PROCESSES" ]; then
    echo "🌐 포트 8080에서 실행 중인 프로세스 발견: $HTTP_PROCESSES"
    echo $HTTP_PROCESSES | xargs kill -9 2>/dev/null || true
    echo "✅ 포트 8080 프로세스 정리 완료"
else
    echo "🌐 포트 8080에서 실행 중인 프로세스 없음"
fi

if [ ! -z "$API_PROCESSES" ]; then
    echo "🔧 포트 8081에서 실행 중인 프로세스 발견: $API_PROCESSES"
    echo $API_PROCESSES | xargs kill -9 2>/dev/null || true
    echo "✅ 포트 8081 프로세스 정리 완료"
else
    echo "🔧 포트 8081에서 실행 중인 프로세스 없음"
fi

echo ""
echo "✅ 모든 서버가 중지되었습니다."
echo "📅 완료 시간: $(date '+%Y-%m-%d %H:%M:%S')"
