# Apollo API Timeout Debugging Guide

## Problem Summary

The agent is hanging when attempting to source leads from Apollo API. The HTTP POST request to `/api/v1/contacts/search` is sent successfully, but no response is received from Apollo.

## What We've Enhanced

### 1. **Timeout Handling** ✅
- Added `AbortController` to `fetchJson()` with configurable timeout (default: 30s)
- Timeout will now trigger and throw a clear error message
- Enhanced logging shows request timing metrics

### 2. **Request Lifecycle Logging** ✅
Enhanced `fetchJson()` logs for complete visibility:
```
[HTTP] POST /api/v1/contacts/search (timeout: 30000ms) - starting...
[HTTP] Response headers received: 200 OK (1234ms)
[HTTP] Response body: 2048 bytes received
[HTTP] Parsing JSON (2048 bytes)...
[HTTP]✓ Success: /api/v1/contacts/search completed in 1245ms
```

OR in case of timeout:
```
[HTTP] POST /api/v1/contacts/search (timeout: 30000ms) - starting...
[Timeout trigger after 30123ms]
[HTTP] ✗ TIMEOUT: /api/v1/contacts/search after 30123ms (limit: 30000ms)
```

### 3. **Response Validation Logging** ✅
- Tool layer now logs actual contact count returned from Apollo
- Logs show response structure validation results
- Better error messages for invalid response formats

## Debugging Steps

### Step 1: Run Diagnostics Script
```bash
cd /home/arslan/Documents/Remote/AI-Dashboard
chmod +x diagnose-apollo.sh
./diagnose-apollo.sh
```

**What it checks:**
- Environment variables are set
- Apollo server is reachable
- API authentication works
- `/api/v1/contacts/search` endpoint responds correctly

**Expected output on success:**
```
✓ Apollo API server is reachable
✓ Authentication successful (HTTP 200)
✓ Endpoint returned successful response
  Found X contacts with emails
```

### Step 2: Create Test Campaign
```bash
chmod +x test-campaign-create.sh
./test-campaign-create.sh
```

**What it does:**
1. Creates a new campaign
2. Launches the agent
3. Monitors agent status for 45 seconds
4. Reports timeline and results

**Key log lines to look for:**
- `[HTTP] POST /api/v1/contacts/search (timeout: 30000ms) - starting...` → Request sent at T=0
- `[HTTP] Response headers received: 200 OK (1234ms)` → Response received at ~T=1.2s
- `[HTTP] ✗ TIMEOUT: /api/v1/contacts/search after 30123ms` → Timeout triggered at ~T=30s
- `[HTTP]✓ Success:` → Request completed with data

### Step 3: Check Backend Logs

While campaign is running, monitor backend console:
```bash
# In another terminal
cd /home/arslan/Documents/Remote/AI-Dashboard/artifacts/api-server
npm run dev  # or your dev command
```

Watch for these log patterns:

**Successful request:**
```
[Tool] Smart Apollo strategy for "Diagnostic Test - Sales Q2 2025" (type: Sales - Enterprise Deal): people_filters
[Tool] Targeting titles: VP of Sales, Head of Sales, Chief Revenue Officer
[Tool] Targeting seniorities: vp, c_suite, director
[Tool] Apollo request payload: { page: 1, per_page: 10, person_titles: [...], ... }
[HTTP] POST /api/v1/contacts/search (timeout: 30000ms) - starting...
[HTTP] Response headers received: 200 OK (245ms)
[HTTP] Response body: 4096 bytes received
[HTTP] Parsing JSON (4096 bytes)...
[HTTP]✓ Success: /api/v1/contacts/search completed in 246ms
[Tool] Apollo /api/v1/contacts/search response: 10 contacts/people found
[Tool] Found 10 contacts with emails from /api/v1/contacts/search
```

**Timeout error:**
```
[HTTP] POST /api/v1/contacts/search (timeout: 30000ms) - starting...
[Timeout trigger after 30123ms]
[HTTP] ✗ TIMEOUT: /api/v1/contacts/search after 30123ms (limit: 30000ms)
[WARNING] [Tool] Apollo /api/v1/contacts/search (people_filters) failed: Request timeout after 30000ms
[INFO] [Tool] Attempting Apollo /api/v1/mixed_people/organization_top_people with POST request
```

## Possible Causes & Solutions

