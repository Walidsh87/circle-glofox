# Class Template Edit Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Edit button to each class template row that opens a modal form pre-populated with the template's current values, allowing owners/coaches to update name, weekday, start time, capacity, and coach.

**Architecture:** Mirror the `create-template.ts` / `add-template-form.tsx` pattern. A new server action `editTemplate` takes `templateId` as a bound parameter plus form data. A new `EditTemplateForm` client component uses `useFormState` with the bound action. The modal overlay is rendered inline inside `TemplateActions` using `useState` — no external dialog library needed; pure inline styles match the existing codebase style.

**Tech Stack:** Next.js 14 App Router server actions, `useFormState` / `useFormStatus` (react-dom), Supabase Postgres + RLS, inline styles + shadcn `Button`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/dashboard/classes/_actions/edit-template.ts` | Server action: validate inputs, auth check, UPDATE class_templates by id + box_id |
| Create | `src/app/dashboard/classes/_components/edit-template-form.tsx` | Client form: pre-populated fields, `useFormState`, calls `onSuccess` on save |
| Modify | `src/app/dashboard/classes/_components/template-actions.tsx` | Add Edit button + inline modal overlay that mounts `EditTemplateForm` |
| Modify | `src/app/dashboard/classes/page.tsx` | Pass all template fields + coaches list as props to `TemplateActions` |
| Create | `src/__tests__/edit-template.test.ts` | Unit tests for the exported `validateEditTemplateInput` pure function |

---

## Task 1: Server action — `edit-template.ts`

**Files:**
- Create: `src/app/dashboard/classes/_actions/edit-template.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type State = { error: string | null; saved?: boolean }

export function validateEditTemplateInput(name: string, startTime: string, weekday: number): string | null {
  if (!name || !startTime || isNaN(weekday)) return 'Name, weekday, and start time are required.'
  return null
}

export async function editTemplate(
  templateId: string,
  prevState: State,
  formData: FormData,
): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const weekday = parseInt(formData.get('weekday') as string)
  const startTime = formData.get('startTime') as string
  const capacity = parseInt(formData.get('capacity') as string) || 12
  const coachId = (formData.get('coachId') as string) || null

  const validationError = validateEditTemplateInput(name, startTime, weekday)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage class templates.' }
  }

  const { error } = await supabase
    .from('class_templates')
    .update({
      name,
      weekday,
      start_time: startTime,
      capacity,
      coach_id: coachId || null,
    })
    .eq('id', templateId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/classes')
  return { error: null, saved: true }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: 0 errors.

---

## Task 2: Unit tests for `validateEditTemplateInput`

**Files:**
- Create: `src/__tests__/edit-template.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
import { validateEditTemplateInput } from '@/app/dashboard/classes/_actions/edit-template'

describe('validateEditTemplateInput', () => {
  test('returns error when name is empty', () => {
    expect(validateEditTemplateInput('', '06:00', 1)).toBe('Name, weekday, and start time are required.')
  })

  test('returns error when name is whitespace only', () => {
    expect(validateEditTemplateInput('   ', '06:00', 1)).toBe('Name, weekday, and start time are required.')
  })

  test('returns error when startTime is empty', () => {
    expect(validateEditTemplateInput('CrossFit 6AM', '', 1)).toBe('Name, weekday, and start time are required.')
  })

  test('returns error when weekday is NaN', () => {
    expect(validateEditTemplateInput('CrossFit 6AM', '06:00', NaN)).toBe('Name, weekday, and start time are required.')
  })

  test('returns null for valid inputs', () => {
    expect(validateEditTemplateInput('CrossFit 6AM', '06:00', 1)).toBeNull()
  })

  test('returns null for weekday 0 (Sunday)', () => {
    expect(validateEditTemplateInput('Sunday Yoga', '09:00', 0)).toBeNull()
  })

  test('returns null for weekday 6 (Saturday)', () => {
    expect(validateEditTemplateInput('Saturday WOD', '08:00', 6)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect them to pass (pure function, no mocking needed)**

```bash
npm run test -- edit-template
```

Expected output:
```
✓ returns error when name is empty
✓ returns error when name is whitespace only
✓ returns error when startTime is empty
✓ returns error when weekday is NaN
✓ returns null for valid inputs
✓ returns null for weekday 0 (Sunday)
✓ returns null for weekday 6 (Saturday)

Test Files  1 passed (1)
Tests  7 passed (7)
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/classes/_actions/edit-template.ts src/__tests__/edit-template.test.ts
git commit -m "feat(classes): edit-template server action + validation tests"
```

---

## Task 3: `EditTemplateForm` client component

**Files:**
- Create: `src/app/dashboard/classes/_components/edit-template-form.tsx`

- [ ] **Step 1: Create the component**

Note: The `name` prop shadows the HTML `name` attribute on inputs — use `defaultName` etc. for props to avoid confusion. `useFormState` detects success by `state.saved === true` (initial state has no `saved` key, so it won't fire on mount).

```tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { editTemplate } from '../_actions/edit-template'
import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : 'Save changes'}
    </Button>
  )
}

