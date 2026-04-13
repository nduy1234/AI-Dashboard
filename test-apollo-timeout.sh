#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}Apollo Request Timeout Test${NC}"
echo "======================================"
echo ""

# Create campaign that will trigger Apollo search
echo -e "${BLUE}1. Creating test campaign...${NC}"
CAMPAIGN_RESPONSE=$(curl -s -X POST http://localhost:3001/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Apollo Timeout Test - Sales",
    "type": "Sales - Enterprise Deal",
    "subject": "Potential partnership opportunity"
  }')

CAMPAIGN_ID=$(echo $CAMPAIGN_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo -e "${GREEN}Campaign created: $CAMPAIGN_ID${NC}"
echo "Full response:"
echo $CAMPAIGN_RESPONSE | jq . 2>/dev/null || echo $CAMPAIGN_RESPONSE
echo ""

# Monitor logs for 35 seconds (30s timeout + 5s buffer)
echo -e "${BLUE}2. Monitoring agent logs for 35 seconds...${NC}"
echo "   Looking for: timeout error, response, or completion"
echo ""

if [ -f /tmp/agent-logs.txt ]; then
  rm /tmp/agent-logs.txt
fi

# Create a named pipe to capture real-time logs
mkfifo /tmp/agent-log-pipe 2>/dev/null || true

# Start monitoring in background
{
  # Show lines containing HTTP, Tool, Request, Response, timeout, error or success
  tail -f /tmp/agent-logs.txt 2>/dev/null | grep -E "\[HTTP\]|\[Tool\]|timeout|Response|SUCCESS|ERROR" &
  TAIL_PID=$!
  
  # Wait for 35 seconds
  sleep 35
  
  # Kill the tail
  kill $TAIL_PID 2>/dev/null || true
} &

MONITOR_PID=$!

# Give the monitor a moment to start
sleep 1

# Wait for the monitor to finish
wait $MONITOR_PID 2>/dev/null || true

echo ""
echo -e "${BLUE}3. Test complete. Full logs:${NC}"
echo "======================================"
if [ -f /tmp/agent-logs.txt ]; then
  tail -100 /tmp/agent-logs.txt | grep -E "Apollo|HTTP|Tool|contacts|search|timeout|Response" || echo "No matching logs found"
else
  echo "Log file not found at /tmp/agent-logs.txt"
fi

echo ""
echo -e "${BLUE}4. Summary:${NC}"
echo "If you see '[HTTP] ✗ TIMEOUT' - the timeout is working correctly"
echo "If you see '[HTTP]✓ Success' - Apollo responded successfully"  
echo "If you see 'Response' line - response was received"
echo ""
