import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint requerido' }, { status: 400 })
    }

    await prisma.pushSubscription.updateMany({
      where: { endpoint },
      data: { active: false },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[push/unsubscribe]', error)
    return NextResponse.json({ error: 'Error al desactivar suscripción' }, { status: 500 })
  }
}
