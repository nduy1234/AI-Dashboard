# Apollo.io API Correct Payloads

## 1. Search for Contacts/People
**Endpoint:** `POST /api/v1/contacts/search`

### Correct Payload:
```json
{
  "page": 1,
  "per_page": 10,
  "person_titles": ["CEO", "VP of Sales", "Head of Engineering"],
  "person_seniorities": ["vp", "c_suite", "director", "manager"],
  "contact_email_status": ["verified"],
  "sort_by": "contact_last_activity_date",
  "sort_direction": "desc",
  "include_enriched_data": true
}
```

### Parameters:
- **page** (number): Pagination page number, default 1
- **per_page** (number): Results per page, max 100
- **person_titles** (array): Filter by job titles (optional)
- **person_seniorities** (array): Filter by seniority level (optional)
  - Values: `vp`, `c_suite`, `director`, `manager`, `individual contributor`
- **contact_email_status** (array): Filter by email verification status
  - Values: `verified`, `unverified`, `bounced`, `private`
- **sort_by** (string): Sort field (optional)
  - Values: `contact_last_activity_date`, `first_name`, `last_name`
- **sort_direction** (string): `asc` or `desc`
- **include_enriched_data** (boolean): Include additional enriched data (optional)

**Headers:**
```
Content-Type: application/json
X-Api-Key: YOUR_API_KEY
```

---

## 2. Search for Companies/Organizations
**Endpoint:** `POST /api/v1/organizations/search`

### Correct Payload:
```json
{
  "page": 1,
  "per_page": 10,
  "q_organization_keyword_tags": ["fintech", "payments", "healthcare"],
  "organization_size": ["25-99", "100-499", "500-1000"],
  "seniority_levels": ["vp", "c_suite"],
  "sort_by": "organization_name",
  "sort_direction": "asc"
}
```

### Parameters:
- **page** (number): Pagination page number, default 1
- **per_page** (number): Results per page, max 100
- **q_organization_keyword_tags** (array): Search by industry/keyword tags (optional)
- **organization_size** (array): Filter by company size (optional)
  - Values: `1-10`, `11-50`, `25-99`, `100-499`, `500-1000`, `1000-5000`, `5000+`
- **organization_locations** (array): Filter by location (optional)
- **industry** (string): Filter by industry (optional)
- **founded_after** (integer): Founded year filter
- **founded_before** (integer): Founded year filter
- **sort_by** (string): Sort field (optional)
- **sort_direction** (string): `asc` or `desc`

**Headers:**
```
Content-Type: application/json
X-Api-Key: YOUR_API_KEY
```

---

## 3. Get Top People from a Company
**Endpoint:** `POST /api/v1/mixed_people/organization_top_people`

### Correct Payload:
```json
{
  "organization_ids": ["57c4ace7a6da9867ee5599e7"],
  "page": 1,
  "per_page": 10,
  "person_titles": ["CEO", "VP of Sales", "VP of Engineering"],
  "person_seniorities": ["vp", "c_suite", "director"],
  "contact_email_status": ["verified"],
  "sort_by": "contact_last_activity_date",
  "sort_direction": "desc"
}
```

### Parameters:
- **organization_ids** (array, **REQUIRED**): Apollo organization IDs to query
- **page** (number): Pagination page number, default 1
- **per_page** (number): Results per page, max 100
- **person_titles** (array): Filter by job titles (optional)
- **person_seniorities** (array): Filter by seniority level (optional)
- **contact_email_status** (array): Filter by email verification status
- **sort_by** (string): Sort field (optional)
- **sort_direction** (string): `asc` or `desc`

**Headers:**
```
Content-Type: application/json
X-Api-Key: YOUR_API_KEY
```

---

## 4. Enrich a Single Company
**Endpoint:** `GET /api/v1/organizations/enrich` (Query Parameters)

### Correct Payload (as URL query params):
```
GET https://api.apollo.io/api/v1/organizations/enrich?domain=stripe.com&website_url=true
```

### Parameters:
- **domain** (string, optional): Company domain (required unless passing other fields)
- **website_url** (boolean): Include website URL in response
- **reveal_email** (boolean): Reveal company email address
- **reveal_phone** (boolean): Reveal company phone number

**Headers:**
```
Content-Type: application/json
X-Api-Key: YOUR_API_KEY
```

Response Key: `organization`

---

## 5. People Enrichment
**Endpoint:** `POST /api/v1/people/enrichment`

### Correct Payload:
```json
{
  "email": "john.doe@stripe.com",
  "domain": "stripe.com",
  "reveal_personal_emails": true,
  "reveal_email_confidence_score": true
}
```

### Parameters:
- **email** (string): Email address to enrich
- **domain** (string): Company domain (optional but recommended)
- **reveal_personal_emails** (boolean): Show personal emails (optional)
- **reveal_phone_number** (boolean): Show phone number (optional)
- **reveal_email_confidence_score** (boolean): Show confidence score (optional)

**Headers:**
```
Content-Type: application/json
X-Api-Key: YOUR_API_KEY
```

---

## 6. Bulk People Enrichment
**Endpoint:** `POST /api/v1/people/bulk_enrichment`

### Correct Payload:
```json
{
  "enrichment_details": [
    {
      "email": "john.doe@stripe.com",
      "domain": "stripe.com"
    },
    {
      "email": "jane.smith@stripe.com",
      "domain": "stripe.com"
    }
  ]
}
```

---

## Common Errors & Fixes

### 422 Validation Error
**Cause:** Missing required fields or wrong data types
**Fix:** Ensure all arrays are properly formatted as JSON arrays, not comma-separated strings

### 404 Not Found
**Cause:** Invalid organization_id or endpoint not available for your API plan
**Fix:** Verify organization_id exists using `/api/v1/organizations/search` first

### 403 Forbidden
**Cause:** API key doesn't have permissions for this endpoint
**Fix:** Check your Apollo API key plan includes this endpoint

---

## Example Complete Flow: Find Decision-Makers at Stripe

```bash
# Step 1: Search for companies matching criteria
curl -X POST https://api.apollo.io/api/v1/organizations/search \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{
    "page": 1,
    "per_page": 5,
    "q_organization_keyword_tags": ["payments", "fintech"],
    "organization_size": ["500-1000", "1000-5000"]
  }'

# Step 2: Take organization IDs from response, get top people
curl -X POST https://api.apollo.io/api/v1/mixed_people/organization_top_people \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{
    "organization_ids": ["57c4ace7a6da9867ee5599e7"],
    "page": 1,
    "per_page": 10,
    "person_titles": ["CEO", "VP of Sales", "VP of Engineering"],
    "person_seniorities": ["c_suite", "vp"],
    "contact_email_status": ["verified"],
    "sort_by": "contact_last_activity_date",
    "sort_direction": "desc"
  }'
```

---

## Key Differences from Generic Examples

| Field | Apollo Uses | Generic Example Uses |
|-------|-------------|----------------------|
| Search | `q_organization_keyword_tags` (array) | `query` (string) |
| Organization ID | `organization_ids` (array) | `company` (string) |
| People Filter | `person_titles`, `person_seniorities` | `title`, `seniority` |
| Email Filter | `contact_email_status` (array) | `email` (string) |
| Pagination | `page`, `per_page` | `page`, `per_page` ✓ |
| Query Params | GET endpoints use URL params | All use JSON body |
| Array Values | Specific enums (see docs) | Free text |
