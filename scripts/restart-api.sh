#!/bin/bash

set -euo pipefail

PORT=8081
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "🔁 픽업 API 재시작"

EXISTING_PIDS=$(lsof -ti tcp:${PORT} || true)
if [ -n "${EXISTING_PIDS}" ]; then
  echo "🛑 기존 프로세스 종료: ${EXISTING_PIDS}"
  kill -9 ${EXISTING_PIDS}
  sleep 1
else
  echo "✅ 포트 ${PORT}에서 실행 중인 프로세스가 없습니다."
fi

cd "${PROJECT_ROOT}"

echo "🚀 API 서버 실행 (npm run start:api)"
npm run start:api

#cd /Users/dohyeonkim/작업용/pickup
#npm run restart:api




