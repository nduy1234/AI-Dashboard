import app from "./app";
import { seedDatabase } from "./seed";

const isDev = process.env.NODE_ENV !== "production";
const rawPort = process.env["PORT"] || (isDev ? "5000" : undefined);

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    await seedDatabase();
  } catch (err) {
    console.error("Seed error:", err);
  }
});
