import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOptionalUser, requireAdmin, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/notifications?limit=40
 * Lista notificaciones globales + las del usuario (si hay sesión).
 * Incluye flag `read` cuando el usuario está autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getOptionalUser(req)
    const limitParam = req.nextUrl.searchParams.get('limit')
    const limit = Math.min(80, Math.max(1, Number(limitParam) || 40))
    const now = new Date()

    const where = {
      AND: [
        {
          OR: user
            ? [{ userId: null }, { userId: user.id }]
            : [{ userId: null }],
        },
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      ],
    }

    const items = await prisma.inAppNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    let readSet = new Set<string>()
    if (user && items.length) {
      const reads = await prisma.notificationRead.findMany({
        where: {
          userId: user.id,
          notificationId: { in: items.map((n) => n.id) },
        },
        select: { notificationId: true },
      })
      readSet = new Set(reads.map((r) => r.notificationId))
    }

    // Huéspedes: leídas vía header X-Read-Ids (opcional, no requerido)
    const guestReadHeader = req.headers.get('x-read-ids')
    if (!user && guestReadHeader) {
      guestReadHeader.split(',').forEach((id) => readSet.add(id.trim()))
    }

    const notifications = items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      url: n.url,
      topic: n.topic,
      createdAt: n.createdAt.toISOString(),
      read: readSet.has(n.id),
      personal: Boolean(n.userId),
    }))

    const unread = notifications.filter((n) => !n.read).length

    return NextResponse.json({ notifications, unread, total: notifications.length })
  } catch (error) {
    console.error('[notifications GET]', error)
    return NextResponse.json({ error: 'Error al listar notificaciones' }, { status: 500 })
  }
}

/**
 * POST /api/notifications
 * Admin: crea notificación in-app (broadcast o a un userId).
 * Body: { title, body, type?, url?, topic?, userId? }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req)
  } catch (error) {
    const { body, status } = authErrorResponse(error)
    return NextResponse.json(body, { status })
  }

  try {
    const body = await req.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!title || !text) {
      return NextResponse.json({ error: 'title y body son requeridos' }, { status: 400 })
    }

    const allowed = new Set(['info', 'success', 'ranking', 'tournament', 'system', 'result'])
    const type = allowed.has(body.type) ? body.type : 'info'

    const notification = await prisma.inAppNotification.create({
      data: {
        title,
        body: text,
        type,
        url: typeof body.url === 'string' ? body.url : null,
        topic: typeof body.topic === 'string' ? body.topic : null,
        userId: typeof body.userId === 'string' ? body.userId : null,
      },
    })

    return NextResponse.json({
      ok: true,
      notification: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        url: notification.url,
        createdAt: notification.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[notifications POST]', error)
    return NextResponse.json({ error: 'Error al crear notificación' }, { status: 500 })
  }
}
