/** Await a fixed delay to simulate network RTT (no-op when ≤ 0). */
export async function simulateNetworkLatency(latencyMs: number | undefined): Promise<void> {
  if (latencyMs === undefined || latencyMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, latencyMs);
  });
}
