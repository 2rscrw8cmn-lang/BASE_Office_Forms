const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}

/** Computes the lowercase hex SHA-256 digest of exactly the given bytes. */
export async function sha256Hex(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
