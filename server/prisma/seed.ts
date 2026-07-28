import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { normalizeUsername } from "../../shared/types";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.BOSS_NAME;
  const rawUsername = process.env.BOSS_USERNAME;
  const password = process.env.BOSS_PASSWORD;

  if (!name || !rawUsername || !password) {
    throw new Error("BOSS_NAME, BOSS_USERNAME, and BOSS_PASSWORD must be set in .env");
  }

  const username = normalizeUsername(rawUsername);

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { username },
    // Re-running only rotates the password; other profile fields are left as-is.
    update: { passwordHash },
    create: {
      name,
      username,
      passwordHash,
      role: "boss",
      isCook: false,
      isBarista: false,
      defaultShiftsPerWeek: 0,
    },
  });

  console.log(`Boss user ready: ${user.username} (id=${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
