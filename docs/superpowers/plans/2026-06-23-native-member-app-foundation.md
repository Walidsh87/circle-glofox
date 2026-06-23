# Native member app — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `circle-mobile` Expo app foundation — OTP login, a persistent Supabase session, the data-layer + navigation patterns — so a member can log in and land on five (empty) native tabs, with the session surviving a cold restart. No feature screens yet; this is the prerequisite every screen builds on.

**Architecture:** Expo Router (file-based tabs) + a native `supabase-js` client (chunked SecureStore adapter, auto-refresh on `AppState`) + a session-gated root layout (cold-start gate so RLS reads never fire anonymously) + TanStack Query for reads. Direct-to-Supabase under the same RLS as web; `auth_box_id()` resolves off the device JWT exactly as off a web cookie.

**Tech Stack:** Expo SDK 56 / RN 0.85 / React 19 · expo-router · @supabase/supabase-js · expo-secure-store · @react-native-async-storage/async-storage · @tanstack/react-query · nativewind v4 + tailwindcss · expo-web-browser · react-native-webview (already installed).

**Spec:** `docs/superpowers/specs/2026-06-23-native-member-app-design.md` (in the `circle-fitness` repo).
**Repo for all files below:** `circle-mobile` (sibling of `circle-fitness`). The build happens there; this plan doc lives in `circle-fitness/docs` for the project record.

## Global Constraints

- **OTP only, no magic link.** Login is `signInWithOtp({ email, options: { shouldCreateUser: false } })` → `verifyOtp({ email, token, type: 'email' })`. **Never** set `emailRedirectTo`. Do not change `flowType` (web uses implicit; native supabase-js defaults to PKCE — leave both).
- **No `select('*')` ever on `boxes` or `profiles`** — those tables are column-allowlisted for `authenticated`; an ungranted column 42501-errors the whole row. Always project explicit granted columns. (Not exercised in this plan, but the data-layer pattern must bake it in.)
- **Cold-start gate:** no data query may run before `getSession()` resolves / `onAuthStateChange` fires `INITIAL_SESSION`. An unauthenticated RLS read returns empty and looks like "no data".
- **Secrets:** only the Supabase **anon** key and URL ship in the app (public by design — RLS is the wall). No service-role key, ever, in `circle-mobile`.
- **TypeScript strict.** `npx tsc --noEmit` clean before every commit.
- **Env:** `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (gitignored) + `.env.example`. `EXPO_PUBLIC_`-prefixed vars are inlined into the client bundle by Expo (correct for anon key/URL).

---

## File Structure

```
circle-mobile/
  app/                          # expo-router (file-based)
    _layout.tsx                 # root: providers (Query, Auth) + cold-start gate + redirect
    (auth)/
      _layout.tsx               # stack for unauthenticated screens
      login.tsx                 # OTP login (email → code)
    (tabs)/
      _layout.tsx               # bottom tab bar (Today/Schedule/Train/Feed/Profile)
      index.tsx                 # Today (placeholder)
      schedule.tsx              # placeholder
      train.tsx                 # placeholder
      feed.tsx                  # placeholder
      profile.tsx               # placeholder
  src/
    lib/
      supabase.ts               # supabase-js client + chunked SecureStore adapter
      query.ts                  # QueryClient
      percentage.ts             # COPIED pure lib (the wedge) — unit-tested
    auth/
      auth-context.tsx          # session provider + cold-start gate + signOut
    __tests__/
      percentage.test.ts
  global.css                    # nativewind tailwind directives
  tailwind.config.js
  babel.config.js               # + nativewind/babel + expo-router
  metro.config.js               # + nativewind metro
  nativewind-env.d.ts
  app.json                      # + expo-router plugin, scheme already set
  package.json                  # main → expo-router/entry
  .env.example
