import { PrismaClient } from "@prisma/client";

// Un seul client Prisma réutilisé (évite d'ouvrir trop de connexions en dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
