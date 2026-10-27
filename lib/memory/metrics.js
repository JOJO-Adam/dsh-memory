/** In-process counters; exposed read-only through memory_metrics. */
export const hookMetrics = {
  routeHints: 0,
  bashChanges: 0,
  digests: 0,
  subagentBriefs: 0,
}

export function getHookMetrics() {
  return { ...hookMetrics }
}