```

Old `App.tsx` / `index.ts` (the WebView shell) are **retired as the entry point** — the WebView shell code is preserved as `src/webview/FallbackWebView.tsx` for the later webview-fallback task (not wired in this plan). The new entry is `expo-router/entry`.

---

## Task 1: Install foundation dependencies + switch entry to Expo Router

**Files:**
- Modify: `circle-mobile/package.json` (deps + `main`)
- Modify: `circle-mobile/app.json` (plugins)

- [ ] **Step 1: Install SDK-correct native deps**

Run (in `circle-mobile/`):
```bash
npx expo install expo-router expo-secure-store @react-native-async-storage/async-storage @supabase/supabase-js expo-web-browser react-native-safe-area-context react-native-screens
npm install @tanstack/react-query
npm install -D nativewind tailwindcss
```
Expected: all resolve as "SDK 56 compatible"; `package.json` updates.

- [ ] **Step 2: Point the entry at Expo Router**

In `circle-mobile/package.json`, change `"main"`:
```json
"main": "expo-router/entry",
```

- [ ] **Step 3: Register the router plugin + keep the scheme**

In `circle-mobile/app.json`, add `"expo-router"` to `plugins` (alongside the existing `expo-splash-screen`, `expo-notifications`) and confirm `"scheme": "circlefitness"` is present (it is). Add `"experiments": { "typedRoutes": true }` under `expo`.

- [ ] **Step 4: Verify install**

Run: `npx tsc --noEmit`
Expected: PASS (no app/ files yet reference missing modules; if `expo-router` types complain about no `app/`, proceed — Task 2 adds it).

- [ ] **Step 5: Commit**
```bash
git add package.json app.json package-lock.json
git commit -m "feat(mobile): foundation deps + expo-router entry"
```

---

## Task 2: NativeWind (Tailwind) setup

**Files:**
- Create: `circle-mobile/tailwind.config.js`, `circle-mobile/global.css`, `circle-mobile/metro.config.js`, `circle-mobile/nativewind-env.d.ts`
- Modify: `circle-mobile/babel.config.js` (create if absent)

- [ ] **Step 1: tailwind.config.js**
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 2: global.css**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: babel.config.js**
```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  }
}
```

- [ ] **Step 4: metro.config.js**
```js
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)
module.exports = withNativeWind(config, { input: './global.css' })
```

- [ ] **Step 5: nativewind-env.d.ts**
```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add tailwind.config.js global.css metro.config.js babel.config.js nativewind-env.d.ts
git commit -m "feat(mobile): nativewind (tailwind) setup"
```

---

## Task 3: Supabase client + chunked SecureStore adapter

**Files:**
- Create: `circle-mobile/src/lib/supabase.ts`
- Create: `circle-mobile/.env.example` (and the implementer notes `.env` is gitignored + must be filled by the user)

**Interfaces:**
- Produces: `supabase` (a typed `SupabaseClient`) imported by the auth context + every data hook.

- [ ] **Step 1: .env.example**
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```
(Implementer note: tell the user to copy to `.env` and fill from the Supabase project settings — the SAME url/anon key the web app uses. `.env` is already gitignored by the Expo template.)

- [ ] **Step 2: src/lib/supabase.ts — the client with a chunked SecureStore adapter**

`expo-secure-store` rejects values > ~2 KB on Android; a Supabase session JSON can exceed that. This adapter chunks values across keys. Tokens stay encrypted (no plaintext AsyncStorage refresh token).

