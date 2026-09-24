import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/ranking
 * Formato compatible con la PWA (COSA_DATA.ranking).
 * Agrega desde TournamentResult; si no hay resultados, usa campos del Player.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [players, tournamentCount, results] = await Promise.all([
      prisma.player.findMany({
        where: { active: true },
        include: {
          user: { select: { name: true, alias: true, role: true } },
        },
      }),
      prisma.tournament.count({ where: { status: 'finished' } }),
      prisma.tournamentResult.findMany({
        select: {
          playerId: true,
          pj: true,
          pg: true,
          pp: true,
          efe: true,
          avg: true,
          tournamentId: true,
        },
      }),
    ])

    type Agg = { pj: number; pg: number; pp: number; efe: number; tournaments: Set<string> }
    const byPlayer = new Map<string, Agg>()
    for (const r of results) {
      let a = byPlayer.get(r.playerId)
      if (!a) {
        a = { pj: 0, pg: 0, pp: 0, efe: 0, tournaments: new Set() }
        byPlayer.set(r.playerId, a)
      }
      a.pj += r.pj || 0
      a.pg += r.pg || 0
      a.pp += r.pp || 0
      a.efe += r.efe || 0
      a.tournaments.add(r.tournamentId)
    }

    const ranking = players
      .map((p) => {
        const a = byPlayer.get(p.id)
        const pj = a ? a.pj : p.wins + p.losses
        const pg = a ? a.pg : p.wins
        const pp = a ? a.pp : p.losses
        const efe = a ? a.efe : Math.round((p.efficiency || 0) * 1000)
        const tournaments = a ? a.tournaments.size : p.tournamentsPlayed
        const avg = pj > 0 ? pg / pj : p.efficiency || 0
        return {
          id: p.id,
          name: p.displayName,
          club: p.club || '—',
          pj,
          pg,
          pp,
          efe,
          tournaments,
          avg: Number(avg.toFixed(4)),
          avgPct: Math.round(avg * 100),
          role: p.user?.role || null,
          pos: 0,
        }
      })
      .filter((p) => p.pj > 0 || p.tournaments > 0 || p.pg > 0)
      .sort((a, b) => b.pg - a.pg || b.efe - a.efe || b.avg - a.avg || b.pj - a.pj)

    ranking.forEach((p, i) => {
      p.pos = i + 1
    })

    return NextResponse.json({
      ranking,
      playerCount: ranking.length,
      tournamentCount,
      season: 'Temporada 2026',
      formula: 'PG → EFE → AVG → PJ',
      source: 'prisma',
    })
  } catch (error) {
    console.error('Ranking error:', error)
    return NextResponse.json(
      { error: 'Error al obtener el ranking' },
      { status: 500 }
    )
  }
}
