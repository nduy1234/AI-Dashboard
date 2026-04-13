/**
 * Loads allowed Apollo API paths from config/apollo-endpoints.json (package root).
 * Override path with APOLLO_ENDPOINTS_CONFIG (absolute or relative to process.cwd()).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";

/** How the outbound agent calls a sourcing endpoint */
export type ApolloSourceStrategy =
  | "people_filters"
  /** organizations/search → mixed_people/api_search with organization_ids */
  | "scoped_mixed_people_search"
  /** @deprecated Apollo returns 404; treated like scoped_mixed_people_search */
  | "organization_top_people";

export interface ApolloEndpointEntry {
  path: string;
  notes?: string;
  /** Default: people_filters (shared title/seniority JSON body). */
  strategy?: ApolloSourceStrategy;
}

/** Static inventory of every path your Apollo key may call (for docs / GET endpoint). */
export interface ApolloAllowedEndpoint {
  path: string;
  category?: string;
  notes?: string;
}

export interface ApolloEndpointsFile {
  description?: string;
  /** Full list from Apollo dashboard — not used for ordering source_leads; informational. */
  allowedEndpoints?: ApolloAllowedEndpoint[];
  /** Ordered tries for autonomous source_leads (each entry may use a different strategy). */
  peopleSearch: {
    method?: string;
    endpoints: ApolloEndpointEntry[];
  };
}

let cached: ApolloEndpointsFile | null = null;

function resolveConfigPath(): string {
  const explicit = process.env.APOLLO_ENDPOINTS_CONFIG?.trim();
  if (explicit) {
    return isAbsolute(explicit) ? explicit : join(process.cwd(), explicit);
  }
  
  // For ESM: use import.meta.url
  // For CJS: fall back to relative path from __dirname
  try {
    return fileURLToPath(new URL("../config/apollo-endpoints.json", import.meta.url));
  } catch (_e) {
    // Fallback for CJS: resolve relative to package root
    // Try common paths: ../config/apollo-endpoints.json or ./lib/agent-orchestration/config/apollo-endpoints.json
    const pkgRootPath = join(process.cwd(), "lib", "agent-orchestration", "config", "apollo-endpoints.json");
    return pkgRootPath;
  }
}

function validatePath(pathToFile: string, path: string, label: string): void {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(`${pathToFile}: ${label} must be a string path starting with /`);
  }
}

/** Read and parse the JSON config (cached for the process lifetime). */
export function loadApolloEndpointsConfig(): ApolloEndpointsFile {
  if (cached) return cached;
  const pathToFile = resolveConfigPath();
  const raw = readFileSync(pathToFile, "utf8");
  const parsed = JSON.parse(raw) as ApolloEndpointsFile;
  if (!parsed?.peopleSearch?.endpoints?.length) {
    throw new Error(
      `${pathToFile}: peopleSearch.endpoints must be a non-empty array of { path: string }`,
    );
  }
  for (const e of parsed.peopleSearch.endpoints) {
    validatePath(pathToFile, e.path, `peopleSearch endpoint "${e.path}"`);
    if (
      e.strategy &&
      e.strategy !== "people_filters" &&
      e.strategy !== "scoped_mixed_people_search" &&
      e.strategy !== "organization_top_people"
    ) {
      throw new Error(`${pathToFile}: unknown strategy "${e.strategy}" for ${e.path}`);
    }
  }
  if (parsed.allowedEndpoints) {
    for (const e of parsed.allowedEndpoints) {
      validatePath(pathToFile, e.path, `allowedEndpoints entry "${e.path}"`);
    }
  }
  cached = parsed;
  return parsed;
}

/** Ordered sourcing steps for source_leads (path + strategy). */
export function getApolloSourceEndpoints(): ApolloEndpointEntry[] {
  return loadApolloEndpointsConfig().peopleSearch.endpoints;
}

/** @deprecated Use getApolloSourceEndpoints — kept for callers that only need paths. */
export function getApolloPeopleSearchPaths(): string[] {
  return getApolloSourceEndpoints().map((e) => e.path);
}

export function clearApolloEndpointsConfigCache(): void {
  cached = null;
}