```ts
import 'react-native-url-polyfill/auto'
import * as SecureStore from 'expo-secure-store'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const CHUNK = 2000 // bytes per SecureStore value (< Android ~2KB limit)

// SecureStore keys must match /^[A-Za-z0-9._-]+$/. Supabase keys contain none else, but sanitize defensively.
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_')

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(safe(key))
    if (head == null) return null
    // head is either the whole value (single chunk) or a count marker "__n:<count>"
    const m = /^__n:(\d+)$/.exec(head)
    if (!m) return head
    const count = parseInt(m[1], 10)
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(safe(`${key}.${i}`))
      if (part == null) return null
      parts.push(part)
    }
    return parts.join('')
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(safe(key), value)
      return
    }
    const count = Math.ceil(value.length / CHUNK)
    await SecureStore.setItemAsync(safe(key), `__n:${count}`)
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(safe(`${key}.${i}`), value.slice(i * CHUNK, (i + 1) * CHUNK))
    }
  },
  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(safe(key))
    const m = head ? /^__n:(\d+)$/.exec(head) : null
    if (m) {
      const count = parseInt(m[1], 10)
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(safe(`${key}.${i}`))
    }
    await SecureStore.deleteItemAsync(safe(key))
  },
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env')
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no URL bar on native
  },
})
```

Run: `npx expo install react-native-url-polyfill` (imported above for `URL` support).

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/lib/supabase.ts .env.example package.json package-lock.json
git commit -m "feat(mobile): supabase client + chunked SecureStore session adapter"
```

---

## Task 4: Auth context — session provider, cold-start gate, AppState auto-refresh

**Files:**
- Create: `circle-mobile/src/auth/auth-context.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`.
- Produces: `AuthProvider` (wraps the app), `useAuth(): { session, user, initializing, signOut }`. `initializing` is the cold-start gate — true until the first auth state is known.

- [ ] **Step 1: src/auth/auth-context.tsx**
```tsx
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthValue = {
  session: Session | null
  user: User | null
  initializing: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)
  const started = useRef(false)

  useEffect(() => {
    // 1) resolve the persisted session BEFORE anything queries (cold-start gate)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setInitializing(false)
    })
    // 2) keep in sync
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setInitializing(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 3) auto-refresh only while the app is foregrounded (no middleware on device)
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    }
    if (!started.current) {
      started.current = true
      if (AppState.currentState === 'active') supabase.auth.startAutoRefresh()
    }
    const s = AppState.addEventListener('change', onChange)
    return () => s.remove()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, initializing, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/auth/auth-context.tsx
git commit -m "feat(mobile): auth context with cold-start gate + AppState auto-refresh"
```

---

## Task 5: TanStack Query client

**Files:**
- Create: `circle-mobile/src/lib/query.ts`

**Interfaces:**
- Produces: `queryClient` (a configured `QueryClient`) for the root `QueryClientProvider`.

- [ ] **Step 1: src/lib/query.ts**
```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false, // RN has no window; we refetch on screen focus instead
    },
  },
})
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/lib/query.ts
git commit -m "feat(mobile): tanstack query client"
```

---

## Task 6: Copy the wedge math (`loadForPercent`) with a failing-test-first cycle

The wedge — per-athlete kg from a stored 1RM — is the app's hero. Copy the **pure** function from the web repo (`circle-fitness/src/lib/percentage.ts`) and lock it with a test. TDD: write the test first, watch it fail, then add the implementation.

**Files:**
- Create: `circle-mobile/src/lib/percentage.ts`
- Create: `circle-mobile/src/__tests__/percentage.test.ts`
- Modify: `circle-mobile/package.json` (test script + jest-expo)

**Interfaces:**
- Produces: `loadForPercent(oneRmGrams: number | null, percent: number): number | null` and any helpers the web version exports — **match the web signature exactly** (the implementer reads `circle-fitness/src/lib/percentage.ts` and copies verbatim, including rounding rules and the `null` 1RM behavior).

- [ ] **Step 1: Install the test runner**

Run: `npx expo install jest-expo` then `npm install -D jest @types/jest`. Add to `package.json` scripts: `"test": "jest"`. Add a `jest` key: `{ "preset": "jest-expo" }`.

- [ ] **Step 2: Read the source of truth + write the failing test**

Read `circle-fitness/src/lib/percentage.ts` to get the exact behavior. Write `src/__tests__/percentage.test.ts` asserting the real contract, e.g.:
```ts
import { loadForPercent } from '../lib/percentage'

