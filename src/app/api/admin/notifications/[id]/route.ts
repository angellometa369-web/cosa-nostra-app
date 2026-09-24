import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** DELETE /api/admin/notifications/[id] */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const { id } = await ctx.params
    await prisma.inAppNotification.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })
    }
    console.error('[admin/notifications DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar notificación' }, { status: 500 })
  }
}

/** PATCH /api/admin/notifications/[id] */
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
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
    if (typeof body.body === 'string' && body.body.trim()) data.body = body.body.trim()
    if (typeof body.type === 'string') data.type = body.type
    if (body.url !== undefined) data.url = body.url
    if (body.topic !== undefined) data.topic = body.topic

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const notification = await prisma.inAppNotification.update({ where: { id }, data })
    return NextResponse.json({ ok: true, notification })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })
    }
    console.error('[admin/notifications PATCH]', error)
    return NextResponse.json({ error: 'Error al actualizar notificación' }, { status: 500 })
  }
}
