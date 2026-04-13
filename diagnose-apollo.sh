#!/bin/bash

# Apollo API Diagnostic Script
# This script tests various aspects of the Apollo integration to identify the hanging issue

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}================== Apollo API Diagnostic ==================${NC}"
echo ""

# Check 1: Environment variables
echo -e "${BLUE}[1] Checking environment variables...${NC}"
if [ -z "$APOLLO_API_KEY" ]; then
  echo -e "${RED}✗ APOLLO_API_KEY not set${NC}"
  exit 1
else
  echo -e "${GREEN}✓ APOLLO_API_KEY is set${NC}"
fi

if [ -z "$APOLLO_BASE_URL" ]; then
  echo -e "${YELLOW}ℹ APOLLO_BASE_URL not set, will use default (https://api.apollo.io)${NC}"
  APOLLO_BASE_URL="https://api.apollo.io"
else
  echo -e "${GREEN}✓ APOLLO_BASE_URL: $APOLLO_BASE_URL${NC}"
fi
echo ""

# Check 2: Network connectivity
echo -e "${BLUE}[2] Testing network connectivity to Apollo API...${NC}"
if timeout 5 curl -s -I "$APOLLO_BASE_URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Apollo API server is reachable${NC}"
else
  echo -e "${RED}✗ Cannot reach Apollo API server at $APOLLO_BASE_URL${NC}"
  echo "   Make sure the API base URL is correct"
  exit 1
fi
echo ""

# Check 3: API authentication
echo -e "${BLUE}[3] Testing Apollo API authentication...${NC}"
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$APOLLO_BASE_URL/api/v1/users" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY")

HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n 1)
BODY=$(echo "$AUTH_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Authentication successful (HTTP 200)${NC}"
  echo "  Response preview: $(echo "$BODY" | head -c 100)..."
elif [ "$HTTP_CODE" = "401" ]; then
  echo -e "${RED}✗ Authentication failed (HTTP 401)${NC}"
  echo "  Invalid API key. Check APOLLO_API_KEY environment variable"
  exit 1
else
  echo -e "${YELLOW}ℹ Got HTTP $HTTP_CODE (may still be valid)${NC}"
  echo "  Response: $BODY"
fi
echo ""

# Check 4: contacts/search endpoint connectivity
echo -e "${BLUE}[4] Testing /api/v1/contacts/search endpoint...${NC}"
SEARCH_PAYLOAD=$(cat <<'EOF'
{
  "page": 1,
  "per_page": 1,
  "person_titles": ["VP of Sales"],
  "person_seniorities": ["vp"],
  "contact_email_status": ["verified"]
}
EOF
)

echo -e "   Payload: $(echo "$SEARCH_PAYLOAD" | tr '\n' ' ')"
echo ""

SEARCH_START=$(date +%s%N | cut -b1-13)
SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APOLLO_BASE_URL/api/v1/contacts/search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d "$SEARCH_PAYLOAD" \
  --max-time 10)

SEARCH_END=$(date +%s%N | cut -b1-13)
SEARCH_DURATION=$((SEARCH_END - SEARCH_START))

SEARCH_CODE=$(echo "$SEARCH_RESPONSE" | tail -n 1)
SEARCH_BODY=$(echo "$SEARCH_RESPONSE" | head -n -1)

echo -e "   Response time: ${SEARCH_DURATION}ms"
echo -e "   HTTP Code: $SEARCH_CODE"

if [ "$SEARCH_CODE" = "200" ] || [ "$SEARCH_CODE" = "201" ]; then
  echo -e "${GREEN}✓ Endpoint returned successful response${NC}"
  CONTACT_COUNT=$(echo "$SEARCH_BODY" | grep -o '"email"' | wc -l)
  echo "  Found $CONTACT_COUNT contacts with emails"
  echo "  Response size: $(echo "$SEARCH_BODY" | wc -c) bytes"
elif [ "$SEARCH_CODE" = "422" ]; then
  echo -e "${RED}✗ Validation error (HTTP 422)${NC}"
  echo "  Response: $(echo "$SEARCH_BODY" | head -c 200)..."
elif [ "$SEARCH_CODE" = "401" ]; then
  echo -e "${RED}✗ Authentication failed (HTTP 401)${NC}"
elif [ -z "$SEARCH_CODE" ]; then
  echo -e "${RED}✗ No response received (timeout or connection issue)${NC}"
  echo "  curl may have timed out after 10 seconds"
  echo "  This could indicate the issue is with Apollo API responsiveness"
else
  echo -e "${YELLOW}ℹ Got HTTP $SEARCH_CODE${NC}"
  echo "  Response: $(echo "$SEARCH_BODY" | head -c 200)..."
fi
echo ""

# Summary
echo -e "${BLUE}==============================================================${NC}"
echo -e "${BLUE}Diagnostic Summary:${NC}"
echo ""
if [ "$SEARCH_CODE" = "200" ] || [ "$SEARCH_CODE" = "201" ]; then
  echo -e "${GREEN}✓ All checks passed. Apollo API is working correctly.${NC}"
  echo "  If campaigns are still hanging, the issue may be in:"
  echo "  - Backend request handling"
  echo "  - Environment variable passing"
  echo "  - Timeout configuration"
  echo ""
  echo "  Run the test with: npm run test:source-leads"
else
  echo -e "${RED}✗ Apollo API issue detected.${NC}"
  if [ -z "$SEARCH_CODE" ]; then
    echo "  - Apollo API is not responding to requests"
    echo "  - Check API status: https://status.apollo.io"
    echo "  - Verify network configuration and firewall rules"
  elif [ "$SEARCH_CODE" = "401" ]; then
    echo "  - API key is invalid or expired"
    echo "  - Update APOLLO_API_KEY environment variable"
  fi
fi
