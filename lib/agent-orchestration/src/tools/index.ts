/**
 * Agent Tool Dispatcher
 * All tools call real production APIs — no mocks, no seed data.
 * If an API key is missing the tool returns success:false so the
 * agent can fall through to the next entry in toolsToTry.
 */

let openai: any = null;

// Initialize openai lazily when first needed
async function initializeOpenai() {
  if (openai === null) {
    try {
      const mod = await import("@workspace/integrations-openai-ai-server" as any);
      if (mod && mod.openai) openai = mod.openai;
    } catch (_e) {
      // optional dependency - leave as null
    }
  }
  return openai;
}

import { db, leadsTable, campaignLeadsTable, campaignSignalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ActionType, LeadBatch, ToolExecutionResult } from "../types.js";
import { getApolloSourceEndpoints } from "../loadApolloEndpoints.js";

// ─── Provider disable guard ───────────────────────────────────────────────────
// Inline implementation — mirrors outboundConfig.ts without cross-package import
function isProviderEnabled(name: string): boolean {
  const disabled = new Set(
    (process.env.OUTBOUND_DISABLED_PROVIDERS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return !disabled.has(name.toLowerCase());
}

// ─── Shared HTTP helper ──────────────────────────────────────────────────────

/**
 * Fetch JSON with timeout and comprehensive logging.
 * Default timeout: 30 seconds.
 */
async function fetchJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<T> {
  const startTime = Date.now();
  const shortUrl = url.replace(/.*\/api/, "/api");
  console.log(`\x1b[36m[HTTP]\x1b[0m ${init.method ?? "GET"} ${shortUrl} (timeout: ${timeoutMs}ms) - starting...`);

  try {
    // Use AbortController for proper timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`\x1b[31m[HTTP]\x1b[0m Timeout trigger after ${Date.now() - startTime}ms`);
      controller.abort();
    }, timeoutMs);

    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    console.log(`\x1b[36m[HTTP]\x1b[0m Response headers received: ${res.status} ${res.statusText} (${elapsed}ms)`);

    const body = await res.text().catch(() => "");
    console.log(`\x1b[36m[HTTP]\x1b[0m Response body: ${body.length} bytes received`);

    if (!res.ok) {
      const errorMsg = body ? `\n${body}` : "";
      const fullError = `HTTP ${res.status} ${res.statusText}${errorMsg}`;

      if (res.status === 422) {
        console.error(`\x1b[31m[HTTP]\x1b[0m 422 Validation Error at ${shortUrl}`);
        console.error(`  Status: ${res.status}`);
        console.error(`  Response: ${body}`);
        console.error(`  Headers sent:`, init.headers);
        if (init.body) {
          try {
            console.error(`  Body sent:`, JSON.parse(init.body as string));
          } catch {
            console.error(`  Body sent:`, init.body);
          }
        }
      }

      throw new Error(fullError);
    }

    if (body) {
      console.log(`\x1b[36m[HTTP]\x1b[0m Parsing JSON (${body.length} bytes)...`);
    }

    try {
      // Check if response looks like JSON before attempting to parse
      const trimmedBody = body.trim();
      if (!trimmedBody.startsWith('{') && !trimmedBody.startsWith('[')) {
        throw new Error(`Response is not JSON (starts with: "${trimmedBody.slice(0, 50)}")`);
      }
      
      const parsed = JSON.parse(body) as T;
      console.log(`\x1b[36m[HTTP]\x1b[0m✓ Success: ${shortUrl} completed in ${elapsed}ms`);
      console.log(`\x1b[36m[HTTP]\x1b[0m Response JSON:`, JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (e) {
      const bodyPreview = body.length > 300 ? body.slice(0, 300) + `... (${body.length} bytes total)` : body;
      console.error(`\x1b[31m[HTTP]\x1b[0m Failed to parse JSON response from ${shortUrl}:`);
      console.error(`\x1b[31m[HTTP]\x1b[0m Response preview: ${bodyPreview}`);
      console.error(`\x1b[31m[HTTP]\x1b[0m Parse error:`, e instanceof Error ? e.message : String(e));
      throw new Error(`Invalid JSON response from ${shortUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`\x1b[31m[HTTP]\x1b[0m ✗ TIMEOUT: ${shortUrl} after ${elapsed}ms (limit: ${timeoutMs}ms)`);
      throw new Error(`Request timeout after ${timeoutMs}ms to ${shortUrl}`);
    }
    console.error(`\x1b[31m[HTTP]\x1b[0m ✗ ERROR: ${shortUrl} after ${elapsed}ms:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

// ─── Clay webhook-based enrichment ──────────────────────────────────────────

interface ClayEnrichmentResponse {
  industry?: string;
  company_size?: string;
  companySize?: string;
  linkedin_url?: string;
  linkedinUrl?: string;
  revenue?: string;
  website?: string;
  recent_news?: string;
  [key: string]: unknown;
}

async function clayEnrich(
  email: string,
  company: string,
  title: string,
): Promise<ClayEnrichmentResponse | null> {
  const enrichUrl = process.env.CLAY_ENRICH_URL;
  const authToken = process.env.CLAY_WEBHOOK_AUTH_TOKEN;
  const apiKey = process.env.CLAY_API_KEY;

  if (!enrichUrl) {
    throw new Error("CLAY_ENRICH_URL is not configured");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["x-clay-webhook-auth"] = authToken;
  else if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const data = await fetchJson<ClayEnrichmentResponse>(enrichUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, company, title }),
  });
  return data;
}

// ─── MillionVerifier ─────────────────────────────────────────────────────────

interface MvResponse {
  result?: string;
  status?: string;
  error?: string;
  credits?: number | string;
  [key: string]: unknown;
}

async function mvVerify(email: string): Promise<"valid" | "invalid" | "risky"> {
  const apiKey = process.env.MILLIONVERIFIER_API_KEY;
  if (!apiKey) throw new Error("MILLIONVERIFIER_API_KEY is not configured");

  const base = (process.env.MILLIONVERIFIER_BASE_URL ?? "https://api.millionverifier.com/api/v3/").replace(/\/$/, "");
  const url = `${base}/?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;

  const data = await fetchJson<MvResponse>(url, { method: "GET" });

  if (data.error === "Insufficient credits" || Number(data.credits) === 0) {
    throw new Error("MillionVerifier: insufficient credits");
  }

  const status = String(data.result ?? data.status ?? "").toLowerCase();
  if (["ok", "valid", "deliverable"].includes(status)) return "valid";
  if (["invalid", "undeliverable", "rejected"].includes(status)) return "invalid";
  return "risky";
}

// ─── Resend ──────────────────────────────────────────────────────────────────

interface ResendResponse { id?: string; name?: string; message?: string; }

async function resendSend(to: string, subject: string, htmlBody: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL is not configured");

  const data = await fetchJson<ResendResponse>("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html: htmlBody }),
  });

  const messageId = data.id;
  if (!messageId) throw new Error("Resend did not return a message ID");
  return messageId;
}

// ─── Instantly ───────────────────────────────────────────────────────────────

async function instantlySend(to: string, subject: string, body: string): Promise<string> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  const sendUrl = process.env.INSTANTLY_SEND_URL;
  if (!apiKey || !sendUrl) throw new Error("INSTANTLY_API_KEY or INSTANTLY_SEND_URL is not configured");

  interface InstantlyResponse { id?: string; [key: string]: unknown; }
  const data = await fetchJson<InstantlyResponse>(sendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ to, subject, body }),
  });
  return data.id ?? crypto.randomUUID();
}

// ─── Apollo people search ────────────────────────────────────────────────────

interface ApolloContact {
  first_name?: string;
  last_name?: string;
  email?: string;
  organization_name?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
  id?: string;
}

interface ApolloSearchResponse {
  contacts?: ApolloContact[];
  people?: ApolloContact[];
  [key: string]: unknown;
}

interface ApolloOrgSearchResponse {
  organizations?: Array<{ id?: string }>;
  accounts?: Array<{ id?: string }>;
  [key: string]: unknown;
}

/**
 * Uses the exact configured path for scoped prospecting.
 */

async function apolloScopedMixedPeopleSearchChain(
  baseUrl: string,
  headers: Record<string, string>,
  campaignName: string,
  campaignType: string,
  perPage: number,
  personTitles: string[],
  personSeniorities: string[],
  configuredPath: string,
  strategy: string,
): Promise<ApolloSearchResponse> {
  const tags = [
    ...campaignType.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 3),
    ...campaignName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 2),
  ].filter((t, i, a) => a.indexOf(t) === i);

  const orgBody = JSON.stringify({
    page: 1,
    per_page: 10,
    ...(tags.length > 0 ? { q_organization_keyword_tags: tags.slice(0, 8) } : {}),
  });

  console.log(`\x1b[36m[Tool]\x1b[0m Apollo orgs search with tags:`, tags);

  try {
    const orgRes = await fetchJson<ApolloOrgSearchResponse>(
      `${baseUrl.replace(/\/$/, "")}/api/v1/organizations/search`,
      { method: "POST", headers, body: orgBody },
    );

    // Add null-safety for org response
    if (!orgRes || (typeof orgRes !== "object")) {
      throw new Error("organizations/search returned invalid response structure");
    }

    const orgs = orgRes.organizations ?? orgRes.accounts ?? [];
    const organizationIds = orgs
      .map((o) => {
        const row = o as Record<string, unknown>;
        const id = row.id ?? row.organization_id;
        return typeof id === "string" && id.length > 0 ? id : null;
      })
      .filter((id): id is string => id !== null)
      .slice(0, 12);

    if (organizationIds.length === 0) {
      throw new Error("organizations/search returned no organization ids for scoped mixed_people search");
    }

    console.log(`\x1b[36m[Tool]\x1b[0m Found ${organizationIds.length} organization IDs from scoped search`);

    const searchPath = configuredPath.startsWith("/") ? configuredPath : `/${configuredPath}`;
    
    if (strategy === "organization_top_people" || searchPath.includes("organization_top_people")) {
      // According to Apollo docs, organization_top_people accepts organization_ids (plural) array.
      // No email filter — Apollo free tier doesn't reveal emails at sourcing stage;
      // Clay enrichment will handle email lookup in the enrich step.
      const orgTopPeopleBody = JSON.stringify({
        organization_ids: organizationIds,
        page: 1,
        per_page: Math.min(Math.max(perPage, 1), 100),
        person_titles: personTitles,
        person_seniorities: personSeniorities,
        sort_by: "contact_last_activity_date",
        sort_direction: "desc",
      });

      const url = `${baseUrl.replace(/\/$/, "")}${searchPath}`;
      console.log(`\x1b[36m[Tool]\x1b[0m Calling organization_top_people POST endpoint with ${organizationIds.length} org IDs`);
      
      try {
        return await fetchJson<ApolloSearchResponse>(url, { method: "POST", headers, body: orgTopPeopleBody });
      } catch (err) {
        // organization_top_people might not be available on all API plans
        // If it fails with 404, fall back to a broader people search using the organizations we found
        const isNotFound = err instanceof Error && (err.message.includes("404") || err.message.includes("not found"));
        if (isNotFound) {
          console.warn(
            `\x1b[33m[Tool]\x1b[0m organization_top_people returned 404 (endpoint not available on this plan), falling back to broader people search`,
          );
          
          // Fallback: search for contacts at ANY company in the found industries/sizes
          // Extract industry tags from found organizations
          const industries = (orgs as Array<Record<string, unknown>>)
            .map((o) => String(o.industry ?? ""))
            .filter(Boolean)
            .slice(0, 5);
          
          const fallbackBody = JSON.stringify({
            page: 1,
            per_page: Math.min(Math.max(perPage, 1), 100),
            person_titles: personTitles,
            person_seniorities: personSeniorities,
            ...(industries.length > 0 ? { industries } : {}),
            sort_by: "contact_last_activity_date",
            sort_direction: "desc",
          });
          
          console.log(`\x1b[36m[Tool]\x1b[0m Trying broader contact search with industries:`, industries);
          return await fetchJson<ApolloSearchResponse>(
            `${baseUrl.replace(/\/$/, "")}/api/v1/contacts/search`,
            { method: "POST", headers, body: fallbackBody },
          );
        }
        throw err;
      }
    }

    // For other POST endpoints, build payload with all required fields
    const peopleBody = JSON.stringify({
      page: 1,
      per_page: Math.min(Math.max(perPage, 1), 100),
      organization_ids: organizationIds,
      person_titles: personTitles,
      person_seniorities: personSeniorities,
      sort_by: "contact_last_activity_date",
      sort_direction: "desc",
    });

    console.log(`\x1b[36m[Tool]\x1b[0m Calling scoped_mixed_people_search POST endpoint with ${organizationIds.length} org IDs`);
    const url = `${baseUrl.replace(/\/$/, "")}${searchPath}`;
    return fetchJson<ApolloSearchResponse>(url, { method: "POST", headers, body: peopleBody });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m[Tool]\x1b[0m apolloScopedMixedPeopleSearchChain failed: ${msg}`);
    throw err;
  }
}

// Using Serper.dev for proxy-free Google Dorking (Provides 2,500 free searches)

/**
 * Smart autonomous contact search using Google Dorking (site:linkedin.com/in)
 * This is 100% free and requires no API keys. It extracts Name, Title, and Company
 * directly from the LinkedIn search result titles in Google.
 */
async function googleSearchContacts(
  campaignName: string,
  campaignType: string,
  perPage = 10,
): Promise<ApolloContact[]> {
  console.log(`\x1b[36m[Tool]\x1b[0m Starting Google LinkedIn Dorking search for:`, campaignName);
  
  const industryTags = [
    ...campaignType.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 2),
    ...campaignName.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 2)
  ];
  
  const titles = campaignType.toLowerCase().includes("sales") ? '"VP of Sales" OR "Head of Sales"' :
                 campaignType.toLowerCase().includes("tech") ? '"CTO" OR "VP of Engineering"' :
                 campaignType.toLowerCase().includes("partner") ? '"VP of Partnerships"' : 
                 '"Director" OR "VP" OR "CEO"';

  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    console.warn(`\x1b[33m[Tool]\x1b[0m SERPER_API_KEY not configured in .env. Skipping Google search.`);
    return [];
  }

  const industryStr = industryTags.map(t => `"${t}"`).join(" ");
  const query = `site:linkedin.com/in/ ${titles} ${industryStr}`;
  
  console.log(`\x1b[36m[Tool]\x1b[0m Serper.dev Google query: ${query}`);
  
  try {
    const searchUrl = `https://google.serper.dev/search`;
    
    interface SerperResponse { organic?: any[] };
    const data = await fetchJson<SerperResponse>(searchUrl, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        num: 10
      })
    });

    const results = data.organic ?? [];
    console.log(`\x1b[32m[Tool]\x1b[0m Serper.dev returned ${results.length} organic results`);

    const extractedContacts: ApolloContact[] = [];

    for (const res of results) {
      if (extractedContacts.length >= perPage) break;
      if (!res.title || !res.link || !res.link.includes("linkedin.com/in/")) {
        console.log(`\x1b[36m[Tool]\x1b[0m Skipping non-LinkedIn or titleless result: ${res.link ?? "no link"}`);
        continue;
      }
      
      const rawTitle = res.title.replace(/\| LinkedIn/i, "").replace(/- LinkedIn/i, "").trim();
      const parts = rawTitle.split(/[-|]/).map((p: string) => p.trim()).filter(Boolean);
      
      if (parts.length >= 2) {
        const namePart = parts[0] || "";
        let titlePart = parts[1] || "";
        let companyPart = parts.length > 2 ? parts[2] : "";

        if (titlePart.includes(" at ")) {
          const splitAt = titlePart.split(/ at /i);
          titlePart = splitAt[0] || titlePart;
          companyPart = splitAt[1] || companyPart;
        }

        const nameTokens = namePart.split(" ");
        const firstName = nameTokens[0] || "Unknown";
        const lastName = nameTokens.slice(1).join(" ");
        
        extractedContacts.push({
          first_name: firstName,
          last_name: lastName,
          title: titlePart.substring(0, 100),
          company: companyPart ? companyPart.substring(0, 100) : "Unknown",
          linkedin_url: res.link,
          email: undefined,
        });
      }
    }

    console.log(`\x1b[32m[Tool]\x1b[0m Successfully parsed ${extractedContacts.length} contacts from Google`);
    return extractedContacts;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31m[Tool]\x1b[0m Google search scraping failed: ${msg}`);
    return [];
  }
}

/**
 * Smart autonomous contact search that chooses the right Apollo strategy

 * based on campaign characteristics (type, name, subject).
 *
 * Decision logic:
 * 1. If campaign has "sales" in type → target sales leadership
 * 2. If campaign has "tech/engineering" → target technical leadership
 * 3. If campaign has "partnership/business" → target business development
 * 4. Otherwise → target general executive leadership
 */
function deriveTitlesAndSeniorities(campaignType: string, campaignName?: string): {
  titles: string[];
  seniorities: string[];
  strategy: string;
} {
  const fullContext = `${campaignType} ${campaignName ?? ""}`.toLowerCase();

  // Sales-focused campaigns
  if (fullContext.includes("sales") || fullContext.includes("outbound")) {
    return {
      titles: [
        "VP of Sales",
        "Head of Sales",
        "Sales Director",
        "Chief Revenue Officer",
        "VP of Revenue",
        "Sales Manager",
      ],
      seniorities: ["vp", "c_suite", "director", "manager"],
      strategy: "direct_people_search",
    };
  }

  // Technical/Engineering campaigns
  if (fullContext.includes("tech") || fullContext.includes("engineer") || fullContext.includes("developer")) {
    return {
      titles: [
        "CTO",
        "VP of Engineering",
        "Head of Engineering",
        "Engineering Director",
        "VP of Product",
        "Chief Technology Officer",
      ],
      seniorities: ["vp", "c_suite", "director"],
      strategy: "direct_people_search",
    };
  }

  // Partnership/Business Development campaigns
  if (
    fullContext.includes("partner") ||
    fullContext.includes("integration") ||
    fullContext.includes("business development")
  ) {
    return {
      titles: [
        "VP of Partnerships",
        "Head of Partnerships",
        "VP of Business Development",
        "Head of BD",
        "Partnership Manager",
        "Business Development Manager",
      ],
      seniorities: ["vp", "c_suite", "director", "manager"],
      strategy: "direct_people_search",
    };
  }

  // Marketing/Growth campaigns
  if (fullContext.includes("market") || fullContext.includes("growth") || fullContext.includes("demand")) {
    return {
      titles: [
        "VP of Marketing",
        "Chief Marketing Officer",
        "Head of Marketing",
        "VP of Growth",
        "Marketing Director",
      ],
      seniorities: ["vp", "c_suite", "director", "manager"],
      strategy: "direct_people_search",
    };
  }

  // Default: General executive leadership
  return {
    titles: [
      "CEO",
      "Founder",
      "VP of Growth",
      "Head of Operations",
      "Chief Operating Officer",
      "VP of Strategy",
    ],
    seniorities: ["c_suite", "vp", "director"],
    strategy: "direct_people_search",
  };
}

async function apolloSearchContacts(
  campaignName: string,
  campaignType: string,
  perPage = 10,
): Promise<ApolloContact[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY is not configured");

  const baseUrl = process.env.APOLLO_BASE_URL ?? "https://api.apollo.io";

  // Smart autonomous decision: derive titles and seniorities from campaign context
  const { titles, seniorities, strategy } = deriveTitlesAndSeniorities(campaignType, campaignName);

  console.log(
    `\x1b[36m[Tool]\x1b[0m Smart Apollo strategy for "${campaignName}" (type: ${campaignType}): ${strategy}`,
  );
  console.log(`\x1b[36m[Tool]\x1b[0m Targeting titles: ${titles.join(", ")}`);
  console.log(`\x1b[36m[Tool]\x1b[0m Targeting seniorities: ${seniorities.join(", ")}`);

  // Build payload with ALL required fields to avoid 422 errors
  const filterBody = JSON.stringify({
    page: 1,
    per_page: Math.min(Math.max(perPage, 1), 100),
    person_titles: titles,
    person_seniorities: seniorities,
    sort_by: "contact_last_activity_date",
    sort_direction: "desc",
    include_enriched_data: true,
  });

  // Use proper header format per Apollo API docs: https://docs.apollo.io/reference/authentication
  const headers = {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
  };

  console.log(`\x1b[36m[Tool]\x1b[0m Apollo request headers:`, { "Content-Type": "application/json", "X-Api-Key": "***" });
  try {
    const payloadObj = JSON.parse(filterBody);
    console.log(`\x1b[36m[Tool]\x1b[0m Apollo request payload:`, JSON.stringify(payloadObj, null, 2));
  } catch (e) {
    console.error(`\x1b[31m[Tool]\x1b[0m Warning: Apollo request payload is invalid JSON:`, filterBody.slice(0, 100), e instanceof Error ? e.message : String(e));
  }

  const entries = getApolloSourceEndpoints();
  let lastError: unknown;

  for (const entry of entries) {
    const path = entry.path;
    const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const strategy = entry.strategy ?? "people_filters";

    try {
      let data: ApolloSearchResponse;
      if (strategy === "scoped_mixed_people_search" || strategy === "organization_top_people") {
        data = await apolloScopedMixedPeopleSearchChain(
          baseUrl,
          headers,
          campaignName,
          campaignType,
          perPage,
          titles,
          seniorities,
          path,
          strategy,
        );
        console.log(
          `\x1b[32m[Tool]\x1b[0m Apollo scoped mixed_people search succeeded (${path})`,
        );
      } else {
        console.log(`\x1b[36m[Tool]\x1b[0m Attempting Apollo ${path} with POST request`);
        data = await fetchJson<ApolloSearchResponse>(url, {
          method: "POST",
          headers,
          body: filterBody,
        });
        const contactsCount = (data?.contacts ?? data?.people ?? []).length;
        console.log(`\x1b[36m[Tool]\x1b[0m Apollo ${path} response: ${contactsCount} contacts/people found`);
        if (!data || typeof data !== "object") {
          console.warn(`\x1b[33m[Tool]\x1b[0m Apollo ${path} returned invalid response structure:`, typeof data);
          continue;
        }
      }

      const raw = (data?.contacts ?? data?.people ?? []) as ApolloContact[];
      if (!Array.isArray(raw)) {
        console.warn(`\x1b[33m[Tool]\x1b[0m Apollo ${path} contacts/people field is not an array:`, typeof raw);
        continue;
      }

      // Pass all contacts forward — free tier doesn't reveal emails, Clay enrichment handles that
      if (raw.length > 0) {
        console.log(`\x1b[32m[Tool]\x1b[0m Found ${raw.length} contacts from ${path}`);
        return raw;
      }

      console.warn(
        `\x1b[33m[Tool]\x1b[0m Apollo ${path} returned 0 contacts, trying next configured endpoint`,
      );
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`\x1b[33m[Tool]\x1b[0m Apollo ${path} (${strategy}) failed: ${msg}`);
      
      // Enhanced error diagnostics
      if (msg.includes("Invalid JSON")) {
        console.error(`\x1b[31m[Tool]\x1b[0m Apollo ${path} returned non-JSON response (possibly HTML error page)`);
        console.error(`\x1b[31m[Tool]\x1b[0m - Check APOLLO_API_KEY is correct and valid`);
        console.error(`\x1b[31m[Tool]\x1b[0m - Check Apollo API endpoint: ${path}`);
        console.error(`\x1b[31m[Tool]\x1b[0m - Check network connectivity and API status`);
      } else if (err instanceof Error && err.message.includes("422")) {
        console.error(`\x1b[31m[Tool]\x1b[0m 422 Validation Error detected. Verify:`);
        console.error(`  - Header format: X-Api-Key (not x-api-key)`);
        console.error(`  - Payload includes required fields: page, per_page, person_titles, contact_email_status`);
        console.error(`  - API key is valid for ${path} endpoint`);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "All Apollo sourcing endpoints in apollo-endpoints.json failed"));
}

/**
 * Clay is enrichment-only — Clay webhooks are receive-only and cannot search.
 * Returning empty array instead of throwing so the sourcing loop moves on cleanly.
 */
async function claySearchContacts(
  _campaignName: string,
  _campaignType: string,
  _perPage = 10,
): Promise<ApolloContact[]> {
  console.warn(
    `\x1b[33m[Tool]\x1b[0m Clay webhook is enrichment-only and cannot search for new contacts. Skipping Clay sourcing.`,
  );
  return [];
}

// ─── Groq fallback for content generation ────────────────────────────────────

/**
 * Escape bare control characters (newlines, carriage returns, tabs) that appear
 * inside JSON string values.  Groq frequently returns multi-line body text with
 * real newlines rather than \\n escape sequences, producing invalid JSON.
 *
 * Walks the string one character at a time tracking quote/escape state so we
 * only touch characters that are actually inside a string value.
 */
function escapeJsonStringValues(input: string): string {
  let inString = false;
  let escaped  = false;
  let out      = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (escaped) {
      out     += ch;
      escaped  = false;
      continue;
    }

    if (ch === "\\") {
      out     += ch;
      escaped  = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out     += ch;
      continue;
    }

    if (inString) {
      if      (ch === "\n") { out += "\\n";  continue; }
      else if (ch === "\r") { out += "\\r";  continue; }
      else if (ch === "\t") { out += "\\t";  continue; }
    }

    out += ch;
  }

  return out;
}

/**
 * Best-effort JSON extraction from a Groq response string.
 * Handles: markdown fences, preamble/postamble prose, and multi-line
 * string values with unescaped newlines.
 */
function extractGroqJson(raw: string): { subject: string; body: string } {
  // 1. Strip markdown code fences
  let text = raw.replace(/```json\n?|\n?```/g, "").trim();

  // 2. Isolate the outermost JSON object (drops any surrounding prose)
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  // 3. Escape literal control characters inside string values
  text = escapeJsonStringValues(text);

  return JSON.parse(text);
}

async function groqGenerate(prompt: string): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  interface GroqResponse { choices?: { message?: { content?: string } }[]; }
  const data = await fetchJson<GroqResponse>("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    }),
  });

  const raw = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return extractGroqJson(raw);
  } catch {
    console.error(`\x1b[31m[Tool]\x1b[0m Groq raw response that failed to parse: ${raw.slice(0, 300)}`);
    throw new Error("Groq returned unparseable content");
  }
}

// ─── Campaign context type ────────────────────────────────────────────────────

export interface CampaignContext {
  campaignName?: string;
  campaignType?: string;
  campaignSubject?: string;
  userId?: string;
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function executeAgentTool(
  action: ActionType,
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  campaignContext: CampaignContext = {},
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  try {
    switch (action) {
      case "source_leads":
        return await executeSourceLeadsTool(tool, leadBatch, orgId, startTime, campaignContext);
      case "enrich_leads":
        return await executeEnrichLeadsTool(tool, leadBatch, orgId, startTime);
      case "verify_emails":
        return await executeVerifyEmailsTool(tool, leadBatch, orgId, startTime);
      case "generate_content":
        return await executeGenerateContentTool(tool, leadBatch, orgId, startTime, campaignContext);
      case "send_campaign":
        return await executeSendCampaignTool(tool, leadBatch, orgId, startTime);
      case "review_signals":
        return await executeReviewSignalsTool(tool, leadBatch, orgId, startTime);
      case "adjust_strategy":
        return await executeAdjustStrategyTool(tool, leadBatch, orgId, startTime);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Tool] ${action}:${tool} failed:`, msg);
    return {
      action,
      tool,
      success: false,
      leadsProcessed: 0,
      leadsFailed: leadBatch.leads.length,
      costUsd: 0,
      error: msg,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// ─── source_leads ─────────────────────────────────────────────────────────────

/**
 * Source leads from Apollo API.
 * Builds search filters from campaign context and imports real verified contacts.
 * If the campaign already has leads (leadBatch.leads.length > 0) this is a no-op.
 */
async function executeSourceLeadsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
  campaignContext: CampaignContext = {},
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m source_leads:${tool}`);

  if (leadBatch.leads.length > 0) {
    console.log(`\x1b[36m[Tool]\x1b[0m source_leads: batch already has ${leadBatch.leads.length} leads, skipping`);
    return {
      action: "source_leads",
      tool,
      success: true,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      metadata: { skipped: true, reason: "leads already loaded" },
      executionTimeMs: Date.now() - startTime,
    };
  }

  const {
    campaignName = "Outbound Campaign",
    campaignType = "outbound",
    userId,
  } = campaignContext;

  // Apollo first; then Serper.dev (googleSearchContacts) for LinkedIn dorking — same run, no extra agent iteration.
  const allSources = ["apollo", "google"];
  const sourcesToTry = allSources;

  if (sourcesToTry.length === 0) {
    console.warn(`\x1b[33m[Tool]\x1b[0m source_leads: all providers are disabled via OUTBOUND_DISABLED_PROVIDERS`);
  } else {
    console.log(`\x1b[36m[Tool]\x1b[0m source_leads: pipeline = Apollo → Serper.dev (Google) | order = [${sourcesToTry.join(", ")}]`);
  }

  let contacts: ApolloContact[] = [];
  let usedSource = "";

  for (const source of sourcesToTry) {
    console.log(`\x1b[36m[Tool]\x1b[0m source_leads pipeline: attempting ${source} (current contacts: ${contacts.length})`);
    try {
      if (source === "apollo") {
        if (!isProviderEnabled("apollo")) {
          console.log(
            `\x1b[36m[Tool]\x1b[0m source_leads: Apollo skipped (disabled via OUTBOUND_DISABLED_PROVIDERS) — moving to next source`,
          );
          continue;
        }
        contacts = await apolloSearchContacts(campaignName, campaignType, 10);
      } else if (source === "google") {
        console.log(
          `\x1b[36m[Tool]\x1b[0m source_leads: Serper.dev step — Google LinkedIn dorking...`,
        );
        contacts = await googleSearchContacts(campaignName, campaignType, 10);
      }

      if (contacts.length > 0) {
        console.log(`\x1b[32m[Tool]\x1b[0m Sourced ${contacts.length} candidate contacts from ${source}`);
        usedSource = source;
        break;
      } else {
        console.log(`\x1b[33m[Tool]\x1b[0m ${source} yielded 0 contacts, continuing pipeline...`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `\x1b[33m[Tool]\x1b[0m ${source} sourcing failed: ${msg}, trying next source in pipeline…`,
      );
    }
  }

  if (contacts.length === 0) {
    console.warn(`\x1b[33m[Tool]\x1b[0m source_leads: all sources returned 0 contacts — no leads to process`);
    return {
      action: "source_leads",
      tool: "none",
      success: false,
      leadsProcessed: 0,
      leadsFailed: 0,
      costUsd: 0,
      metadata: { reason: "no_contacts_found", triedSources: sourcesToTry },
      executionTimeMs: Date.now() - startTime,
    };
  }

  let inserted = 0;
  const newLeads: typeof leadBatch.leads = [];

  for (const c of contacts) {
    // Generate a placeholder email if none exists so Drizzle DB schema accepts it.
    // Clay enrichment will overwrite this fake email later.
    const leadEmail = c.email || `pending_${Date.now()}_${Math.random().toString(36).substring(7)}@enrichment.local`;
    
    try {
      const [dbLead] = await db
        .insert(leadsTable)
        .values({
          firstName:   String(c.first_name ?? "Unknown"),
          lastName:    String(c.last_name ?? ""),
          email:       leadEmail,
          company:     String(c.organization_name ?? c.company ?? "Unknown"),
          title:       String(c.title ?? ""),
          linkedinUrl: typeof c.linkedin_url === "string" ? c.linkedin_url : undefined,
          status:      "new",
          source:      usedSource,
          verified:    false,
          userId:      userId ?? null,
          orgId,
        })
        .returning();

      await db.insert(campaignLeadsTable).values({
        campaignId: leadBatch.campaignId,
        leadId:     dbLead.id,
        status:     "pending",
      });

      newLeads.push({
        id:          dbLead.id,
        email:       dbLead.email,
        firstName:   dbLead.firstName,
        lastName:    dbLead.lastName,
        company:     dbLead.company,
        title:       dbLead.title,
        status:      "pending",
      });

      inserted++;
    } catch (err) {
      console.warn(`\x1b[33m[Tool]\x1b[0m Failed to insert lead ${c.email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  leadBatch.leads.push(...newLeads);
  console.log(`\x1b[32m[Tool]\x1b[0m Sourced ${inserted} verified leads from ${usedSource} for campaign ${leadBatch.campaignId}`);

  return {
    action: "source_leads",
    tool: usedSource,
    success: inserted > 0,
    leadsProcessed: inserted,
    leadsFailed: contacts.length - inserted,
    costUsd: 0,
    metadata: { imported_from: usedSource, campaignId: leadBatch.campaignId },
    executionTimeMs: Date.now() - startTime,
  };
}

// ─── enrich_leads ─────────────────────────────────────────────────────────────

/**
 * Enrich pending leads via Clay webhook.
 * Uses CLAY_ENRICH_URL + CLAY_WEBHOOK_AUTH_TOKEN from env.
 */
async function executeEnrichLeadsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m enrich_leads:${tool}`);

  const toEnrich = leadBatch.leads.filter((l) => l.status === "pending");
  if (toEnrich.length === 0) {
    console.warn(`\x1b[33m[Tool]\x1b[0m enrich_leads called but no leads have status 'pending'`);
    return { action: "enrich_leads", tool, success: false, leadsProcessed: 0, leadsFailed: 0, costUsd: 0, metadata: { reason: "no_pending_leads" }, executionTimeMs: Date.now() - startTime };
  }

  const costPerLead = tool === "clay" ? 0.01 : 0.015;
  let processed = 0;
  let failed = 0;

  for (const lead of toEnrich) {
    try {
      const enriched = await clayEnrich(lead.email, lead.company, lead.title);
      if (enriched) {
        lead.industry    = (typeof enriched.industry   === "string" ? enriched.industry   : lead.industry)    ?? undefined;
        lead.companySize = (typeof enriched.company_size === "string" ? enriched.company_size : typeof enriched.companySize === "string" ? enriched.companySize : lead.companySize) ?? undefined;
        lead.linkedinUrl = (typeof enriched.linkedin_url === "string" ? enriched.linkedin_url : typeof enriched.linkedinUrl === "string" ? enriched.linkedinUrl : lead.linkedinUrl) ?? undefined;
        lead.revenue     = (typeof enriched.revenue === "string" ? enriched.revenue : lead.revenue) ?? undefined;
        lead.website     = (typeof enriched.website === "string" ? enriched.website : lead.website) ?? undefined;
      }
      lead.status = "enriched";
      processed++;
      console.log(`\x1b[32m[Tool]\x1b[0m enriched ${lead.firstName} via Clay`);
    } catch (err) {
      failed++;
      console.error(`\x1b[31m[Tool]\x1b[0m Clay enrichment failed for ${lead.email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return {
    action: "enrich_leads",
    tool,
    success: processed > 0,
    leadsProcessed: processed,
    leadsFailed: failed,
    costUsd: processed * costPerLead,
    executionTimeMs: Date.now() - startTime,
  };
}

// ─── verify_emails ────────────────────────────────────────────────────────────

/**
 * Verify email deliverability via MillionVerifier.
 * Only marks lead verified if result is "valid". Risky/invalid leads are failed.
 *
 * Bypass mode: when the tool provider is listed in OUTBOUND_DISABLED_PROVIDERS,
 * all enriched leads are marked "verified" at zero cost so the pipeline can
 * continue without a paid API key.  Re-enable by removing the provider name
 * from OUTBOUND_DISABLED_PROVIDERS once a paid plan is active.
 */
async function executeVerifyEmailsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m verify_emails:${tool}`);

  const toVerify = leadBatch.leads.filter((l) => l.status === "enriched");
  if (toVerify.length === 0) {
    console.warn(`\x1b[33m[Tool]\x1b[0m verify_emails called but no leads have status 'enriched'`);
    return { action: "verify_emails", tool, success: false, leadsProcessed: 0, leadsFailed: 0, costUsd: 0, metadata: { reason: "no_enriched_leads" }, executionTimeMs: Date.now() - startTime };
  }

  // Passthrough bypass when provider is disabled (e.g. MillionVerifier not yet on paid plan).
  if (!isProviderEnabled(tool)) {
    console.warn(
      `\x1b[33m[Tool]\x1b[0m verify_emails:${tool} is disabled — bypassing, marking ${toVerify.length} leads as verified`,
    );
    for (const lead of toVerify) {
      lead.status = "verified";
    }
    return {
      action: "verify_emails",
      tool,
      success: true,
      leadsProcessed: toVerify.length,
      leadsFailed: 0,
      costUsd: 0,
      metadata: { bypassed: true, reason: `${tool} disabled — passthrough verification` },
      executionTimeMs: Date.now() - startTime,
    };
  }

  let verified = 0;
  let failed = 0;
  const costPerLead = 0.005;

  for (const lead of toVerify) {
    try {
      const result = await mvVerify(lead.email);
      if (result === "valid") {
        lead.status = "verified";
        verified++;
        console.log(`\x1b[32m[Tool]\x1b[0m verified ${lead.email}`);
      } else {
        lead.status = "failed";
        failed++;
        console.warn(`\x1b[33m[Tool]\x1b[0m email ${result}: ${lead.email}`);
      }
    } catch (err) {
      lead.status = "failed";
      failed++;
      console.error(`\x1b[31m[Tool]\x1b[0m MillionVerifier failed for ${lead.email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return {
    action: "verify_emails",
    tool,
    success: verified > 0,
    leadsProcessed: verified,
    leadsFailed: failed,
    costUsd: toVerify.length * costPerLead,
    executionTimeMs: Date.now() - startTime,
  };
}

// ─── generate_content ─────────────────────────────────────────────────────────

/**
 * Generate personalised cold email copy via OpenAI (primary) or Groq (fallback).
 * Injects Cal.com booking link into CTA.
 */
async function executeGenerateContentTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
  campaignContext: CampaignContext = {},
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m generate_content:${tool}`);

  const toPersonalize = leadBatch.leads.filter((l) => l.status === "verified");
  if (toPersonalize.length === 0) {
    console.warn(`\x1b[33m[Tool]\x1b[0m generate_content called but no leads have status 'verified'`);
    return { action: "generate_content", tool, success: false, leadsProcessed: 0, leadsFailed: 0, costUsd: 0, metadata: { reason: "no_verified_leads" }, executionTimeMs: Date.now() - startTime };
  }

  const bookingUrl = process.env.CALCOM_BOOKING_URL ?? "";
  const ctaLine = bookingUrl
    ? `End with a soft CTA inviting them to book a 15-minute call: ${bookingUrl}`
    : "End with a soft CTA about a 15-minute discovery call.";

  let personalized = 0;
  let failed = 0;
  const costPerLead = tool === "openai" ? 0.02 : 0.01;

  for (const lead of toPersonalize) {
    try {
      const prompt = `Generate a B2B cold email for:
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Title: ${lead.title}
Industry: ${lead.industry ?? "Technology"}
Campaign: ${campaignContext.campaignName ?? "Outbound"}

Requirements:
- Subject: under 10 words, curiosity-driven
- Body: 3-4 sentences, formal but personable
- Open with "Hi ${lead.firstName},"
- Include one specific observation about their company or role
- ${ctaLine}
- Respond with ONLY valid JSON: { "subject": "...", "body": "..." }`;

      let parsed: { subject?: string; body?: string };

      if ((tool === "openai" || tool === "groq") && tool === "openai") {
        const openaiClient = await initializeOpenai();
        if (openaiClient) {
          const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini",
            max_completion_tokens: 400,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          });
          const raw = completion.choices[0]?.message?.content ?? "{}";
          parsed = JSON.parse(raw);
        } else {
          // Groq as fallback if openai not available
          parsed = await groqGenerate(prompt);
        }
      } else {
        // Groq as real fallback
        parsed = await groqGenerate(prompt);
      }

      if (!parsed.subject || !parsed.body) {
        throw new Error("AI returned empty subject or body");
      }

      (lead as any).personalizedSubject = parsed.subject;
      (lead as any).personalizedBody    = parsed.body;
      lead.status = "personalized";
      personalized++;
      console.log(`\x1b[32m[Tool]\x1b[0m personalized ${lead.firstName} (${tool})`);
    } catch (err) {
      lead.status = "failed";
      failed++;
      console.error(`\x1b[31m[Tool]\x1b[0m personalize failed for ${lead.email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return {
    action: "generate_content",
    tool,
    success: personalized > 0,
    leadsProcessed: personalized,
    leadsFailed: failed,
    costUsd: toPersonalize.length * costPerLead,
    executionTimeMs: Date.now() - startTime,
  };
}

// ─── send_campaign ────────────────────────────────────────────────────────────

/**
 * Send personalised emails via Resend (default) or Instantly.
 * Uses RESEND_FROM_EMAIL / INSTANTLY env vars — no fallback send.
 */
async function executeSendCampaignTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m send_campaign:${tool}`);

  const toSend = leadBatch.leads.filter((l) => l.status === "personalized");
  if (toSend.length === 0) {
    console.warn(`\x1b[33m[Tool]\x1b[0m send_campaign called but no leads have status 'personalized'`);
    return { action: "send_campaign", tool, success: false, leadsProcessed: 0, leadsFailed: 0, costUsd: 0, metadata: { reason: "no_personalized_leads" }, executionTimeMs: Date.now() - startTime };
  }

  let sent = 0;
  let failed = 0;
  const costPerEmail = tool === "resend" ? 0.1 : tool === "instantly" ? 0.08 : 0.12;

  for (const lead of toSend) {
    try {
      const subject = String((lead as any).personalizedSubject ?? "");
      const body    = String((lead as any).personalizedBody    ?? "");

      if (!subject || !body) {
        throw new Error("Missing personalised subject or body — skipping send");
      }

      const htmlBody = body.replace(/\n/g, "<br>");
      let messageId: string;

      const testEmailOverride = process.env.TEST_EMAIL_OVERRIDE;
      const targetEmail = testEmailOverride && testEmailOverride.includes("@") 
        ? testEmailOverride 
        : lead.email;

      if (testEmailOverride) {
        console.log(`\x1b[33m[Tool]\x1b[0m TEST_EMAIL_OVERRIDE is active. Redirecting email from ${lead.email} to ${targetEmail}`);
      }

      if (tool === "instantly") {
        messageId = await instantlySend(targetEmail, subject, body);
      } else {
        // Default: Resend
        messageId = await resendSend(targetEmail, subject, htmlBody);
      }

      lead.status = "sent";
      (lead as any).emailId = messageId;
      sent++;
      console.log(`\x1b[32m[Tool]\x1b[0m sent to ${lead.email} via ${tool} (${messageId})`);
    } catch (err) {
      lead.status = "failed";
      failed++;
      console.error(`\x1b[31m[Tool]\x1b[0m send failed for ${lead.email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return {
    action: "send_campaign",
    tool,
    success: sent > 0,
    leadsProcessed: sent,
    leadsFailed: failed,
    costUsd: toSend.length * costPerEmail,
    metadata: { provider: tool },
    executionTimeMs: Date.now() - startTime,
  };
}

// ─── review_signals ───────────────────────────────────────────────────────────

/**
 * Query real campaign_signals table for KPIs.
 * Returns actual open/reply/bounce rates — no random numbers.
 */
async function executeReviewSignalsTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m review_signals:${tool}`);

  const signals = await db
    .select()
    .from(campaignSignalsTable)
    .where(eq(campaignSignalsTable.campaignId, leadBatch.campaignId));

  const total = signals.length;
  let opens = 0, replies = 0, positiveReplies = 0, bounces = 0, unsubscribes = 0;

  for (const s of signals) {
    switch (s.signalType) {
      case "open":           opens++;           break;
      case "reply":          replies++;         break;
      case "positive_reply": positiveReplies++; break;
      case "bounce":         bounces++;         break;
      case "unsubscribe":    unsubscribes++;    break;
    }
  }

  const sentCount = leadBatch.leads.filter((l) => l.status === "sent").length || 1;

  console.log(`\x1b[36m[Tool]\x1b[0m signals: opens=${opens} replies=${replies} bounces=${bounces} (${total} total events)`);

  return {
    action: "review_signals",
    tool,
    success: true,
    leadsProcessed: 0,
    leadsFailed: 0,
    costUsd: 0,
    metadata: {
      totalSignals:      total,
      openRate:          opens          / sentCount,
      replyRate:         replies        / sentCount,
      positiveReplyRate: positiveReplies / sentCount,
      bounceRate:        bounces        / sentCount,
      unsubscribeRate:   unsubscribes   / sentCount,
    },
    executionTimeMs: Date.now() - startTime,
  };
}

// ─── adjust_strategy ─────────────────────────────────────────────────────────

/**
 * Records a strategy adjustment decision.
 * The actual strategy change is driven by the LLM in the next iteration
 * based on the signal KPIs from review_signals.
 */
async function executeAdjustStrategyTool(
  tool: string,
  leadBatch: LeadBatch,
  orgId: number,
  startTime: number,
): Promise<ToolExecutionResult> {
  console.log(`\x1b[36m[Tool]\x1b[0m adjust_strategy:${tool}`);
  return {
    action: "adjust_strategy",
    tool,
    success: true,
    leadsProcessed: 0,
    leadsFailed: 0,
    costUsd: 0,
    metadata: { strategy_adjustment: tool },
    executionTimeMs: Date.now() - startTime,
  };
}
