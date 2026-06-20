// Generic "group rows into a Map" helpers — the hand-rolled
// `const arr = map.get(k) ?? []; arr.push(x); map.set(k, arr)` loop, once.

/** Group items into a Map keyed by `key(item)`; each entry is the items with that key, in input order. */
export function groupBy<T, K>(items: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = map.get(k)
    if (arr) arr.push(item)
    else map.set(k, [item])
  }
  return map
}
