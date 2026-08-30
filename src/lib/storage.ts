export const STORAGE_KEY = "scenario-modeler-inputs";

type Backend = "host" | "local" | "memory";

interface HostStorage {
  get(key: string, raw: boolean): Promise<{ value?: string } | null>;
  set(key: string, value: string, raw: boolean): Promise<void>;
  delete(key: string, raw: boolean): Promise<void>;
}

declare global {
  interface Window {
    storage?: HostStorage;
  }
}

// Storage adapter. Prefers the host-provided async `window.storage` when present
// (Claude artifact runtime), falls back to localStorage for a normal browser
// deploy (GitHub Pages, Vercel, local file), and finally to an in-memory map so
// the app still runs in a sandboxed iframe with storage disabled.
// Everything is async so callers don't care which backend is live.
const memoryStore = new Map<string, string>();

export const storage = {
  backend: "memory" as Backend,

  _detect(): Backend {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
      return "host";
    }
    try {
      const probe = "__st_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return "local";
    } catch (e) {
      return "memory";
    }
  },

  async get(key: string): Promise<string | null> {
    const backend = this._detect();
    this.backend = backend;
    try {
      if (backend === "host") {
        const res = await window.storage!.get(key, false);
        return res && res.value ? res.value : null;
      }
      if (backend === "local") return window.localStorage.getItem(key);
      return memoryStore.get(key) ?? null;
    } catch (e) {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    const backend = this._detect();
    this.backend = backend;
    try {
      if (backend === "host") return await window.storage!.set(key, value, false);
      if (backend === "local") return window.localStorage.setItem(key, value);
      memoryStore.set(key, value);
    } catch (e) {
      // Quota exceeded or storage blocked — non-fatal, inputs just won't persist.
    }
  },

  async remove(key: string): Promise<void> {
    const backend = this._detect();
    try {
      if (backend === "host") return await window.storage!.delete(key, false);
      if (backend === "local") return window.localStorage.removeItem(key);
      memoryStore.delete(key);
    } catch (e) {
      // no-op
    }
  },
};
