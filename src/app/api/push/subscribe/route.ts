import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOptionalUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Body = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
  topics?: string[]
  userAgent?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
    const p256dh = body.keys?.p256dh
    const auth = body.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'endpoint y keys (p256dh, auth) son requeridos' },
        { status: 400 }
      )
    }

    const user = await getOptionalUser(req)
    const userId = user?.id ?? null

    const topics = Array.isArray(body.topics) && body.topics.length
      ? body.topics
      : ['ranking', 'tournaments', 'results']

    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        endpoint,
        p256dh,
        auth,
        userAgent: body.userAgent?.slice(0, 300) || null,
        userId,
        topics: JSON.stringify(topics),
        active: true,
      },
      update: {
        p256dh,
        auth,
        userAgent: body.userAgent?.slice(0, 300) || null,
        userId: userId || undefined,
        topics: JSON.stringify(topics),
        active: true,
      },
    })

    return NextResponse.json({
      ok: true,
      id: sub.id,
      topics,
    })
  } catch (error) {
    console.error('[push/subscribe]', error)
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 })
  }
}
