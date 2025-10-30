import { PrismaClient } from '@/generated/prisma';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Check if using Neon database (serverless)
const connectionString = `${process.env.DATABASE_URL}`;
const isNeon = connectionString.includes('neon.tech');

let prismaClient: PrismaClient;

if (isNeon) {
  // Use Neon adapter for serverless PostgreSQL
  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString });
  prismaClient = new PrismaClient({ adapter });
} else {
  // Use regular Prisma client for local/traditional PostgreSQL
  prismaClient = new PrismaClient();
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || prismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
