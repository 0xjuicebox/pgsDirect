/**
 * Today's date as YYYY-MM-DD, in the device's own timezone.
 *
 * WHY THIS EXISTS
 *
 * The pattern it replaces was `new Date().toISOString().split('T')[0]`, which
 * looks like "today" and isn't. toISOString converts to UTC first, and India
 * is UTC+5:30 — so between midnight and 05:30 IST it returns YESTERDAY.
 *
 * That window is not an edge case here. A morning driver opens the app around
 * 05:00 to start their round, which is inside it. The symptoms were:
 *
 *   - The driver's manifest was fetched for the previous day, so any override
 *     a customer set for today was missing. Admin showed 3 L, the driver
 *     showed 2 L, and the backend was returning both correctly — they were
 *     simply asking about different days.
 *
 *   - Worse, deliveries submitted before 05:30 carried yesterday's date. The
 *     delivery would overwrite yesterday's log and today's stop would stay
 *     unattempted, so the customer is billed for the wrong day and the round
 *     never completes.
 *
 * Neither failed loudly. Both look like the app working.
 *
 * Building the string from the local getters avoids the conversion entirely.
 */
export function todayLocal(): string {
  return toLocalISODate(new Date());
}

/** Formats a Date as YYYY-MM-DD using its local components, never UTC. */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
