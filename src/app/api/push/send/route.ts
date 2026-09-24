import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, authErrorResponse } from '@/lib/auth'
import { broadcastPush } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/push/send
 * Admin: envía notificación push a suscriptores.
 * Body: { title, body, url?, tag?, topic? }
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

    const url = typeof body.url === 'string' ? body.url : '/index.html'
    const topic = typeof body.topic === 'string' ? body.topic : 'results'
    const type = typeof body.type === 'string' ? body.type : 'result'

    // In-app + Web Push
    const { prisma } = await import('@/lib/prisma')
    const inApp = await prisma.inAppNotification.create({
      data: {
        title,
        body: text,
        type,
        url,
        topic,
        userId: null,
      },
    })

    const result = await broadcastPush(
      {
        title,
        body: text,
        url,
        tag: typeof body.tag === 'string' ? body.tag : 'cosa-nostra',
        topic,
      },
      { topic }
    )

    return NextResponse.json({ ok: true, inAppId: inApp.id, ...result })
  } catch (error) {
    console.error('[push/send]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al enviar push' },
      { status: 500 }
    )
  }
}
