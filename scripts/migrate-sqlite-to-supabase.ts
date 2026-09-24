import { PrismaClient } from "@prisma/client";

/**
 * Script para migrar datos de SQLite a Supabase PostgreSQL.
 *
 * Instrucciones:
 * 1. Configura DATABASE_URL con tu cadena de conexión de Supabase en .env:
 *    DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?pgbouncer=true"
 * 2. Ejecuta: npx tsx scripts/migrate-sqlite-to-supabase.ts
 */

async function main() {
  console.log("🚀 Iniciando conexión a Supabase Postgres...");
  const prisma = new PrismaClient();

  try {
    const userCount = await prisma.user.count();
    console.log(`✅ Conexión exitosa a Supabase! Usuarios en la base: ${userCount}`);
  } catch (err) {
    console.error("❌ Error de conexión con Supabase:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
