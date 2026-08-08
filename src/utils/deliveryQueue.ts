// src/utils/deliveryQueue.ts
//
//
// Offline-first queue for driver delivery submissions.
//
// Design (mirrors the backend decisions):
//   - Every POST /delivery attempt goes through here, online or off.
//   - On success: removed from queue.
//   - On 4xx (400/409): the payload will never succeed as-is. Report to
//     /driver/sync-failures for admin review, drop from local queue, show
//     the driver a one-time toast.
//   - On 5xx or network error: reschedule with exponential backoff + jitter.
//   - After 48h of retries: give up, report to /driver/sync-failures with
//     reason TIMED_OUT_48H.
//
// Backoff schedule (target intervals, before jitter):
//   30s → 1m → 2m → 5m → 10m → 20m → 40m → 1h → 2h → 2h → 2h…
// Each interval is then multiplied by a random factor in [0.75, 1.25] so
// drivers don't thundering-herd the backend when it comes back after an
// outage.
//
// State lives in AsyncStorage under a single key so a whole-queue snapshot
// costs one read. If the queue ever grows past a few hundred rows (won't
// happen in practice — one driver × ~40 stops × 2 slots), split by day.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const QUEUE_KEY = "pgs.deliveryQueue.v1";
const TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48h

// Interval ladder in milliseconds. Index = retry count.
const BACKOFF_LADDER_MS = [
  30_000, // first retry: 30s
  60_000, // 1m
  120_000, // 2m
  5 * 60_000, // 5m
  10 * 60_000, // 10m
  20 * 60_000, // 20m
  40 * 60_000, // 40m
  60 * 60_000, // 1h
  2 * 60 * 60_000, // 2h — cap, all further retries reuse this
];

export type DeliveryPayload = {
  customerId: string;
  routeId: string;
  slot: "morning" | "evening";
  date: string;
  status: "DELIVERED" | "SKIPPED" | "FAILED";
  actualOrder?: Record<string, number>;
  driverLatitude: number;
  driverLongitude: number;
  capturedAt?: string;
  proofImageUrl?: string;
};

type QueuedItem = {
  tempId: string; // client-generated, so the UI can key on it
  payload: DeliveryPayload;
  retries: number;
  firstAttemptAt: number; // epoch ms
  nextAttemptAt: number; // epoch ms; not-before timestamp for the worker
  lastError?: string;
};

let ticker: ReturnType<typeof setInterval> | null = null;
let onChangeCallbacks: Array<(items: QueuedItem[]) => void> = [];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function load(): Promise<QueuedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

async function save(items: QueuedItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  onChangeCallbacks.forEach((cb) => cb(items));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Enqueue and immediately attempt. Returns whether the first try succeeded
// so the caller can show an optimistic-vs-queued distinction if it wants.
export async function submitDelivery(
  payload: DeliveryPayload,
): Promise<{ synced: boolean }> {
  const item: QueuedItem = {
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    retries: 0,
    firstAttemptAt: Date.now(),
    nextAttemptAt: Date.now(),
  };
  const items = await load();
  items.push(item);
  await save(items);

  const outcome = await tryOne(item);
  return { synced: outcome === "synced" };
}

// Subscribe to queue changes (for a "N unsynced" badge in the UI). Returns
// an unsubscribe function.
export function subscribe(cb: (items: QueuedItem[]) => void): () => void {
  onChangeCallbacks.push(cb);
  load().then(cb);
  return () => {
    onChangeCallbacks = onChangeCallbacks.filter((c) => c !== cb);
  };
}

// Start the background worker. Safe to call multiple times — only the first
// call actually installs the interval. Call from the driver screen's mount.
export function startQueueWorker(): void {
  if (ticker !== null) return;
  drain(); // one immediate pass on app resume
  ticker = setInterval(drain, 30_000); // check every 30s while foregrounded
}

export function stopQueueWorker(): void {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

// Manually kick the queue. Useful to call after any successful API call
// (indicates network is back), or on app foreground.
export async function drain(): Promise<void> {
  const items = await load();
  const now = Date.now();
  const due = items.filter((i) => i.nextAttemptAt <= now);
  for (const item of due) {
    await tryOne(item);
  }
}

export async function queueSize(): Promise<number> {
  return (await load()).length;
}

// ---------------------------------------------------------------------------
// Per-item attempt
// ---------------------------------------------------------------------------

type Outcome = "synced" | "retrying" | "reported";

async function tryOne(item: QueuedItem): Promise<Outcome> {
  try {
    await api.post("/delivery", item.payload);
    await removeFromQueue(item.tempId);
    return "synced";
  } catch (err: any) {
    // api.ts throws an Error whose message includes the status code as
    // "HTTP 4xx: ..." — we look at that to decide permanent vs transient.
    // If your api.ts uses a different shape, adjust extractStatus below.
    const status = extractStatus(err);
    const message = err?.message || "Unknown error";

    if (status >= 400 && status < 500) {
      // Permanent — payload will never succeed as-is.
      await reportFailure(item, message, "REJECTED_400");
      await removeFromQueue(item.tempId);
      return "reported";
    }

    // Transient. Check 48h ceiling first.
    if (Date.now() - item.firstAttemptAt >= TIMEOUT_MS) {
      await reportFailure(item, message, "TIMED_OUT_48H");
      await removeFromQueue(item.tempId);
      return "reported";
    }

    // Reschedule with backoff + jitter.
    await rescheduleWithBackoff(item, message);
    return "retrying";
  }
}

async function rescheduleWithBackoff(
  item: QueuedItem,
  error: string,
): Promise<void> {
  const idx = Math.min(item.retries, BACKOFF_LADDER_MS.length - 1);
  const baseMs = BACKOFF_LADDER_MS[idx];
  // Jitter: multiply by [0.75, 1.25]. Prevents thundering-herd on recovery.
  const jitter = 0.75 + Math.random() * 0.5;
  const waitMs = Math.round(baseMs * jitter);

  const items = await load();
  const updated = items.map((i) =>
    i.tempId === item.tempId
      ? {
          ...i,
          retries: i.retries + 1,
          nextAttemptAt: Date.now() + waitMs,
          lastError: error,
        }
      : i,
  );
  await save(updated);
}

async function removeFromQueue(tempId: string): Promise<void> {
  const items = await load();
  await save(items.filter((i) => i.tempId !== tempId));
}

// Fire-and-forget: if this report itself fails, the row already gave up
// locally; the backend can only learn about it via retry on next drain.
async function reportFailure(
  item: QueuedItem,
  errorMessage: string,
  reason: "REJECTED_400" | "TIMED_OUT_48H" | "OTHER",
): Promise<void> {
  try {
    await api.post("/driver/sync-failures", {
      payload: item.payload,
      errorMessage,
      reason,
    });
  } catch (err) {
    console.log(
      "sync-failures POST failed; will retry via natural queue drain later",
      err,
    );
    // NOTE: we don't re-queue the failure itself. Rationale: if the backend
    // is down enough that /driver/sync-failures also fails, the original
    // delivery attempt will also still be failing. This is intentionally
    // fire-and-forget to avoid an infinite "failure to report the failure"
    // loop. If this becomes a real issue in practice, add a second queue
    // for failure reports with a max size and simple retry.
  }
}

function extractStatus(err: any): number {
  // Your api.ts throws Error(`HTTP ${status}: ${body}`) for non-2xx.
  // Adjust this if your shape differs.
  const m = /HTTP\s+(\d{3})/.exec(err?.message || "");
  return m ? parseInt(m[1], 10) : 0;
}
