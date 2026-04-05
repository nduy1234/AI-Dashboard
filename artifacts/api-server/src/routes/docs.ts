import path from "path";
import { access, readFile, watch } from "fs/promises";
import { Router, type IRouter, type RequestHandler } from "express";
import * as swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

const router: IRouter = Router();

const isDev = process.env.NODE_ENV !== "production";

let cachedSpecYaml: string | null = null;
let cachedSpecJson: Record<string, unknown> | null = null;
let resolvedSpecPath: string | null = null;

function isDocsEnabled(): boolean {
  return process.env.SWAGGER_DOCS_ENABLED !== "false";
}

const ensureDocsEnabled: RequestHandler = (_req, res, next) => {
  if (!isDocsEnabled()) {
    res.status(404).json({ error: "API documentation is disabled" });
    return;
  }
  next();
};

async function resolveOpenApiSpecPath(): Promise<string> {
  if (resolvedSpecPath) return resolvedSpecPath;

  const relativeSpecPath = path.join("lib", "api-spec", "openapi.yaml");
  const candidates = [
    path.resolve(process.cwd(), relativeSpecPath),
    path.resolve(process.cwd(), "..", "..", relativeSpecPath),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      resolvedSpecPath = candidate;

      // In dev, watch the file and bust the cache when it changes.
      if (isDev) {
        (async () => {
          try {
            const watcher = watch(candidate);
            for await (const _event of watcher) {
              cachedSpecYaml = null;
              cachedSpecJson = null;
            }
          } catch {
            // Watcher errors are non-fatal.
          }
        })();
      }

      return candidate;
    } catch {
      // Continue through candidates until one exists.
    }
  }

  throw new Error("Unable to locate lib/api-spec/openapi.yaml from current working directory");
}

async function getOpenApiSpecYaml(): Promise<string> {
  if (cachedSpecYaml) return cachedSpecYaml;

  const openApiSpecPath = await resolveOpenApiSpecPath();
  const specYaml = await readFile(openApiSpecPath, "utf-8");
  // Only cache in production — dev always reads fresh from disk.
  if (!isDev) cachedSpecYaml = specYaml;
  return specYaml;
}

async function getOpenApiSpecJson(): Promise<Record<string, unknown>> {
  if (cachedSpecJson) return cachedSpecJson;
  const specYaml = await getOpenApiSpecYaml();
  const parsedSpec = parseYaml(specYaml) as Record<string, unknown>;
  if (!isDev) cachedSpecJson = parsedSpec;
  return parsedSpec;
}

router.get("/openapi.yaml", ensureDocsEnabled, async (_req, res, next) => {
  try {
    const specYaml = await getOpenApiSpecYaml();
    res.type("application/yaml").send(specYaml);
  } catch (error) {
    next(error);
  }
});

router.get("/openapi.json", ensureDocsEnabled, async (_req, res, next) => {
  try {
    const specJson = await getOpenApiSpecJson();
    res.json(specJson);
  } catch (error) {
    next(error);
  }
});

const swaggerUiHandler = swaggerUi.setup(undefined, {
  explorer: true,
  swaggerOptions: {
    // Swagger UI fetches the spec from this URL on every page load — no stale baked-in snapshot.
    url: "/api/v1/openapi.json",
  },
});

router.use("/docs", ensureDocsEnabled, swaggerUi.serve);
router.get("/docs", ensureDocsEnabled, swaggerUiHandler);

export default router;
