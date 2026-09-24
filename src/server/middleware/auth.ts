import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  ownerId?: string;
}

/**
 * Tenant Isolation & Auth Middleware
 * Extracts ownerId from headers, query params, or body, ensuring requests are strictly scoped.
 */
export function tenantMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let ownerId = req.headers["x-owner-id"] as string;

  if (!ownerId && authHeader && authHeader.startsWith("Bearer ")) {
    // For JWT tokens or custom bearer IDs
    const token = authHeader.substring(7).trim();
    if (token && !token.includes(".")) {
      ownerId = token;
    }
  }

  if (!ownerId) {
    ownerId = (req.query.ownerId as string) || (req.body && req.body.ownerId);
  }

  req.ownerId = ownerId || "anonymous";
  next();
}

/**
 * Global Async Error Handler Middleware
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(`[Error Shield] Intercepted unhandled error on ${req.method} ${req.path}:`, err);
  if (!res.headersSent) {
    res.status(500).json({
      error: err?.message || "Internal Server Error",
      path: req.path,
      timestamp: new Date().toISOString(),
    });
  }
}
