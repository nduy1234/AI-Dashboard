import path from "path";
import { fileURLToPath } from "url";
import SwaggerParser from "@apidevtools/swagger-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, "openapi.yaml");

try {
  await SwaggerParser.validate(specPath);
  console.log(`OpenAPI spec is valid: ${specPath}`);
} catch (error) {
  console.error("OpenAPI validation failed.");
  console.error(error);
  process.exit(1);
}
