/**
 * HubSpot Private App Token client.
 * Uses the HubSpot CRM v3 REST API — no OAuth redirect required.
 * Token is stored encrypted-at-rest via integrations.apiKeyConfigured flag.
 *
 * Key endpoints used:
 *   GET  /crm/v3/oauth/access-tokens/:token  → validate & get portal info
 *   POST /crm/v3/objects/deals/search         → fetch deals with filters
 *   GET  /crm/v3/objects/contacts/:id         → fetch contact details
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

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
    /** Associated contact HubSpot ID */
    associatedContactId?: string;
    hubspot_owner_id?: string;
  };
  /** Hydrated from associated contacts */
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

export interface HubSpotPortalInfo {
  portalId: number;
  hub_id: number;
  app_id: number;
  hub_domain: string;
  token_type: string;
}

async function hubspotFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${HUBSPOT_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  return res;
}

/**
 * Validates a HubSpot Private App Token and returns portal metadata.
 * Uses the token-info endpoint which is the canonical validation method.
 */
export async function testHubspotConnection(
  apiKey: string,
): Promise<{ ok: boolean; portalId: number; hubDomain: string; error?: string }> {
  const res = await hubspotFetch(`/oauth/v1/access-tokens/${apiKey}`, apiKey);

  if (res.status === 200) {
    const data = (await res.json()) as HubSpotPortalInfo;
    return { ok: true, portalId: data.portalId ?? data.hub_id, hubDomain: data.hub_domain };
  }

  if (res.status === 401) {
    return { ok: false, portalId: 0, hubDomain: "", error: "Invalid API key — check your Private App Token" };
  }

  const body = await res.text().catch(() => "");
  return { ok: false, portalId: 0, hubDomain: "", error: `HubSpot returned ${res.status}: ${body.slice(0, 200)}` };
}

/**
 * Fetches dormant / lost deals from HubSpot using the CRM search API.
 *
 * Exclusion logic (Collateral Damage Filter):
 *   - Skips any deal where dealstage = 'closedwon'
 *   - Skips any deal whose associated contact has hs_lead_status = 'CUSTOMER'
 *
 * @param apiKey   HubSpot Private App Token
 * @param filters  Scan criteria from the UI
 */
export async function fetchDormantDeals(
  apiKey: string,
  filters: ScanFilters,
): Promise<HubSpotDeal[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - filters.inactivityDays);
  const cutoffIso = cutoffDate.toISOString();

  const filterGroups: object[] = [
    {
      filters: [
        // Not closed won
        { propertyName: "dealstage", operator: "NEQ", value: "closedwon" },
        // Last modified before the inactivity cutoff
        { propertyName: "hs_lastmodifieddate", operator: "LT", value: cutoffIso },
      ],
    },
  ];

  if (filters.minDealValue && filters.minDealValue > 0) {
    (filterGroups[0] as any).filters.push({
      propertyName: "amount",
      operator: "GTE",
      value: String(filters.minDealValue),
    });
  }

  if (filters.dealStage && filters.dealStage !== "all") {
    (filterGroups[0] as any).filters.push({
      propertyName: "dealstage",
      operator: "EQ",
      value: filters.dealStage,
    });
  }

  const body = {
    filterGroups,
    properties: [
      "dealname",
      "amount",
      "dealstage",
      "closedate",
      "closed_lost_reason",
      "hs_lastmodifieddate",
      "hs_is_closed_won",
      "hubspot_owner_id",
    ],
    associations: ["contacts"],
    limit: Math.min(filters.maxResults ?? 500, 100),
    after: 0,
  };

  const allDeals: HubSpotDeal[] = [];
  let after: number | undefined = undefined;
  const pageLimit = Math.min(filters.maxResults ?? 500, 500);

  do {
    const pageBody = after ? { ...body, after } : body;
    const res = await hubspotFetch("/crm/v3/objects/deals/search", apiKey, {
      method: "POST",
      body: JSON.stringify(pageBody),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`HubSpot deals search failed (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      results: HubSpotDeal[];
      paging?: { next?: { after: number } };
    };

    // Hydrate each deal with its first associated contact
    const hydratedDeals = await Promise.all(
      data.results.map(async (deal) => {
        const assocRes = await hubspotFetch(
          `/crm/v3/objects/deals/${deal.id}/associations/contacts`,
          apiKey,
        ).catch(() => null);

        if (!assocRes?.ok) return deal;

        const assocData = (await assocRes.json()) as { results: Array<{ id: string }> };
        const contactId = assocData.results?.[0]?.id;
        if (!contactId) return deal;

        const contactRes = await hubspotFetch(
          `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,jobtitle,company,phone,hs_lead_status,industry,numemployees`,
          apiKey,
        ).catch(() => null);

        if (!contactRes?.ok) return deal;

        const contact = (await contactRes.json()) as HubSpotContact;

        // EXCLUSION: skip contacts that are already customers
        if (contact.properties.hs_lead_status === "CUSTOMER") {
          return null;
        }

        return { ...deal, contact };
      }),
    );

    const validDeals = hydratedDeals.filter((d): d is HubSpotDeal => d !== null);
    allDeals.push(...validDeals);

    after = data.paging?.next?.after;
  } while (after && allDeals.length < pageLimit);

  return allDeals.slice(0, pageLimit);
}

/** Map HubSpot deal stage IDs to human-readable labels used in UI dropdowns */
export const HUBSPOT_STAGE_LABELS: Record<string, string> = {
  appointmentscheduled: "Appointment Scheduled",
  qualifiedtobuy: "Qualified to Buy",
  presentationscheduled: "Presentation Scheduled",
  decisionmakerboughtin: "Decision Maker Bought In",
  contractsent: "Contract Sent",
  closedwon: "Closed Won",
  closedlost: "Closed Lost",
};
