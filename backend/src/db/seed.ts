/**
 * Seeder — creates one sample task per predefined actor.
 * Running this multiple times is safe because it checks for existing rows first.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const actors = ["alice", "bob", "charlie", "diana", "system"] as const;

async function seed() {
  console.log("🌱  Seeding database …");

  for (const actor of actors) {
    const existing = await prisma.task.findFirst({
      where: {
        createdBy: actor,
        title: `${actor}'s first task`,
      },
    });

    if (!existing) {
      await prisma.task.create({
        data: {
          title: `${actor}'s first task`,
          description: `A sample task created for actor ${actor}.`,
          status: "to_do",
          createdBy: actor,
        },
      });
      console.log(`  ✔  Created task for ${actor}`);
    } else {
      console.log(`  ↩  Task for ${actor} already exists — skipping`);
    }
  }

  console.log("✅  Seed complete.");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

