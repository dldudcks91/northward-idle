/** Compute the exact return window without rewinding an already applied clock. */
export function returnWindow(savedAt, now, capMs) {
  for (const value of [savedAt, now, capMs]) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('진행 시각과 계산 상한은 양수여야 합니다.');
  }
  const awayMs = Math.max(0, now - savedAt);
  return { awayMs, elapsedMs: Math.min(awayMs, capMs), excludedMs: Math.max(0, awayMs - capMs), appliedAt: Math.max(savedAt, now) };
}
