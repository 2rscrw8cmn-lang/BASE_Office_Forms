export function nextRevisionNumber(lastNumber: number): number {
  if (!Number.isSafeInteger(lastNumber) || lastNumber < 0) {
    throw new RangeError(
      "Revision sequence numbers must be non-negative integers.",
    );
  }
  return lastNumber + 1;
}

export function isValidRevisionNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}
