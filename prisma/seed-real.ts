/**
 * Seed real: carga ranking + torneos desde public/js/data.js (78 jugadores, 4 torneos).
 * Uso: npx tsx prisma/seed-real.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'

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

type DataPlayer = {
  name: string
  club?: string
  pj: number
  pg: number
  pp: number
  efe: number
  tournaments: number
  avg: number
  avgPct: number
  pos: number
}

type DataTPlayer = {
  name: string
  nameRaw?: string
  club?: string
  pj: number
  pg: number
  pp: number
  efe: number
  pf?: number
  pc?: number
  avg: number
  pos: number
}

type DataTournament = {
  id: string
  name: string
  date: string
  type: string
  playerCount: number
  players: DataTPlayer[]
}

type CosaData = {
  ranking: DataPlayer[]
  tournaments: DataTournament[]
  playerCount: number
  tournamentCount: number
}

function loadCosaData(): CosaData {
  const dataPath = path.join(process.cwd(), 'public', 'js', 'data.js')
  const raw = fs.readFileSync(dataPath, 'utf8')
  const json = raw.replace(/^window\.COSA_DATA\s*=\s*/, '').replace(/;?\s*$/, '')
  return JSON.parse(json) as CosaData
}

async function main() {
  console.log('🌱 Seed REAL Cosa Nostra (data.js → Prisma)...')
  const data = loadCosaData()
  console.log(`   ${data.playerCount} jugadores · ${data.tournamentCount} torneos`)

  // Clean (orden FK)
  await prisma.importDecision.deleteMany().catch(() => {})
  await prisma.importBatch.deleteMany().catch(() => {})
  await prisma.matchPlayer.deleteMany().catch(() => {})
  await prisma.match.deleteMany().catch(() => {})
  await prisma.tournamentResult.deleteMany().catch(() => {})
  await prisma.tournament.deleteMany().catch(() => {})
  await prisma.rankingSnapshot.deleteMany().catch(() => {})
  await prisma.player.deleteMany().catch(() => {})
  await prisma.session.deleteMany().catch(() => {})
  await prisma.account.deleteMany().catch(() => {})
  await prisma.user.deleteMany().catch(() => {})
  await prisma.season.deleteMany().catch(() => {})
  await prisma.clubAlias.deleteMany().catch(() => {})

  const season = await prisma.season.create({
    data: {
      name: 'Temporada 2026',
      year: 2026,
      startDate: new Date('2026-01-01'),
      status: 'active',
    },
  })

  // Admin
  const adminHash = await bcrypt.hash('Natale12040852', 10)
  await prisma.user.create({
    data: {
      email: 'natalebong@hotmail.com',
      passwordHash: adminHash,
      name: 'Natale Bongiovanni',
      alias: 'Don Natale',
      role: 'don',
    },
  })

  // Players from ranking (sin cuenta de usuario — importados)
  const playerIdByName = new Map<string, string>()
  for (const p of data.ranking) {
    const displayName = p.name
    const player = await prisma.player.create({
      data: {
        displayName,
        normalizedName: normalizeName(displayName),
        club: p.club || null,
        normalizedClub: p.club ? normalizeName(p.club) : null,
        rankingPoints: Math.max(0, Math.round(1000 + p.efe / 2 + p.pg * 10)),
        efficiency: p.avg || 0,
        wins: p.pg || 0,
        losses: p.pp || 0,
        tournamentsPlayed: p.tournaments || 0,
        active: true,
      },
    })
    playerIdByName.set(normalizeName(displayName), player.id)
  }

  // Tournaments + results
  for (const t of data.tournaments) {
    const start = t.date ? new Date(t.date + 'T12:00:00') : new Date()
    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        name: t.name,
        type: t.type || 'individual',
        format: 'swiss',
        status: 'finished',
        startDate: start,
        endDate: start,
        location: 'Venezuela',
        description: `Importado · ${t.playerCount} jugadores`,
        externalSource: 'betadomino',
        externalKey: t.id,
      },
    })

    for (const tp of t.players || []) {
      const key = normalizeName(tp.name)
      let playerId = playerIdByName.get(key)
      if (!playerId) {
        const created = await prisma.player.create({
          data: {
            displayName: tp.name,
            normalizedName: key,
            club: tp.club || null,
            normalizedClub: tp.club ? normalizeName(tp.club) : null,
            rankingPoints: 1000,
            efficiency: tp.avg || 0,
            wins: tp.pg || 0,
            losses: tp.pp || 0,
            tournamentsPlayed: 1,
            active: true,
          },
        })
        playerId = created.id
        playerIdByName.set(key, playerId)
      }

      await prisma.tournamentResult.create({
        data: {
          tournamentId: tournament.id,
          playerId,
          position: tp.pos || 0,
          pj: tp.pj || 0,
          pg: tp.pg || 0,
          pp: tp.pp || 0,
          efe: tp.efe || 0,
          pf: tp.pf || 0,
          pc: tp.pc || 0,
          avg: tp.avg || 0,
          rawName: tp.nameRaw || tp.name,
          rawClub: tp.club || null,
        },
      })
    }
  }

  // Demo player accounts (password cosa2026) — primeros 5 del ranking
  const demoHash = await bcrypt.hash('cosa2026', 10)
  for (let i = 0; i < Math.min(5, data.ranking.length); i++) {
    const p = data.ranking[i]
    const pid = playerIdByName.get(normalizeName(p.name))
    if (!pid) continue
    await prisma.user.create({
      data: {
        email: `jugador${i + 1}@cosanostra.club`,
        passwordHash: demoHash,
        name: p.name,
        alias: p.name.split(' ')[0],
        role: i === 0 ? 'don' : i < 3 ? 'capo' : 'soldado',
        player: { connect: { id: pid } },
      },
    })
  }

  // Avisos in-app de bienvenida
  await prisma.inAppNotification.createMany({
    data: [
      {
        title: 'Bienvenido a Cosa Nostra',
        body: 'Ranking real, torneos y avisos del club en un solo lugar.',
        type: 'system',
        url: './index.html',
        topic: 'system',
      },
      {
        title: 'Temporada 2026 en curso',
        body: 'Consulta el ranking global y el archivo de torneos desde el menú.',
        type: 'ranking',
        url: './index.html',
        topic: 'ranking',
      },
    ],
  })

  console.log('✅ Seed REAL completado')
  console.log(`   Players: ${playerIdByName.size}`)
  console.log(`   Torneos: ${data.tournaments.length}`)
  console.log('   Admin: natalebong@hotmail.com / Natale12040852')
  console.log('   Demo: jugador1@cosanostra.club … / cosa2026')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
