import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/notifications/read
 * Body: { ids: string[] } | { all: true }
 */
export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireAuth(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const body = await req.json()
    const now = new Date()

    if (body.all === true) {
      const items = await prisma.inAppNotification.findMany({
        where: {
          AND: [
            { OR: [{ userId: null }, { userId: user.id }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        select: { id: true },
      })
      await Promise.all(
        items.map((n) =>
          prisma.notificationRead.upsert({
            where: {
              notificationId_userId: { notificationId: n.id, userId: user.id },
            },
            create: { notificationId: n.id, userId: user.id },
            update: { readAt: now },
          })
        )
      )
      return NextResponse.json({ ok: true, marked: items.length })
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
    if (!ids.length) {
      return NextResponse.json({ error: 'ids o all requeridos' }, { status: 400 })
    }

    await Promise.all(
      ids.map((id: string) =>
        prisma.notificationRead.upsert({
          where: {
            notificationId_userId: { notificationId: id, userId: user.id },
          },
          create: { notificationId: id, userId: user.id },
          update: { readAt: now },
        })
      )
    )

    return NextResponse.json({ ok: true, marked: ids.length })
  } catch (error) {
    console.error('[notifications/read]', error)
    return NextResponse.json({ error: 'Error al marcar leídas' }, { status: 500 })
  }
}
