export function formatIssueNumber(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("Issue sequence must be a positive integer.");
  }
  return `ISS-${String(sequence).padStart(3, "0")}`;
}
