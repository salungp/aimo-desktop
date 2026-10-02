import { useSyncExternalStore } from 'react'

/* Watchlist + recently viewed markets, shared by Discover and Trade (per browser). */
const FAV_KEY = 'aimo:favs', RECENT_KEY = 'aimo:recent'
const read = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

let favs = read(FAV_KEY), recent = read(RECENT_KEY)
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export const useFavs = () => useSyncExternalStore(sub, () => favs)
export const useRecent = () => useSyncExternalStore(sub, () => recent)
/** Returns true when the item is now watched. */
export function toggleFav(id: string) {
  favs = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
  write(FAV_KEY, favs); emit()
  return favs.includes(id)
}
export function pushRecent(id: string) {
  if (recent[0] === id) return
  recent = [id, ...recent.filter((x) => x !== id)].slice(0, 12)
  write(RECENT_KEY, recent); emit()
}
