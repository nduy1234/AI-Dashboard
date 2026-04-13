#!/bin/bash

# Seed test leads into database for campaign testing
# This allows testing the full workflow before upgrading Apollo or configuring Clay for sourcing

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}==================== Seed Test Leads ====================${NC}"
echo ""
echo "This script adds test leads to your database for campaign testing."
echo "After testing, replace with real data from Apollo (premium) or Clay (configured for sourcing)."
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
  echo -e "${RED}✗ psql not found. Install PostgreSQL client.${NC}"
  exit 1
fi

# Get database URL from .env
if [ -f .env ]; then
  DATABASE_URL=$(grep -E "^DATABASE_URL=" .env | cut -d'"' -f2)
else
  echo -e "${RED}✗ .env file not found${NC}"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}✗ DATABASE_URL not configured in .env${NC}"
  exit 1
fi

echo -e "${BLUE}Database: $DATABASE_URL${NC}"

# Create SQL for inserting test leads
SQL=$(cat <<'EOSQL'
-- Test leads for sales campaigns
INSERT INTO leads (
  first_name,
  last_name,
  email,
  phone,
  company_name,
  job_title,
  seniority,
  org_id,
  status
) VALUES
  ('Sarah', 'Chen', 'sarah.chen@techcorp.com', '+1-415-555-0101', 'TechCorp Inc', 'VP of Sales', 'vp', 1, 'new'),
  ('Michael', 'Rodriguez', 'michael.r@innovatelabs.com', '+1-617-555-0102', 'Innovate Labs', 'Sales Director', 'director', 1, 'new'),
  ('Jennifer', 'Walsh', 'jen.walsh@cloudbridge.io', '+1-415-555-0103', 'CloudBridge Systems', 'Chief Revenue Officer', 'c_suite', 1, 'new'),
  ('David', 'Kim', 'dkim@venturetech.com', '+1-212-555-0104', 'VentureTech', 'Head of Sales', 'director', 1, 'new'),
  ('Emily', 'Thompson', 'emily.t@enterprise.co', '+1-202-555-0105', 'Enterprise Solutions', 'VP of Revenue', 'vp', 1, 'new'),
  ('Robert', 'Martinez', 'r.martinez@scaleinc.com', '+1-206-555-0106', 'Scale Inc', 'Sales Manager', 'manager', 1, 'new'),
  ('Lisa', 'Anderson', 'lisa.a@synergy.ai', '+1-408-555-0107', 'Synergy AI', 'VP of Sales', 'vp', 1, 'new'),
  ('James', 'Taylor', 'j.taylor@nexus.com', '+1-404-555-0108', 'Nexus Global', 'Sales Director', 'director', 1, 'new'),
  ('Patricia', 'Lee', 'p.lee@summit.co', '+1-512-555-0109', 'Summit Technology', 'Head of Sales', 'director', 1, 'new'),
  ('Christopher', 'White', 'c.white@apex.io', '+1-303-555-0110', 'Apex Solutions', 'Chief Revenue Officer', 'c_suite', 1, 'new');

-- Verify insertion
SELECT COUNT(*) as total_leads FROM leads WHERE email LIKE '%@%' AND org_id = 1;
EOSQL
)

# Run the SQL
echo -e "${BLUE}Adding 10 test sales leads...${NC}"
psql "$DATABASE_URL" <<< "$SQL" 2>&1 | tail -5

echo ""
echo -e "${GREEN}✓ Test leads added successfully!${NC}"
echo ""
echo "Now you can test campaigns:"
echo ""
echo "1. Create a campaign:"
echo "   curl -X POST http://localhost:5000/api/v1/campaigns \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\": \"Test Campaign\", \"type\": \"Sales - Enterprise Deal\", \"subject\": \"Test\"}'"
echo ""
echo "2. Check the logs for agent sourcing:"
echo "   Watch for: [Tool] Found X contacts with emails from..."
echo ""
echo "3. After testing, replace test leads with real data:"
echo "   - Upgrade Apollo to Pro plan for org_top_people endpoint"
echo "   - OR configure Clay API for direct sourcing"
echo "   - OR use another provider (HubSpot, LinkedIn, etc.)"
echo ""