test('computes kg from 1RM grams at a percentage (rounded as web does)', () => {
  // 100 kg 1RM = 100000 g; 80% = 80 kg. (Confirm exact rounding against the web source.)
  expect(loadForPercent(100_000, 80)).toBe(80)
})

test('returns null when no 1RM is logged', () => {
  expect(loadForPercent(null, 80)).toBeNull()
})
```
(The implementer adjusts the expected values to match the web function's exact rounding — copy its test cases from `circle-fitness/src/__tests__` if present.)

- [ ] **Step 3: Run the test — watch it FAIL**

Run: `npm test`
Expected: FAIL (`percentage.ts` not created yet / function undefined).

- [ ] **Step 4: Copy the implementation verbatim from the web repo**

Create `src/lib/percentage.ts` as an exact copy of `circle-fitness/src/lib/percentage.ts` (pure, no imports of web-only modules). Add a header comment: `// Copied from circle-fitness/src/lib/percentage.ts — keep in sync until a shared package exists.`

- [ ] **Step 5: Run the test — watch it PASS**

Run: `npm test` → PASS. Run: `npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/percentage.ts src/__tests__/percentage.test.ts package.json package-lock.json
git commit -m "feat(mobile): copy wedge math (loadForPercent) + tests"
```

---

## Task 7: Root layout — providers, cold-start gate, auth redirect

**Files:**
- Create: `circle-mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `AuthProvider`/`useAuth`, `queryClient`, `QueryClientProvider`, expo-router `Slot`/`Stack`/`useRouter`/`useSegments`.

- [ ] **Step 1: app/_layout.tsx**
```tsx
import '../global.css'
import { useEffect } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '../src/auth/auth-context'
import { queryClient } from '../src/lib/query'

function Gate() {
  const { session, initializing } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (initializing) return // cold-start gate: do nothing until auth resolved
    const inAuthGroup = segments[0] === '(auth)'
    if (!session && !inAuthGroup) router.replace('/(auth)/login')
    else if (session && inAuthGroup) router.replace('/(tabs)')
  }, [session, initializing, segments])

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }
  return <Slot />
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add app/_layout.tsx
git commit -m "feat(mobile): root layout — providers + cold-start gate + auth redirect"
```

---

## Task 8: OTP login screen

**Files:**
- Create: `circle-mobile/app/(auth)/_layout.tsx`
- Create: `circle-mobile/app/(auth)/login.tsx`

- [ ] **Step 1: app/(auth)/_layout.tsx**
```tsx
import { Stack } from 'expo-router'
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

- [ ] **Step 2: app/(auth)/login.tsx — email → 6-digit code**
```tsx
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { supabase } from '../../src/lib/supabase'

export default function Login() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false }, // accounts are owner-invited, not self-created
    })
    setBusy(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  const verify = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError(error.message)
    // on success, onAuthStateChange in AuthProvider flips the gate → redirect to (tabs)
  }

  return (
    <View className="flex-1 justify-center px-6 bg-white">
      <Text className="text-2xl font-semibold mb-6">Circle Fitness</Text>
      {step === 'email' ? (
        <>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-3"
            placeholder="you@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable className="bg-black rounded-lg py-3 items-center" onPress={sendCode} disabled={busy || !email}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Send code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text className="text-gray-600 mb-3">Enter the 6-digit code sent to {email}.</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-3 tracking-widest text-center text-lg"
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          />
          <Pressable className="bg-black rounded-lg py-3 items-center" onPress={verify} disabled={busy || code.length !== 6}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Verify</Text>}
          </Pressable>
          <Pressable className="py-3 items-center" onPress={() => setStep('email')}>
            <Text className="text-gray-500">Use a different email</Text>
          </Pressable>
        </>
      )}
      {error ? <Text className="text-red-600 mt-3">{error}</Text> : null}
    </View>
  )
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add "app/(auth)/_layout.tsx" "app/(auth)/login.tsx"
git commit -m "feat(mobile): OTP login screen (email → 6-digit code)"
```

---

