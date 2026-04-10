#!/bin/bash

# Apollo Data Availability Inspector
# Shows what contacts/organizations are available in your current plan

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

export APOLLO_API_KEY="${APOLLO_API_KEY:-eFM0P3cuhJ9LmAzHiHaruw}"

echo -e "${BLUE}==================== Apollo Data Inspector ====================${NC}"
echo ""

# Check 1: Total contacts available
echo -e "${BLUE}[1] Checking total contacts in your account...${NC}"
TOTAL=$(curl -s -X POST "https://api.apollo.io/api/v1/contacts/search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{"page": 1, "per_page": 1}' | jq '.pagination.total_entries // 0' 2>/dev/null || echo "0")

echo -e "${GREEN}Total contacts available: $TOTAL${NC}"
echo ""

# Check 2: Sample search with minimal filters
echo -e "${BLUE}[2] Searching with minimal filters (just email requirement)...${NC}"
SAMPLE=$(curl -s -X POST "https://api.apollo.io/api/v1/contacts/search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{
    "page": 1,
    "per_page": 10,
    "contact_email_status": ["verified"]
  }' 2>/dev/null)

SAMPLE_COUNT=$(echo "$SAMPLE" | jq '.pagination.total_entries // 0' 2>/dev/null || echo "0")
echo -e "${GREEN}Verified email contacts available: $SAMPLE_COUNT${NC}"

if [ "$SAMPLE_COUNT" -gt 0 ]; then
  echo -e "${BLUE}Sample contacts:${NC}"
  echo "$SAMPLE" | jq '.contacts[0:3][] | {email, name, title: .person_title, seniority: .person_seniority}' 2>/dev/null | head -30
fi
echo ""

# Check 3: Search by specific titles
echo -e "${BLUE}[3] Searching for Sales titles...${NC}"
SALES=$(curl -s -X POST "https://api.apollo.io/api/v1/contacts/search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{
    "page": 1,
    "per_page": 5,
    "person_titles": ["VP of Sales", "Sales Manager", "Sales Director"],
    "contact_email_status": ["verified"]
  }' 2>/dev/null)

SALES_COUNT=$(echo "$SALES" | jq '.pagination.total_entries // 0' 2>/dev/null || echo "0")
echo -e "${GREEN}Sales role contacts: $SALES_COUNT${NC}"

if [ "$SALES_COUNT" -gt 0 ]; then
  echo -e "${BLUE}Sample results:${NC}"
  echo "$SALES" | jq '.contacts[0:2][] | {name, email, title: .person_title, company: .organization}' 2>/dev/null
fi
echo ""

# Check 4: Organizations search
echo -e "${BLUE}[4] Checking organizations...${NC}"
ORGS=$(curl -s -X POST "https://api.apollo.io/api/v1/organizations/search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{
    "page": 1,
    "per_page": 5,
    "query": "saas"
  }' 2>/dev/null)

ORG_COUNT=$(echo "$ORGS" | jq '.pagination.total_entries // 0' 2>/dev/null || echo "0")
echo -e "${GREEN}SaaS organizations found: $ORG_COUNT${NC}"

if [ "$ORG_COUNT" -gt 0 ]; then
  echo -e "${BLUE}Sample results:${NC}"
  echo "$ORGS" | jq '.organizations[0:2][] | {name, industry, website}' 2>/dev/null
fi
echo ""

# Summary
echo -e "${BLUE}==============================================================${NC}"
echo -e "${BLUE}Analysis:${NC}"
echo ""

if [ "$TOTAL" = "0" ]; then
  echo -e "${RED}✗ No contacts found in your account${NC}"
  echo "   This is common on free tier. You may need to:"
  echo "   1. Add contacts manually to your Apollo dashboard"
  echo "   2. Upgrade to a paid plan for access to full database"
  echo "   3. Use Clay or another provider as fallback"
elif [ "$SAMPLE_COUNT" = "0" ]; then
  echo -e "${YELLOW}⚠ Contacts exist but none with verified emails${NC}"
  echo "   Try: broaden title/seniority filters"
  echo "   Or:  add location/industry filters"
else
  echo -e "${GREEN}✓ Found $(( SAMPLE_COUNT > 0 ? SAMPLE_COUNT : TOTAL )) searchable contacts${NC}"
  echo "   Your account has usable data for sourcing"
fi
echo ""
