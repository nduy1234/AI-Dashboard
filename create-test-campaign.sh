#!/bin/bash

# Create test campaign with leads directly in database
# This bypasses the HTTP auth requirement

DB_URL="postgresql://advenai_user:encrypt123@localhost:5432/adven_ai_db"

# Fixed user and org IDs from logs
USER_ID="8990767d-d777-4bc9-a6dc-cbf87252e1b1"
ORG_ID=1

echo "Creating test campaign with leads..."
echo "User: $USER_ID"
echo "Org: $ORG_ID"
echo ""

# Create the campaign
CAMPAIGN_SQL=$(cat <<EOF
INSERT INTO campaigns (
  name,
  type,
  subject,
  status,
  lead_count,
  email_sequence_count,
  user_id,
  org_id,
  created_at,
  updated_at
) VALUES (
  'Sales Campaign with Test Leads',
  'Sales - Enterprise Deal',
  'Enterprise Partnership Opportunity',
  'active',
  10,
  0,
  '$USER_ID',
  $ORG_ID,
  NOW(),
  NOW()
) RETURNING id;
EOF
)

CAMPAIGN_ID=$(psql "$DB_URL" -t -c "$CAMPAIGN_SQL" 2>/dev/null | tr -d ' ')

if [ -z "$CAMPAIGN_ID" ]; then
  echo "Error creating campaign"
  exit 1
fi

echo "Campaign created with ID: $CAMPAIGN_ID"
echo ""

# Link the test leads to the campaign
LINKS_SQL=$(cat <<EOF
INSERT INTO campaign_leads (campaign_id, lead_id, status, created_at)
SELECT $CAMPAIGN_ID, id, 'pending', NOW()
FROM leads
WHERE email LIKE '%@%' AND org_id = $ORG_ID
ORDER BY id
LIMIT 10;
EOF
)

psql "$DB_URL" -c "$LINKS_SQL" > /dev/null 2>&1

echo "Campaign linked with 10 test leads"
echo ""
echo "Now trigger the agent to process the campaign:"
echo ""
echo "curl -X POST http://localhost:5000/api/v1/campaigns/$CAMPAIGN_ID/launch"
echo ""
