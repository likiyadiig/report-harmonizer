import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env on its own. Node 22 can, without dotenv.
process.loadEnvFile();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
