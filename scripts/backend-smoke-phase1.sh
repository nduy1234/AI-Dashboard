#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
TOKEN="${TOKEN:-}"
CAMPAIGN_ID="${CAMPAIGN_ID:-1}"
LEAD_IDS="${LEAD_IDS:-[1]}"

if [[ -z "$TOKEN" ]]; then
  echo "TOKEN env var is required"
  exit 1
fi

echo "== outbound config =="
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/outbound/config" >/dev/null

echo "== outbound pipeline =="
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/outbound/leads/pipeline" >/dev/null

echo "== outbound campaign performance =="
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/v1/outbound/campaigns/$CAMPAIGN_ID/performance" >/dev/null

echo "== outbound pilot run =="
curl -sS -X POST "$BASE_URL/api/v1/outbound/pilot/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-pilot-$(date +%s)" \
  -d "{\"campaignId\": $CAMPAIGN_ID}" >/dev/null

echo "== queue launch job =="
JOB_ID=$(
  curl -sS -X POST "$BASE_URL/api/v1/outbound/jobs/launch" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: smoke-launch-$(date +%s)" \
    -d "{\"campaignId\": $CAMPAIGN_ID, \"leadIds\": $LEAD_IDS, \"provider\": \"resend\", \"dailyCap\": 1}" | jq -r '.jobId'
)
if [[ "$JOB_ID" == "null" || -z "$JOB_ID" ]]; then
  echo "Failed to enqueue launch job"
  exit 1
fi

echo "Queued job $JOB_ID"

echo "Backend smoke checks passed."
