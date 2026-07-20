export function formatRfiNumber(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("RFI sequence numbers must be positive integers.");
  }
  return `RFI-${String(sequence).padStart(3, "0")}`;
}
