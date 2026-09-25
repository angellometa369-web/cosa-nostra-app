// @ts-ignore
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
  topic?: string
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  const subject = process.env.VAPID_SUBJECT || 'mailto:natalebong@hotmail.com'
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configurados en .env')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || ''
}

export async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
) {
  configureWebPush()
  const subscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  }
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/index.html',
    tag: payload.tag || 'cosa-nostra',
    topic: payload.topic || 'general',
  })
  return webpush.sendNotification(subscription, body, {
    TTL: 60 * 60 * 12,
    urgency: 'normal',
  })
}

export async function broadcastPush(
  payload: PushPayload,
  opts?: { topic?: string; userId?: string }
) {
  const where: {
    active: boolean
    userId?: string
  } = { active: true }
  if (opts?.userId) where.userId = opts.userId

  const subs = await prisma.pushSubscription.findMany({ where })
  const topic = opts?.topic || payload.topic
  let sent = 0
  let failed = 0
  const dead: string[] = []

  for (const sub of subs) {
    if (topic) {
      try {
        const topics: string[] = JSON.parse(sub.topics || '[]')
        if (topics.length && !topics.includes(topic) && !topics.includes('all')) {
          continue
        }
      } catch {
        /* ignore bad topics */
      }
    }
    try {
      await sendPushToSubscription(sub, payload)
      sent++
    } catch (err: unknown) {
      failed++
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        dead.push(sub.id)
      }
      console.error('[push] send failed', sub.endpoint.slice(0, 48), status || err)
    }
  }

  if (dead.length) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: dead } },
      data: { active: false },
    })
  }

  return { sent, failed, total: subs.length, deactivated: dead.length }
}
