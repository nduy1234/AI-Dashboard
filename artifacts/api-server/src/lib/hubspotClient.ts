/**
 * HubSpot Private App Token client — CRM v3 REST API.
 * No OAuth redirect required; token stored server-side only.
 *
 * Endpoints used:
 *   GET  /account-info/v3/details                       → validate token + portal info
 *   POST /crm/v3/objects/deals/search                   → filter dormant/lost deals
 *   POST /crm/v3/associations/deals/contacts/batch/read → resolve deal→contact IDs (bulk)
 *   POST /crm/v3/objects/contacts/batch/read            → fetch contact details (bulk)
 *
 * The batch approach eliminates the N+1 pattern: for 100 deals it uses 3 total
 * API calls instead of 201.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanFilters {
  inactivityDays: number;
  dealStage?: string;
  minDealValue?: number;
  maxResults?: number;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    closed_lost_reason?: string;
    hs_lastmodifieddate?: string;
    hs_is_closed_won?: string;
    hubspot_owner_id?: string;
  };
  /** Hydrated from POST /crm/v3/objects/contacts/batch/read */
  contact?: HubSpotContact;
}

export interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    jobtitle?: string;
    company?: string;
    phone?: string;
    linkedinbio?: string;
    hs_lead_status?: string;
    industry?: string;
    numemployees?: string;
  };
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function hubspotFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  return res;
}

// ── Connection test ───────────────────────────────────────────────────────────

/**
 * Validates a HubSpot Private App Token via GET /account-info/v3/details.
 * The OAuth /oauth/v1/access-tokens endpoint rejects Private App Tokens;
 * this endpoint accepts any valid token type.
 */
export async function testHubspotConnection(
  apiKey: string,
): Promise<{ ok: boolean; portalId: number; hubDomain: string; error?: string }> {
  const res = await hubspotFetch("/account-info/v3/details", apiKey);

  if (res.status === 200) {
    const data = (await res.json()) as { portalId?: number; uiDomain?: string };
    return { ok: true, portalId: data.portalId ?? 0, hubDomain: data.uiDomain ?? "" };
  }
  if (res.status === 401) {
    return { ok: false, portalId: 0, hubDomain: "", error: "Invalid or revoked Private App Token" };
  }
  if (res.status === 403) {
    return {
      ok: false, portalId: 0, hubDomain: "",
      error: "Token lacks required scopes — enable crm.objects.deals.read and crm.objects.contacts.read on the Private App",
    };
  }
  const body = await res.text().catch(() => "");
  return { ok: false, portalId: 0, hubDomain: "", error: `HubSpot ${res.status}: ${body.slice(0, 200)}` };
}

// ── Deals search ──────────────────────────────────────────────────────────────

interface DealSearchResult {
  id: string;
  properties: HubSpotDeal["properties"];
}

interface DealSearchResponse {
  results: DealSearchResult[];
  paging?: { next?: { after: string } };
}

/**
 * POST /crm/v3/objects/deals/search
 * Returns up to `pageLimit` deals matching the dormancy filters.
 * Paginates automatically using the cursor returned in paging.next.after.
 */
