/**
 * Standalone Resource Warming (No-op in local SQLite standalone mode).
 */
export async function warmSharedResources(): Promise<void> {
  // Local SQLite handles instant loading.
}
