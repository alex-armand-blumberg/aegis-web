type CacheEnvelope<T> = {
  storedAt: number;
  value: T;
};

type MemoryEntry = {
  expiresAt: number;
  raw: string;
};

export type TieredCacheStatus = "fresh" | "stale" | "miss";

export type TieredCacheMeta = {
  status: TieredCacheStatus;
  ageMs: number;
  source: "memory" | "redis" | "none";
  key: string;
};

const memoryCache = new Map<string, MemoryEntry>();
const inFlight = new Map<string, Promise<unknown>>();

const DEFAULT_REDIS_TIMEOUT_MS = 3500;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function buildCacheKey(namespace: string, params: Record<string, unknown>): string {
  return `${namespace}:${stableStringify(params)}`;
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function redisGet(key: string): Promise<string | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  try {
    const res = await fetchWithTimeout(
      `${cfg.url}/get/${encodeURIComponent(key)}`,
      {
        headers: { Authorization: `Bearer ${cfg.token}` },
      },
      DEFAULT_REDIS_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    return typeof json.result === "string" ? json.result : null;
  } catch {
    return null;
  }
}

async function redisSet(key: string, raw: string, ttlSeconds: number): Promise<void> {
  const cfg = redisConfig();
  if (!cfg) return;
  try {
    await fetchWithTimeout(
      `${cfg.url}/setex/${encodeURIComponent(key)}/${Math.max(1, ttlSeconds)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
        },
        body: raw,
      },
      DEFAULT_REDIS_TIMEOUT_MS
    );
  } catch {
    // Best-effort cache write.
  }
}

function memoryGet(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.raw;
}

function memorySet(key: string, raw: string, ttlMs: number): void {
  memoryCache.set(key, {
    raw,
    expiresAt: Date.now() + Math.max(1000, ttlMs),
  });
}

function parseEnvelope<T>(raw: string | null): CacheEnvelope<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.storedAt === "number" &&
      "value" in parsed
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function readTieredCache<T>(
  key: string,
  freshForMs: number,
  staleForMs: number
): Promise<{ envelope: CacheEnvelope<T> | null; meta: TieredCacheMeta }> {
  const now = Date.now();
  const maxAgeMs = Math.max(0, freshForMs + staleForMs);
  const memoryRaw = memoryGet(key);
  const memoryEnvelope = parseEnvelope<T>(memoryRaw);
  if (memoryEnvelope) {
    const ageMs = now - memoryEnvelope.storedAt;
    if (ageMs <= freshForMs) {
      return {
        envelope: memoryEnvelope,
        meta: { status: "fresh", ageMs, source: "memory", key },
      };
    }
    if (ageMs <= maxAgeMs) {
      return {
        envelope: memoryEnvelope,
        meta: { status: "stale", ageMs, source: "memory", key },
      };
    }
  }

  const redisRaw = await redisGet(key);
  const redisEnvelope = parseEnvelope<T>(redisRaw);
  if (redisEnvelope) {
    memorySet(key, JSON.stringify(redisEnvelope), maxAgeMs);
    const ageMs = now - redisEnvelope.storedAt;
    if (ageMs <= freshForMs) {
      return {
        envelope: redisEnvelope,
        meta: { status: "fresh", ageMs, source: "redis", key },
      };
    }
    if (ageMs <= maxAgeMs) {
      return {
        envelope: redisEnvelope,
        meta: { status: "stale", ageMs, source: "redis", key },
      };
    }
  }

  return {
    envelope: null,
    meta: { status: "miss", ageMs: 0, source: "none", key },
  };
}

export async function writeTieredCache<T>(
  key: string,
  value: T,
  freshForMs: number,
  staleForMs: number
): Promise<void> {
  const ttlMs = Math.max(1000, freshForMs + staleForMs);
  const ttlSeconds = Math.ceil(ttlMs / 1000);
  const envelope: CacheEnvelope<T> = {
    storedAt: Date.now(),
    value,
  };
  const raw = JSON.stringify(envelope);
  memorySet(key, raw, ttlMs);
  await redisSet(key, raw, ttlSeconds);
}

type CachedComputeOptions<T> = {
  key: string;
  freshForMs: number;
  staleForMs: number;
  compute: () => Promise<T>;
};

export async function getCachedOrCompute<T>(
  options: CachedComputeOptions<T>
): Promise<{
  value: T;
  meta: TieredCacheMeta;
}> {
  const { key, freshForMs, staleForMs, compute } = options;
  const cached = await readTieredCache<T>(key, freshForMs, staleForMs);
  if (cached.meta.status === "fresh" && cached.envelope) {
    return { value: cached.envelope.value, meta: cached.meta };
  }

  if (cached.meta.status === "stale" && cached.envelope) {
    // Fire-and-forget refresh, deduped per cache key.
    if (!inFlight.has(key)) {
      const refreshPromise = compute()
        .then((nextValue) => writeTieredCache(key, nextValue, freshForMs, staleForMs))
        .catch(() => undefined)
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, refreshPromise);
    }
    return { value: cached.envelope.value, meta: cached.meta };
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    const value = await existing;
    return {
      value,
      meta: { status: "fresh", ageMs: 0, source: "none", key },
    };
  }

  const promise = compute();
  inFlight.set(key, promise);
  try {
    const value = await promise;
    await writeTieredCache(key, value, freshForMs, staleForMs);
    return {
      value,
      meta: { status: "fresh", ageMs: 0, source: "none", key },
    };
  } finally {
    inFlight.delete(key);
  }
}
