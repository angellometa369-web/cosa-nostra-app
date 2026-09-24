import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/admin/tournaments/[id] */
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

    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (['individual', 'parejas', 'equipos'].includes(body.type)) data.type = body.type
    if (['upcoming', 'ongoing', 'finished'].includes(body.status)) data.status = body.status
    if (body.format !== undefined) data.format = body.format
    if (body.location !== undefined)
      data.location = typeof body.location === 'string' ? body.location.trim() : null
    if (body.description !== undefined)
      data.description = typeof body.description === 'string' ? body.description.trim() : null
    if (body.startDate !== undefined) {
      data.startDate = body.startDate ? new Date(body.startDate + 'T12:00:00') : null
    }
    if (body.endDate !== undefined) {
      data.endDate = body.endDate ? new Date(body.endDate + 'T12:00:00') : null
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const tournament = await prisma.tournament.update({ where: { id }, data })
    return NextResponse.json({ ok: true, tournament })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
    }
    console.error('[admin/tournaments PATCH]', error)
    return NextResponse.json({ error: 'Error al actualizar torneo' }, { status: 500 })
  }
}

/** DELETE /api/admin/tournaments/[id] — borra torneo y resultados (cascade) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const { id } = await ctx.params
    await prisma.tournament.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
    }
    console.error('[admin/tournaments DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar torneo' }, { status: 500 })
  }
}
