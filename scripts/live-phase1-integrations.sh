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

echo "== env diagnostics =="
for key in APOLLO_API_KEY CLAY_API_KEY MILLIONVERIFIER_API_KEY RESEND_API_KEY INSTANTLY_API_KEY SMARTLEAD_API_KEY; do
  if [[ -z "${!key:-}" ]]; then
    echo "WARN: $key missing"
  else
    echo "OK: $key present"
  fi
done

echo "== queue import job =="
IMPORT_JOB_ID=$(
  curl -sS -X POST "$BASE_URL/api/v1/outbound/jobs/import" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: live-import-$(date +%s)" \
    -d '{"source":"apollo","importType":"api","filters":{"person_titles":["Founder"]}}' | jq -r '.jobId'
)
echo "import jobId=$IMPORT_JOB_ID"

poll_job() {
  local job_id="$1"
  local status="queued"
  for _ in {1..20}; do
    status=$(curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/outbound/jobs/$job_id" | jq -r '.status')
    echo "job $job_id status=$status"
    if [[ "$status" == "completed" || "$status" == "failed" ]]; then
      break
    fi
    sleep 2
  done
}

poll_job "$IMPORT_JOB_ID"

echo "== verify webhook normalization =="
WEBHOOK_BODY='{"event":"email_opened","eventId":"live-open-1","campaign_id":'"$CAMPAIGN_ID"',"lead_id":1}'
WEBHOOK_SIG=$(printf "%s" "$WEBHOOK_BODY" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET_RESEND:-dev-resend-secret}" | awk '{print $2}')
curl -sS -X POST "$BASE_URL/api/v1/webhooks/sending/resend" \
  -H "Content-Type: application/json" \
  -H "x-resend-signature: $WEBHOOK_SIG" \
  -d "$WEBHOOK_BODY" >/dev/null

echo "== pipeline and pilot endpoints =="
curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/outbound/leads/pipeline" | jq . >/dev/null
curl -sS -X POST "$BASE_URL/api/v1/outbound/pilot/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: live-pilot-$(date +%s)" \
  -d "{\"campaignId\": $CAMPAIGN_ID}" | jq . >/dev/null

echo "Live Phase 1 integration script completed."
