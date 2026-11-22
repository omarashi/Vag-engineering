import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalDb = globalThis as typeof globalThis & { vagDb?: PrismaClient };
export const db = globalDb.vagDb ?? new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
if (process.env.NODE_ENV !== "production") globalDb.vagDb = db;

export type Tx = Prisma.TransactionClient;
export function plain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, value) => typeof value === "bigint" ? String(value) : value));
}
export function json(data: unknown): Prisma.InputJsonValue {
  return plain(data) as Prisma.InputJsonValue;
}

