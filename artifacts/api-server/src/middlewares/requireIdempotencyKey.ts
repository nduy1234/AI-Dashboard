import { type NextFunction, type Request, type Response } from "express";

export function requireIdempotencyKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.get("Idempotency-Key");
  if (!key || key.trim().length === 0) {
    res.status(400).json({ error: "Idempotency-Key header is required" });
    return;
  }
  next();
}
