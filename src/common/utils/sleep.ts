/** Promise-based delay. Under vi.useFakeTimers() it resolves when timers are advanced. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
