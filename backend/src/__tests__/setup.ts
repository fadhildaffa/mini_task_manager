/**
 * Test setup — runs before every test file.
 *
 * Points the Prisma client at the dedicated test database so production
 * data is never touched during tests.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

// Override DATABASE_URL with test DB before Prisma client is imported
if (!process.env.DATABASE_URL) {
  const testUrl =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5433/mini_task_manager_test?schema=public";
  process.env.DATABASE_URL = testUrl;
}

import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll } from "vitest";

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5433/mini_task_manager_test?schema=public",
    },
  },
  log: [],
});

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

