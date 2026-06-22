'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toEmbedUrl, movementSlug } from '@/lib/movement-video'
import { saveMovementVideo, deleteMovementVideo } from '../_actions/video'

type Item = { slug: string; label: string }
type Video = { slug: string; label: string; video_url: string }

const input = 'h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3 py-1 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'

function Player({ url }: { url: string }) {
  const embed = toEmbedUrl(url)
  if (!embed) return <p className="text-[12px] text-ink-faint">Invalid video link.</p>
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
      <iframe
        src={embed.embedUrl}
        title="Movement demo"
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

function MovementRow({ item, video, canManage }: { item: Item; video: Video | undefined; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(video?.video_url ?? '')

  function save() {
    start(async () => {
      const res = await saveMovementVideo(item.slug, item.label, url)
      if (res.error) { alert(res.error); return }
      setEditing(false); router.refresh()
    })
  }
  function remove() {
    if (!confirm(`Remove the video for ${item.label}?`)) return
    start(async () => {
      const res = await deleteMovementVideo(item.slug)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  return (
    <div id={item.slug} className="scroll-mt-20 rounded-[12px] border border-line bg-surface p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[13.5px] font-semibold text-ink">{item.label}</span>
        {canManage && !editing && (
          <button type="button" className={btn} onClick={() => { setUrl(video?.video_url ?? ''); setEditing(true) }}>
            {video ? 'Edit' : 'Add video'}
          </button>
        )}
        {canManage && video && !editing && (
          <button type="button" className={btn} disabled={pending} onClick={remove}>Remove</button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <input className={input} placeholder="YouTube or Vimeo link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className={limeBtn} disabled={pending || !url.trim()} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
            <button type="button" className={btn} disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : video ? (
        <Player url={video.video_url} />
      ) : (
        <p className="text-[12px] text-ink-faint">No video yet.</p>
      )}
    </div>
  )
}

function AddCustom() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  function add() {
    const slug = movementSlug(label)
    if (!slug) { alert('Give the movement a name.'); return }
    start(async () => {
      const res = await saveMovementVideo(slug, label, url)
      if (res.error) { alert(res.error); return }
      setLabel(''); setUrl(''); router.refresh()
    })
  }
  return (
    <div className="rounded-[12px] border border-dashed border-line-strong bg-surface p-3.5">
      <div className="mb-2 text-[12px] font-semibold text-ink-2">Add a gym movement</div>
      <div className="flex flex-col gap-2">
        <input className={input} placeholder="Movement name (e.g. Double-unders)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className={input} placeholder="YouTube or Vimeo link" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className={limeBtn + ' self-start'} disabled={pending || !label.trim() || !url.trim()} onClick={add}>{pending ? 'Adding…' : 'Add movement'}</button>
      </div>
    </div>
  )
}

export function MovementLibrary({ catalog, custom, videos, canManage }: { catalog: Item[]; custom: Item[]; videos: Record<string, Video>; canManage: boolean }) {
  // Members see only movements that have a video; staff see the full catalog to curate.
  const catalogShown = canManage ? catalog : catalog.filter((c) => videos[c.slug])
  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <section>
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Weightlifting catalog</div>
        {catalogShown.length === 0 ? (
          <p className="text-[13px] text-ink-3">No movement videos yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalogShown.map((c) => <MovementRow key={c.slug} item={c} video={videos[c.slug]} canManage={canManage} />)}
          </div>
        )}
      </section>

      {(custom.length > 0 || canManage) && (
        <section>
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Gym movements</div>
          <div className="flex flex-col gap-2.5">
            {custom.map((c) => <MovementRow key={c.slug} item={c} video={videos[c.slug]} canManage={canManage} />)}
            {canManage && <AddCustom />}
          </div>
        </section>
      )}
    </div>
  )
}
