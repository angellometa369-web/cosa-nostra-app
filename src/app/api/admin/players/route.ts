import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** GET /api/admin/players — listado completo (admin) */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    const players = await prisma.player.findMany({
      where: q
        ? {
            OR: [
              { displayName: { contains: q } },
              { normalizedName: { contains: normalizeName(q) } },
              { club: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ wins: 'desc' }, { displayName: 'asc' }],
      include: {
        user: { select: { id: true, email: true, role: true } },
        _count: { select: { tournamentResults: true } },
      },
    })

    return NextResponse.json({
      players: players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        club: p.club,
        wins: p.wins,
        losses: p.losses,
        efficiency: p.efficiency,
        rankingPoints: p.rankingPoints,
        tournamentsPlayed: p.tournamentsPlayed,
        active: p.active,
        resultsCount: p._count.tournamentResults,
        userId: p.user?.id ?? null,
        userEmail: p.user?.email ?? null,
        userRole: p.user?.role ?? null,
      })),
      total: players.length,
    })
  } catch (error) {
    console.error('[admin/players GET]', error)
    return NextResponse.json({ error: 'Error al listar jugadores' }, { status: 500 })
  }
}

/** POST /api/admin/players — crear jugador */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const body = await req.json()
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    if (!displayName) {
      return NextResponse.json({ error: 'displayName es requerido' }, { status: 400 })
    }

    const club = typeof body.club === 'string' ? body.club.trim() : null
    const userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : null
    const wins = Number(body.wins) || 0
    const losses = Number(body.losses) || 0
    const tournamentsPlayed = Number(body.tournamentsPlayed) || 0
    const rankingPoints = Number(body.rankingPoints) || 1000
    const efficiency =
      body.efficiency != null
        ? Number(body.efficiency)
        : wins + losses > 0
          ? wins / (wins + losses)
          : 0

    const player = await prisma.player.create({
      data: {
        displayName,
        normalizedName: normalizeName(displayName),
        club,
        normalizedClub: club ? normalizeName(club) : null,
        userId,
        wins,
        losses,
        tournamentsPlayed,
        rankingPoints,
        efficiency,
        active: body.active !== false,
      },
    })

    return NextResponse.json({ ok: true, player }, { status: 201 })
  } catch (error) {
    console.error('[admin/players POST]', error)
    return NextResponse.json({ error: 'Error al crear jugador' }, { status: 500 })
  }
}
