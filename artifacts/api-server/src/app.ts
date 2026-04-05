import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";

const app: Express = express();
const API_VERSION_PREFIX = "/api/v1";
const LEGACY_API_PREFIX = "/api";

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logger — prints method, path, status, and duration on every request
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 500 ? "\x1b[31m"   // red
                : res.statusCode >= 400 ? "\x1b[33m"   // yellow
                : res.statusCode >= 300 ? "\x1b[36m"   // cyan
                : "\x1b[32m";                           // green
    console.log(`${color}${req.method}\x1b[0m ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use(authMiddleware);

app.use(API_VERSION_PREFIX, router);
app.use(LEGACY_API_PREFIX, router);

export default app;
