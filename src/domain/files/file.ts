export interface RevisionFile {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  storageKey: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
}