### Scenario A: Timeout is Triggered (Good News!)
If you see `[HTTP] ✗ TIMEOUT` after 30 seconds:
- **Cause**: Apollo API not responding within timeout
- **Solutions**:
  1. Check Apollo status: https://status.apollo.io
  2. Verify API key is active and has quota remaining
  3. Check if Apollo is blocking your IP (contact Apollo support)
  4. Try from different network/VPN to rule out ISP blocks
  5. Increase timeout in code if Apollo is inherently slow

**Code change to increase timeout:**
```typescript
// In lib/agent-orchestration/src/tools/index.ts, line ~521
data = await fetchJson<ApolloSearchResponse>(url, {
  method: "POST",
  headers,
  body: filterBody,
}, 60000);  // 60 second timeout instead of 30
```

### Scenario B: No Logs Appear At All
- **Cause**: Request never reaches `fetchJson()`, or backend server not running
- **Solutions**:
  1. Check backend is running: `lsof -i :3001` (should show Node process)
  2. Check campaign endpoint is working: `curl -X GET http://localhost:3001/campaigns`
  3. Verify agent is actually being launched (check campaign response)

### Scenario C: Timeout Shows "after 0ms" or "undefined"
- **Cause**: Timeout handling bug
- **Solutions**:
  1. Check Node.js version: `node --version` (should be 18+)
  2. AbortController was added in Node 15. Upgrade if necessary.
  3. Check `process.env.NODE_ENV` is not "production" (may have different timeout behavior)

### Scenario D: 422 Validation Error Instead
- **Cause**: Apollo rejecting the search payload
- **Solutions**:
  1. Check logs show exact payload being sent
  2. Verify person_titles and person_seniorities are valid arrays
  3. Check Apollo API docs for latest required/optional fields
  4. Apollo plan may require certain fields present

## Manual Testing with curl

If you want to test Apollo directly:

```bash
# Set your API key
export APOLLO_API_KEY="your-key-here"

# Test authentication
curl -X GET https://api.apollo.io/api/v1/users \
  -H "X-Api-Key: $APOLLO_API_KEY"

# Test contacts search (30s timeout)
curl -X POST https://api.apollo.io/api/v1/contacts/search \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APOLLO_API_KEY" \
  -d '{
    "page": 1,
    "per_page": 5,
    "person_titles": ["VP of Sales"],
    "person_seniorities": ["vp"],
    "contact_email_status": ["verified"]
  }' \
  --max-time 35  # 30s Apollo timeout + 5s buffer

# Note response time (before the final brace)
```

## Environment Variables Checklist

Ensure these are set in your `.env` or environment:

```bash
# Required
APOLLO_API_KEY="xxxxxxxxxxxxx"  # From https://app.apollo.io/settings/api

# Optional (has sensible defaults)
APOLLO_BASE_URL="https://api.apollo.io"  # Usually don't change this
CLAY_API_KEY="xxxxxxxxxxxxx"  # If using Clay fallback
```

Verify with:
```bash
echo $APOLLO_API_KEY           # Should print key (not empty)
echo $APOLLO_BASE_URL          # Should print URL or be empty
```

## Expected Timeline

When everything works:
- **T=0ms**: Request sent
- **T=0-500ms**: Response received from Apollo
- **T=500-510ms**: JSON parsed and contacts extracted
- **T=510ms**: Agent continues to next step

When Apollo times out:
- **T=0ms**: Request sent
- **T=30000ms**: Timeout triggers
- **T=30001ms**: Error thrown to agent
- **T=30005ms**: Agent falls back to Clay or exits

## Next Steps After Debugging

1. **If Apollo works**: Celebrate! Full sourcing flow is operational
2. **If Apollo hangs**: Mark as known issue and implement Clay-only mode
3. **If intermittent**: May be Apollo flakiness, consider adding exponential backoff retry
4. **If consistent timeout**: May need to contact Apollo about API performance

## Related Files

- Campaign creation: `artifacts/api-server/src/routes/campaigns.ts`
- Tool execution: `lib/agent-orchestration/src/tools/index.ts`
- Apollo config: `lib/agent-orchestration/config/apollo-endpoints.json`
- Provider adapters: `artifacts/api-server/src/lib/outboundIntegrations.ts`

## Questions?

If debugging doesn't resolve the issue:
1. Collect the full console output (30+ seconds of logs)
2. Get the campaign ID and agent ID  
3. Include output from `./diagnose-apollo.sh`
4. Check Apollo API status and docs for any recent changes
5. Reach out to Apollo support with:
   - API key (redacted)
   - Request payload you're sending
   - Apollo API docs link you're following
