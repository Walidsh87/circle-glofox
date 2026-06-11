'use client'

import { useEffect, useState, useTransition } from 'react'
import { savePushSubscription, deletePushSubscription } from '../_actions/push-subscription'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

type CardState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'ready' | 'subscribed'

export function PushCard({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<CardState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!vapidPublicKey) return
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    if (isIos && !standalone) { setState('ios-install'); return }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'subscribed' : 'ready'))
      .catch(() => setState('unsupported'))
  }, [vapidPublicKey])

  function enable() {
    setError(null)
    start(async () => {
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') { setState('denied'); return }
        const reg = await navigator.serviceWorker.register('/sw.js')
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) })
        const json = sub.toJSON()
        const res = await savePushSubscription(sub.endpoint, json.keys?.p256dh ?? '', json.keys?.auth ?? '')
        if (res.error) { setError(res.error); await sub.unsubscribe(); return }
        setState('subscribed')
      } catch {
        setError('Could not enable notifications on this device.')
      }
    })
  }

  function disable() {
    setError(null)
    start(async () => {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) { await deletePushSubscription(sub.endpoint); await sub.unsubscribe() }
      setState('ready')
    })
  }

  if (!vapidPublicKey || state === 'loading' || state === 'unsupported') return null
  return (
    <details style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, boxShadow: 'var(--c-shadow-sm)' }}>
      <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', cursor: 'pointer' }}>🔔 Class notifications</summary>
      <div style={{ marginTop: 10 }}>
        {state === 'ios-install' && (
          <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', lineHeight: 1.6 }}>
            On iPhone: open this site in Safari, tap <strong>Share → Add to Home Screen</strong>, then open the Circle app icon and enable notifications here.
          </p>
        )}
        {state === 'denied' && <p style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Notifications are blocked for this site — allow them in your browser settings, then reload.</p>}
        {(state === 'ready' || state === 'subscribed') && (
          <>
            <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Get a push when a waitlist spot opens and a morning reminder on days you have a class booked.
            </p>
            {state === 'ready' ? (
              <button type="button" disabled={pending} onClick={enable} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Enable notifications</button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>✓ Enabled on this device</span>
                <button type="button" disabled={pending} onClick={disable} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12, color: 'var(--c-danger)', cursor: 'pointer' }}>Disable</button>
              </div>
            )}
          </>
        )}
        {error && <p style={{ fontSize: 12, color: 'var(--c-danger)', marginTop: 8 }}>{error}</p>}
      </div>
    </details>
  )
}