## Task 9: Tab bar + five placeholder screens

**Files:**
- Create: `circle-mobile/app/(tabs)/_layout.tsx`
- Create: `circle-mobile/app/(tabs)/index.tsx`, `schedule.tsx`, `train.tsx`, `feed.tsx`, `profile.tsx`

- [ ] **Step 1: app/(tabs)/_layout.tsx**
```tsx
import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="train" options={{ title: 'Train' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
```
(Icons added with a screen task later — keep titles only for the foundation.)

- [ ] **Step 2: Five placeholder screens**

Each file (`index.tsx`, `schedule.tsx`, `train.tsx`, `feed.tsx`, `profile.tsx`) — `profile.tsx` also proves sign-out wiring:
```tsx
// app/(tabs)/index.tsx (repeat pattern for schedule/train/feed; title varies)
import { Text, View } from 'react-native'
export default function Today() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-lg">Today</Text>
    </View>
  )
}
```
```tsx
// app/(tabs)/profile.tsx — includes sign out to validate the auth round-trip
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '../../src/auth/auth-context'
export default function Profile() {
  const { user, signOut } = useAuth()
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-lg mb-1">Profile</Text>
      <Text className="text-gray-500 mb-6">{user?.email}</Text>
      <Pressable className="bg-gray-900 rounded-lg px-6 py-3" onPress={signOut}>
        <Text className="text-white font-semibold">Sign out</Text>
      </Pressable>
    </View>
  )
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add "app/(tabs)"
git commit -m "feat(mobile): tab bar + placeholder screens + sign out"
```

---

## Task 10: Retire the old WebView entry; preserve the shell for the fallback task

**Files:**
- Move: `circle-mobile/App.tsx` → `circle-mobile/src/webview/FallbackWebView.tsx` (kept, not wired)
- Delete: `circle-mobile/index.ts` (Expo Router provides the entry now)

- [ ] **Step 1: Preserve the shell as a component**

Move `App.tsx` to `src/webview/FallbackWebView.tsx`. Rename the default export `App` → `FallbackWebView`. Keep `src/config.ts` + `src/lib/push.ts` as-is (used later). Add a top comment: `// The original webview shell, preserved for the phase-1 webview-fallback task (session handoff TBD). Not wired into navigation yet.`

- [ ] **Step 2: Remove the old entry**

Delete `index.ts`. (Expo Router's `expo-router/entry`, set in Task 1, is now the entry.)

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → PASS. Run: `npm test` → PASS.
```bash
git add -A
git commit -m "chore(mobile): retire webview entry; preserve shell as FallbackWebView"
```

---

## Verification (whole foundation)

- [ ] `npx tsc --noEmit` clean; `npm test` green (the wedge test).
- [ ] **Manual on a device/simulator** (the implementer cannot do this — flag it for the user):
  1. Copy `.env.example` → `.env`, fill `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (same as web).
  2. `npx expo start`, open on a phone (Expo Go is fine for this foundation — no custom native modules beyond what Expo Go bundles; if SecureStore/expo-router need a dev build, run `npx expo run:ios` / EAS dev build).
  3. App opens on the **login** screen (cold start, no session).
  4. Enter a real member's email → receive the 6-digit code → enter it → land on the **Today** tab.
  5. Kill and reopen the app → **stays logged in** (session restored from SecureStore; lands on Today, not login).
  6. Profile tab → **Sign out** → bounced back to login.
- [ ] No `select('*')` anywhere; no service-role key; `.env` gitignored.

## What this plan deliberately does NOT do (next plans)
- Any real data screen (Today/Train/Feed/Schedule/Profile content) — those are the next plans, built on the `useAuth` + TanStack Query + supabase patterns proven here, each with its exact verified queries from the spec.
- The webview fallback + session-handoff bridge (native side + the web-side `setSession` bridge in `circle-fitness`).
- The web-repo "direct-read hardening" PR (separate plan, before wider distribution).
- Tab-bar icons, theming, native push.
