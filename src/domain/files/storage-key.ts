export interface StorageKeyParts {
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  fileId: string;
}

/**
 * Deterministic hierarchy plus a server-generated random file identity.
 * Never derived from client input (filename or otherwise) so it cannot be
 * guessed, collided, or used to smuggle path-traversal semantics.
 */
export function buildStorageKey(parts: StorageKeyParts): string {
  return (
    `organizations/${parts.organizationId}` +
    `/projects/${parts.projectId}` +
    `/records/${parts.recordId}` +
    `/revisions/${parts.revisionId}` +
    `/files/${parts.fileId}`
  );
}
