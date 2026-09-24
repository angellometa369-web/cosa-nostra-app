import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** PATCH /api/admin/players/[id] */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const { id } = await ctx.params
    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (typeof body.displayName === 'string' && body.displayName.trim()) {
      data.displayName = body.displayName.trim()
      data.normalizedName = normalizeName(body.displayName.trim())
    }
    if (body.club !== undefined) {
      const club = typeof body.club === 'string' ? body.club.trim() : null
      data.club = club
      data.normalizedClub = club ? normalizeName(club) : null
    }
    if (body.userId !== undefined) {
      data.userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : null
    }
    if (body.wins !== undefined) data.wins = Number(body.wins) || 0
    if (body.losses !== undefined) data.losses = Number(body.losses) || 0
    if (body.tournamentsPlayed !== undefined)
      data.tournamentsPlayed = Number(body.tournamentsPlayed) || 0
    if (body.rankingPoints !== undefined) data.rankingPoints = Number(body.rankingPoints) || 0
    if (body.efficiency !== undefined) data.efficiency = Number(body.efficiency) || 0
    if (body.active !== undefined) data.active = Boolean(body.active)

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const player = await prisma.player.update({ where: { id }, data })
    return NextResponse.json({ ok: true, player })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
    }
    console.error('[admin/players PATCH]', error)
    return NextResponse.json({ error: 'Error al actualizar jugador' }, { status: 500 })
  }
}

/** DELETE /api/admin/players/[id] */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const { id } = await ctx.params
    // Soft delete preferible si tiene resultados; hard si no
    const count = await prisma.tournamentResult.count({ where: { playerId: id } })
    if (count > 0) {
      const player = await prisma.player.update({
        where: { id },
        data: { active: false },
      })
      return NextResponse.json({
        ok: true,
        softDeleted: true,
        message: 'Jugador desactivado (tiene resultados de torneo).',
        player,
      })
    }
    await prisma.player.delete({ where: { id } })
    return NextResponse.json({ ok: true, softDeleted: false })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
    }
    console.error('[admin/players DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar jugador' }, { status: 500 })
  }
}
