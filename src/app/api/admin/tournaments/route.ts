import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/tournaments */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { results: true } },
        season: { select: { name: true } },
      },
    })

    return NextResponse.json({
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        format: t.format,
        startDate: t.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: t.endDate?.toISOString().slice(0, 10) ?? null,
        location: t.location,
        description: t.description,
        externalKey: t.externalKey,
        resultsCount: t._count.results,
        season: t.season?.name ?? null,
      })),
      total: tournaments.length,
    })
  } catch (error) {
    console.error('[admin/tournaments GET]', error)
    return NextResponse.json({ error: 'Error al listar torneos' }, { status: 500 })
  }
}

/** POST /api/admin/tournaments */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name es requerido' }, { status: 400 })
    }

    const type = ['individual', 'parejas', 'equipos'].includes(body.type)
      ? body.type
      : 'individual'
    const status = ['upcoming', 'ongoing', 'finished'].includes(body.status)
      ? body.status
      : 'upcoming'

    let season = await prisma.season.findFirst({ where: { status: 'active' } })
    if (!season) {
      season = await prisma.season.create({
        data: {
          name: 'Temporada 2026',
          year: 2026,
          startDate: new Date('2026-01-01'),
          status: 'active',
        },
      })
    }

    const startDate = body.startDate ? new Date(body.startDate + 'T12:00:00') : null

    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        name,
        type,
        status,
        format: typeof body.format === 'string' ? body.format : 'swiss',
        startDate,
        endDate: body.endDate ? new Date(body.endDate + 'T12:00:00') : startDate,
        location: typeof body.location === 'string' ? body.location.trim() : null,
        description: typeof body.description === 'string' ? body.description.trim() : null,
        externalSource: 'manual',
        externalKey: `manual|${name}|${body.startDate || Date.now()}`,
      },
    })

    return NextResponse.json({ ok: true, tournament }, { status: 201 })
  } catch (error) {
    console.error('[admin/tournaments POST]', error)
    return NextResponse.json({ error: 'Error al crear torneo' }, { status: 500 })
  }
}
