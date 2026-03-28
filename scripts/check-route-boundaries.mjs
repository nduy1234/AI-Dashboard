import { readFile } from "node:fs/promises";
import path from "node:path";

const ROUTES_ROOT = path.resolve(process.cwd(), "artifacts/api-server/src/routes");

const migratedRoutes = [
  "auth.ts",
  "outbound.ts",
  "webhooks.ts",
];

const forbiddenImports = [
  "@workspace/db",
  "drizzle-orm",
];

async function checkRouteFile(fileName) {
  const filePath = path.join(ROUTES_ROOT, fileName);
  const content = await readFile(filePath, "utf8");
  const found = forbiddenImports.filter((mod) => content.includes(`"${mod}"`) || content.includes(`'${mod}'`));
  return { fileName, found };
}

async function main() {
  const results = await Promise.all(migratedRoutes.map(checkRouteFile));
  const failures = results.filter((r) => r.found.length > 0);

  if (failures.length > 0) {
    console.error("Route boundary check failed:");
    for (const failure of failures) {
      console.error(`- ${failure.fileName}: forbidden imports -> ${failure.found.join(", ")}`);
    }
    process.exit(1);
  }

  console.log("Route boundary check passed for migrated routes.");
}

await main();