type Coach = { id: string; full_name: string }

type Props = {
  templateId: string
  defaultName: string
  defaultWeekday: number
  defaultStartTime: string
  defaultCapacity: number
  defaultCoachId: string | null
  coaches: Coach[]
  onSuccess: () => void
}

export function EditTemplateForm({
  templateId,
  defaultName,
  defaultWeekday,
  defaultStartTime,
  defaultCapacity,
  defaultCoachId,
  coaches,
  onSuccess,
}: Props) {
  const boundAction = editTemplate.bind(null, templateId)
  const [state, formAction] = useFormState(boundAction, { error: null })

  useEffect(() => {
    if (state.saved) onSuccess()
  }, [state.saved])

  const inputStyle = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--c-border)',
    background: 'var(--c-background)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    color: 'var(--c-ink)',
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
          Class name
        </label>
        <input
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          placeholder="e.g. CrossFit 6 AM"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Day
          </label>
          <select name="weekday" required defaultValue={defaultWeekday} style={inputStyle}>
            {WEEKDAYS.map((day, i) => (
              <option key={i} value={i}>{day}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Start time
          </label>
          <input
            name="startTime"
            type="time"
            required
            defaultValue={defaultStartTime}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Capacity
          </label>
          <input
            name="capacity"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={defaultCapacity}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Coach
          </label>
          <select name="coachId" defaultValue={defaultCoachId ?? ''} style={inputStyle}>
            <option value="">No coach</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <SubmitButton />
        {state.error && (
          <p style={{ fontSize: 12, color: 'var(--c-destructive)' }}>{state.error}</p>
        )}
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: 0 errors.

---

## Task 4: Update `TemplateActions` — add Edit button + modal overlay

**Files:**
- Modify: `src/app/dashboard/classes/_components/template-actions.tsx`

The `TemplateActions` component gains new props for all editable fields plus the coaches list. When the Edit button is clicked, `showEdit` flips to `true` and a fixed modal overlay renders over the page. Clicking the `✕` button or successful save dismisses it.

- [ ] **Step 1: Replace the entire file content**

```tsx
'use client'

import { useState } from 'react'
import { toggleTemplate } from '../_actions/toggle-template'
import { deleteTemplate } from '../_actions/delete-template'
import { EditTemplateForm } from './edit-template-form'
import { Button } from '@/components/ui/button'

type Coach = { id: string; full_name: string }

export function TemplateActions({
  templateId,
  active,
  name,
  weekday,
  startTime,
  capacity,
  coachId,
  coaches,
}: {
  templateId: string
  active: boolean
  name: string
  weekday: number
  startTime: string
  capacity: number
  coachId: string | null
  coaches: Coach[]
}) {
  const [loading, setLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  async function handleToggle() {
    setLoading(true)
    const { error } = await toggleTemplate(templateId, !active)
    if (error) alert(error)
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setLoading(true)
    const { error } = await deleteTemplate(templateId)
    if (error) alert(error)
    setLoading(false)
  }

  return (
    <>
      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)} disabled={loading}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={handleToggle} disabled={loading}>
          {active ? 'Deactivate' : 'Activate'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={loading}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          Delete
        </Button>
      </div>

      {showEdit && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 14,
            padding: '24px',
            width: 480,
            maxWidth: '90vw',
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 18,
            }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>
                Edit class template
              </p>
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>✕</Button>
            </div>
            <EditTemplateForm
              templateId={templateId}
              defaultName={name}
              defaultWeekday={weekday}
              defaultStartTime={startTime}
              defaultCapacity={capacity}
              defaultCoachId={coachId}
              coaches={coaches}
              onSuccess={() => setShowEdit(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: 0 errors. (Will show errors until Task 5 is done because `page.tsx` still passes old props.)

---

## Task 5: Update `page.tsx` — pass new props to `TemplateActions`

**Files:**
- Modify: `src/app/dashboard/classes/page.tsx`

The table row currently renders `<TemplateActions templateId={t.id} active={t.active} name={t.name} />`. It needs to pass all editable fields and the coaches list.

- [ ] **Step 1: Update the `TemplateActions` call inside the table row**

Find this block in `page.tsx` (around line 116):

```tsx
{isStaff && (
  <td style={{ padding: '12px 16px' }}>
    <TemplateActions templateId={t.id} active={t.active} name={t.name} />
  </td>
)}
```

Replace with:

```tsx
{isStaff && (
  <td style={{ padding: '12px 16px' }}>
    <TemplateActions
      templateId={t.id}
      active={t.active}
      name={t.name}
      weekday={t.weekday}
      startTime={t.start_time}
      capacity={t.capacity}
      coachId={t.coach_id}
      coaches={coaches ?? []}
    />
  </td>
)}
```

- [ ] **Step 2: Verify TypeScript compiles with 0 errors**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Run all tests**

```bash
npm run test
```

Expected: all passing, including the 7 new `edit-template` tests.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/classes/_components/edit-template-form.tsx \
        src/app/dashboard/classes/_components/template-actions.tsx \
        src/app/dashboard/classes/page.tsx
git commit -m "feat(classes): edit template modal — Edit button, form, overlay"
```

---

## Task 6: Smoke test in the browser

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to `/dashboard/classes` as owner or coach**

- [ ] **Step 3: Click Edit on any template row**
  - Modal should open with all fields pre-filled (name, day, time, capacity, coach).

- [ ] **Step 4: Change the class name and click Save changes**
  - Modal should close.
  - Table row should immediately show the updated name (Next.js revalidation).

- [ ] **Step 5: Click Edit again, leave all fields unchanged, click Save changes**
  - Should succeed silently.

- [ ] **Step 6: Click Edit, clear the name field, click Save changes**
  - Should show inline error: "Name, weekday, and start time are required."
  - Modal should stay open.

- [ ] **Step 7: Click ✕ to dismiss without saving**
  - Modal closes, no changes.

- [ ] **Step 8: Update scoreboard in `GymGlofox.md`**

In `GymGlofox.md`, find:

```
| 4 | Class template CRUD (recurring weekly) | 🚧 | Create, delete, toggle-active present. **No edit form** for name/day/time/capacity |
```

Replace with:

```
| 4 | Class template CRUD (recurring weekly) | ✅ | Full CRUD — create, edit (modal), delete, toggle-active |
```

Also update the scoreboard row:

```
| **v1 (11 features)** | 10 ✅ shipped clean · 1 🚧 partial (#4 class template edit form missing) |
```

to:

```
| **v1 (11 features)** | 11 ✅ all shipped — v1 complete |
```

And the "Next session priority" row:

```
| **Next session priority** | 🚧 v1 backfill: class template edit form (#4, ~30 min). Then resume Packages PR. |
```

to:

```
| **Next session priority** | v1 complete ✅ — resume Packages PR (Multi-PSP #10 PR-2) |
```

And the `v1 backfill plan` section — remove the `#4` item entirely (or mark ✅).

- [ ] **Step 9: Final commit**

```bash
git add GymGlofox.md
git commit -m "docs(scope): v1 complete — class template edit form shipped (#4)"
```
