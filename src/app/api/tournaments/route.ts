import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/tournaments
 * Formato compatible con la PWA (COSA_DATA.tournaments).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        results: {
          include: {
            player: { select: { displayName: true, club: true } },
          },
          orderBy: { position: 'asc' },
        },
        season: { select: { name: true, year: true } },
      },
    })

    const data = tournaments.map((t) => {
      const date = t.startDate
        ? t.startDate.toISOString().slice(0, 10)
        : ''
      const players = t.results.map((r) => ({
        name: r.player.displayName,
        nameRaw: r.rawName || r.player.displayName,
        club: r.rawClub || r.player.club || '—',
        pj: r.pj,
        pg: r.pg,
        pp: r.pp,
        efe: r.efe,
        pf: r.pf,
        pc: r.pc,
        avg: r.avg,
        pos: r.position,
      }))
      return {
        id: t.externalKey || t.id,
        dbId: t.id,
        name: t.name,
        date,
        type: t.type,
        status: t.status,
        playerCount: players.length,
        location: t.location,
        description: t.description,
        season: t.season?.name,
        players,
      }
    })

    return NextResponse.json({
      tournaments: data,
      tournamentCount: data.length,
      source: 'prisma',
    })
  } catch (error) {
    console.error('Tournaments error:', error)
    return NextResponse.json(
      { error: 'Error al obtener torneos' },
      { status: 500 }
    )
  }
}
