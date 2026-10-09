import express from "express";
import cors from "cors";
import { config } from "./config";
import { createTaskRouter, createAuditLogRouter, errorHandler } from "./routes";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.frontendUrl,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Routes
  app.use("/api/tasks", createTaskRouter());
  app.use("/api/audit-logs", createAuditLogRouter());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}