async function searchDeals(
  apiKey: string,
  filters: ScanFilters,
): Promise<DealSearchResult[]> {
  const cutoffIso = new Date(
    Date.now() - filters.inactivityDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const baseFilters: object[] = [
    { propertyName: "dealstage", operator: "NEQ", value: "closedwon" },
  ];

  // Use closedate for closed-lost deals (semantic: how long since it was lost).
  // For open/stalled deals fall back to hs_lastmodifieddate.
  if (filters.inactivityDays > 0) {
    const isClosedLostStage =
      filters.dealStage === "closedlost" || !filters.dealStage;
    const dateProperty = isClosedLostStage ? "closedate" : "hs_lastmodifieddate";
    baseFilters.push({ propertyName: dateProperty, operator: "LT", value: cutoffIso });
  }

  if (filters.minDealValue && filters.minDealValue > 0) {
    baseFilters.push({ propertyName: "amount", operator: "GTE", value: String(filters.minDealValue) });
  }
  if (filters.dealStage && filters.dealStage !== "all" && filters.dealStage !== "") {
    baseFilters.push({ propertyName: "dealstage", operator: "EQ", value: filters.dealStage });
  }

  const pageLimit = Math.min(filters.maxResults ?? 500, 500);
  const allDeals: DealSearchResult[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: baseFilters }],
      properties: [
        "dealname",
        "amount",
        "dealstage",
        "closedate",
        "closed_lost_reason",
        "hs_lastmodifieddate",
        "hs_is_closed_won",
        "hubspot_owner_id",
        "pipeline",
      ],
      limit: Math.min(100, pageLimit - allDeals.length),
    };
    if (after) body.after = after;

    const res = await hubspotFetch("/crm/v3/objects/deals/search", apiKey, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`POST /crm/v3/objects/deals/search → ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as DealSearchResponse;
    allDeals.push(...data.results);
    after = data.paging?.next?.after;
  } while (after && allDeals.length < pageLimit);

  return allDeals.slice(0, pageLimit);
}

// ── Bulk association resolution ───────────────────────────────────────────────

/**
 * POST /crm/v3/associations/deals/contacts/batch/read
 * Resolves deal IDs → contact IDs in a single call (up to 1000 inputs per call).
 * Returns a map of dealId → first associated contactId.
 */
async function batchReadDealContactAssociations(
  apiKey: string,
  dealIds: string[],
): Promise<Map<string, string>> {
  const dealToContact = new Map<string, string>();
  if (dealIds.length === 0) return dealToContact;

  // HubSpot batch limit: 1000 per call
  const BATCH = 1000;
  for (let i = 0; i < dealIds.length; i += BATCH) {
    const slice = dealIds.slice(i, i + BATCH);
    const res = await hubspotFetch(
      "/crm/v3/associations/deals/contacts/batch/read",
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({ inputs: slice.map((id) => ({ id })) }),
      },
    );

    if (!res.ok) {
      // Non-fatal: if associations call fails we just skip contacts for this batch
      console.warn(`[HubSpot] associations batch failed (${res.status}) — contacts will be missing for ${slice.length} deals`);
      continue;
    }

    const data = (await res.json()) as {
      results: Array<{ from: { id: string }; to: Array<{ id: string }> }>;
    };

    for (const row of data.results) {
      if (row.to.length > 0 && row.from?.id) {
        dealToContact.set(row.from.id, row.to[0]!.id);
      }
    }
  }

  return dealToContact;
}

// ── Bulk contact fetch ────────────────────────────────────────────────────────

const CONTACT_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "jobtitle",
  "company",
  "phone",
  "hs_lead_status",
  "industry",
  "numemployees",
];

/**
 * POST /crm/v3/objects/contacts/batch/read
 * Fetches full contact records for up to 100 IDs per call.
 * Returns a map of contactId → HubSpotContact.
 */
async function batchReadContacts(
  apiKey: string,
  contactIds: string[],
): Promise<Map<string, HubSpotContact>> {
  const contactMap = new Map<string, HubSpotContact>();
  if (contactIds.length === 0) return contactMap;

  // HubSpot batch/read limit: 100 per call
  const BATCH = 100;
  for (let i = 0; i < contactIds.length; i += BATCH) {
    const slice = contactIds.slice(i, i + BATCH);
    const res = await hubspotFetch("/crm/v3/objects/contacts/batch/read", apiKey, {
      method: "POST",
      body: JSON.stringify({
        inputs: slice.map((id) => ({ id })),
        properties: CONTACT_PROPERTIES,
      }),
    });

    if (!res.ok) {
      console.warn(`[HubSpot] contacts batch/read failed (${res.status}) for ${slice.length} contacts`);
      continue;
    }

    const data = (await res.json()) as { results: HubSpotContact[] };
    for (const contact of data.results) {
      contactMap.set(contact.id, contact);
    }
  }

  return contactMap;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches dormant / lost deals from HubSpot using three efficient bulk calls:
 *
 *  1. POST /crm/v3/objects/deals/search          — get filtered deals
 *  2. POST /crm/v3/associations/deals/contacts/  — resolve all deal→contact IDs
 *        batch/read                                 in one request
 *  3. POST /crm/v3/objects/contacts/batch/read   — fetch all contact details
 *                                                   in batches of 100
 *
 * Collateral Damage exclusions (applied before returning):
 *   - dealstage = closedwon  (filtered at search level)
 *   - contact hs_lead_status = CUSTOMER  (filtered after contact hydration)
 */
export async function fetchDormantDeals(
  apiKey: string,
  filters: ScanFilters,
): Promise<HubSpotDeal[]> {
  // Step 1 — search deals
  const deals = await searchDeals(apiKey, filters);
  if (deals.length === 0) return [];

  const dealIds = deals.map((d) => d.id);

  // Step 2 — bulk-resolve deal → contact associations
  const dealToContact = await batchReadDealContactAssociations(apiKey, dealIds);

  const contactIds = [...new Set(dealToContact.values())];

  // Step 3 — bulk-fetch all contact details
  const contactMap = await batchReadContacts(apiKey, contactIds);

  // Assemble results, applying the customer exclusion filter
  const results: HubSpotDeal[] = [];
  for (const deal of deals) {
    const contactId = dealToContact.get(deal.id);
    if (!contactId) {
      // No associated contact — include deal without contact data
      results.push(deal);
      continue;
    }

    const contact = contactMap.get(contactId);
    if (!contact) {
      results.push(deal);
      continue;
    }

    // COLLATERAL DAMAGE FILTER: skip existing customers
    if (contact.properties.hs_lead_status === "CUSTOMER") {
      continue;
    }

    results.push({ ...deal, contact });
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map HubSpot deal stage IDs to human-readable labels for UI dropdowns */
export const HUBSPOT_STAGE_LABELS: Record<string, string> = {
  appointmentscheduled: "Appointment Scheduled",
  qualifiedtobuy:       "Qualified to Buy",
  presentationscheduled: "Presentation Scheduled",
  decisionmakerboughtin: "Decision Maker Bought In",
  contractsent:         "Contract Sent",
  closedwon:            "Closed Won",
  closedlost:           "Closed Lost",
};
