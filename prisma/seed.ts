import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  console.log('🌱 Seeding Cosa Nostra...')

  // Clean (orden por FKs)
  await prisma.importDecision.deleteMany().catch(() => {})
  await prisma.importBatch.deleteMany().catch(() => {})
  await prisma.tournamentResult.deleteMany().catch(() => {})
  await prisma.matchPlayer.deleteMany().catch(() => {})
  await prisma.match.deleteMany().catch(() => {})
  await prisma.tournament.deleteMany().catch(() => {})
  await prisma.rankingSnapshot.deleteMany().catch(() => {})
  await prisma.externalIdentity.deleteMany().catch(() => {})
  await prisma.clubAlias.deleteMany().catch(() => {})
  await prisma.player.deleteMany().catch(() => {})
  await prisma.session.deleteMany().catch(() => {})
  await prisma.account.deleteMany().catch(() => {})
  await prisma.user.deleteMany().catch(() => {})
  await prisma.season.deleteMany().catch(() => {})

  const passwordHash = await bcrypt.hash('cosa2026', 10)

  // Users + Players
  const playersData = [
    { name: 'Antonio "El Padrino" Reyes', alias: 'El Padrino', role: 'don', points: 1850, efficiency: 0.78, wins: 42, losses: 12, club: 'VALERA' },
    { name: 'Carlos Mendoza', alias: 'Capo Carlos', role: 'capo', points: 1720, efficiency: 0.71, wins: 38, losses: 15, club: 'VALERA' },
    { name: 'Luis "La Rosa" Vargas', alias: 'La Rosa', role: 'consigliere', points: 1680, efficiency: 0.69, wins: 35, losses: 16, club: 'DIVIDIVE' },
    { name: 'Miguel Torres', alias: 'Miguelito', role: 'capo', points: 1590, efficiency: 0.65, wins: 31, losses: 17, club: 'S MENDOZA' },
    { name: 'José "El Silencioso" Ramírez', alias: 'El Silencioso', role: 'soldado', points: 1510, efficiency: 0.62, wins: 28, losses: 18, club: 'BETIJOQUE' },
    { name: 'Pedro "Ficha" González', alias: 'Ficha', role: 'soldado', points: 1450, efficiency: 0.58, wins: 25, losses: 19, club: 'VALERA' },
    { name: 'Ricardo "Doble Seis" Herrera', alias: 'Doble Seis', role: 'soldado', points: 1380, efficiency: 0.55, wins: 22, losses: 20, club: 'TRUJILLO' },
    { name: 'Andrés Castillo', alias: 'Andrés', role: 'soldado', points: 1320, efficiency: 0.52, wins: 20, losses: 21, club: 'DIVIDIVE' },
    { name: 'Fernando "El Nuevo" Díaz', alias: 'El Nuevo', role: 'aspirante', points: 1200, efficiency: 0.48, wins: 15, losses: 16, club: 'KM 23' },
    { name: 'Diego Morales', alias: 'Diego', role: 'aspirante', points: 1150, efficiency: 0.45, wins: 12, losses: 15, club: 'VALERA' },
  ]

  const users = []
  for (const [i, p] of playersData.entries()) {
    const displayName = p.alias || p.name
    const user = await prisma.user.create({
      data: {
        email: `jugador${i + 1}@cosanostra.club`,
        passwordHash,
        name: p.name,
        alias: p.alias,
        role: p.role,
        player: {
          create: {
            displayName,
            normalizedName: normalizeName(displayName),
            club: p.club,
            normalizedClub: normalizeName(p.club),
            rankingPoints: p.points,
            efficiency: p.efficiency,
            wins: p.wins,
            losses: p.losses,
            tournamentsPlayed: Math.floor(p.wins / 3) + 2,
          },
        },
      },
      include: { player: true },
    })
    users.push(user)
  }

  // Admin user (sin player)
  const adminPasswordHash = await bcrypt.hash('Natale12040852', 10)
  await prisma.user.create({
    data: {
      email: 'natalebong@hotmail.com',
      passwordHash: adminPasswordHash,
      name: 'Natale Bongiovanni',
      alias: 'Natale',
      role: 'don',
    },
  })

  // Club aliases
  const aliases = [
    { alias: 'S. MENDOZA', canonical: 'S MENDOZA' },
    { alias: 'S.MENDOZA', canonical: 'S MENDOZA' },
    { alias: 'SMENDOZA', canonical: 'S MENDOZA' },
    { alias: 'SANTA MENDOZA', canonical: 'S MENDOZA' },
    { alias: 'EL DIVIDIVE', canonical: 'DIVIDIVE' },
    { alias: 'KM23', canonical: 'KM 23' },
  ]
  for (const a of aliases) {
    await prisma.clubAlias.create({ data: a })
  }

  // Season
  const season = await prisma.season.create({
    data: {
      name: 'Temporada 2026',
      year: 2026,
      startDate: new Date('2026-01-15'),
      status: 'active',
    },
  })

  // Rankings
  for (const [i, user] of users.entries()) {
    if (user.player) {
      await prisma.rankingSnapshot.create({
        data: {
          seasonId: season.id,
          playerId: user.player.id,
          position: i + 1,
          points: user.player.rankingPoints,
          efficiency: user.player.efficiency,
        },
      })
    }
  }

  // Tournaments
  const t1 = await prisma.tournament.create({
    data: {
      seasonId: season.id,
      name: 'Torneo de Apertura — Honor del Don',
      type: 'individual',
      format: 'swiss',
      status: 'finished',
      startDate: new Date('2026-02-08'),
      endDate: new Date('2026-02-09'),
      location: 'Sede Cosa Nostra, Caracas',
      description: 'Primer torneo oficial de la temporada. 32 jugadores.',
    },
  })

  await prisma.tournament.create({
    data: {
      seasonId: season.id,
      name: 'Copa Rosa Negra',
      type: 'parejas',
      format: 'knockout',
      status: 'upcoming',
      startDate: new Date('2026-10-12'),
      location: 'Sede Cosa Nostra, Caracas',
      description: 'Torneo por parejas. Inscripciones abiertas.',
    },
  })

  await prisma.tournament.create({
    data: {
      seasonId: season.id,
      name: 'Grand Prix del Silencio',
      type: 'individual',
      format: 'round-robin',
      status: 'upcoming',
      startDate: new Date('2026-11-15'),
      location: 'Por definir',
      description: 'Circuito de alto prestigio. Solo ranking top 16.',
    },
  })

  // Sample matches
  if (users[0].player && users[1].player) {
    await prisma.match.create({
      data: {
        tournamentId: t1.id,
        tableNumber: 1,
        status: 'finished',
        startedAt: new Date('2026-02-08T14:00:00'),
        finishedAt: new Date('2026-02-08T15:30:00'),
        winnerSide: 'A',
        players: {
          create: [
            { playerId: users[0].player.id, side: 'A', points: 150, position: 1 },
            { playerId: users[1].player.id, side: 'B', points: 95, position: 2 },
          ],
        },
      },
    })
  }

  console.log('✅ Seed completado')
  console.log('   Usuarios: jugador1@cosanostra.club … jugador10@cosanostra.club')
  console.log('   Contraseña: cosa2026')
  console.log('   Admin: natalebong@hotmail.com')
  console.log('   ClubAlias: 6 aliases cargados')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
