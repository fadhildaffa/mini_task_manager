import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "",
};

/**
 * Predefined actors — these are the only usernames allowed to perform
 * status transitions.  Extend this list as the team grows.
 */
export const PREDEFINED_ACTORS = [
  "alice",
  "bob",
  "charlie",
  "diana",
  "system",
] as const;

export type Actor = (typeof PREDEFINED_ACTORS)[number];

