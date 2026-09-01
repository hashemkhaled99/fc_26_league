/** Format a second count for auction countdowns (supports up to 12h). */
export function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/** Convert admin hours input to stored seconds (clamped to 12h max). */
export function hoursToBidTimerSeconds(hours: number, maxHours = 12): number {
  const clampedHours = Math.min(Math.max(hours, 5 / 3600), maxHours);
  return Math.round(clampedHours * 3600);
}

export function bidTimerSecondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}
