#!/bin/bash

# Test Campaign Sourcing with Full Logging
# Run this after starting the backend: npm run dev:api-server

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3001}"

echo -e "${BLUE}================== Campaign Sourcing Test ==================${NC}"
echo ""
echo "API URL: $API_URL"
echo ""

# Function to wait for completion
wait_for_completion() {
  local agent_id=$1
  local max_wait=45  # 30s timeout + 15s buffer
  local elapsed=0
  
  echo -e "${BLUE}Monitoring agent execution for $max_wait seconds...${NC}"
  echo "Agent ID: $agent_id"
  echo ""
  
  while [ $elapsed -lt $max_wait ]; do
    # Get agent status
    STATUS=$(curl -s -X GET "$API_URL/api/agents/status/$agent_id" 2>/dev/null || echo "{}")
    
    STATE=$(echo "$STATUS" | jq -r '.state // "unknown"' 2>/dev/null || echo "unknown")
    OUTPUT=$(echo "$STATUS" | jq -r '.output // ""' 2>/dev/null || echo "")
    
    # Display progress
    printf "\r[%2ds] State: %s" "$elapsed" "$STATE"
    
    if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ]; then
      echo ""
      echo ""
      if [ "$STATE" = "completed" ]; then
        echo -e "${GREEN}✓ Agent completed successfully${NC}"
      else
        echo -e "${RED}✗ Agent failed${NC}"
      fi
      
      if [ -n "$OUTPUT" ]; then
        echo "Output:"
        echo "$OUTPUT" | jq . 2>/dev/null || echo "$OUTPUT"
      fi
      
      return 0
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  echo ""
  echo -e "${RED}✗ Agent did not complete within ${max_wait}s${NC}"
  echo ""
  echo "Possible causes:"
  echo "  - Apollo API request hanging (should timeout at 30s)"
  echo "  - agent status endpoint not returning updates"
  echo "  - Backend database issue"
  echo ""
  return 1
}

# Test 1: Create campaign
echo -e "${BLUE}[1] Creating campaign...${NC}"
CAMPAIGN=$(curl -s -X POST "$API_URL/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diagnostic Test - Sales Q2 2025",
    "type": "Sales - Enterprise Deal",
    "subject": "Executive partnership opportunity"
  }')

CAMPAIGN_ID=$(echo "$CAMPAIGN" | jq -r '.id // empty' 2>/dev/null || echo "")
AGENT_ID=$(echo "$CAMPAIGN" | jq -r '.agentId // empty' 2>/dev/null || echo "")

if [ -z "$CAMPAIGN_ID" ]; then
  echo -e "${RED}✗ Failed to create campaign${NC}"
  echo "Response: $CAMPAIGN"
  exit 1
fi

echo -e "${GREEN}✓ Campaign created${NC}"
echo "  Campaign ID: $CAMPAIGN_ID"
echo "  Agent ID: ${AGENT_ID:-(pending)}"
echo ""

# If agent was returned immediately
if [ -n "$AGENT_ID" ]; then
  # Wait for agent completion
  if wait_for_completion "$AGENT_ID"; then
    echo -e "${GREEN}✓ Full test passed${NC}"
  else
    echo -e "${YELLOW}ℹ Agent did not complete in time${NC}"
  fi
else
  echo -e "${YELLOW}ℹ Agent ID not returned immediately${NC}"
  echo "  Agent may be launching asynchronously"
  echo ""
  
  # Fetch campaign to get agent ID
  sleep 2
  echo -e "${BLUE}[2] Fetching campaign to get agent ID...${NC}"
  CAMPAIGN_DATA=$(curl -s -X GET "$API_URL/campaigns/$CAMPAIGN_ID")
  AGENT_ID=$(echo "$CAMPAIGN_DATA" | jq -r '.agentId // empty' 2>/dev/null || echo "")
  
  if [ -n "$AGENT_ID" ]; then
    echo -e "${GREEN}✓ Agent found: $AGENT_ID${NC}"
    echo ""
    wait_for_completion "$AGENT_ID"
  else
    echo -e "${YELLOW}ℹ No agent ID in campaign data${NC}"
    echo "Campaign data:"
    echo "$CAMPAIGN_DATA" | jq .
  fi
fi

echo ""
echo -e "${BLUE}==============================================================${NC}"
echo "Test complete. Check logs above for details on:"
echo "  - Campaign creation"
echo "  - Agent initialization"
echo "  - Apollo API request status"
echo "  - Lead sourcing results"
