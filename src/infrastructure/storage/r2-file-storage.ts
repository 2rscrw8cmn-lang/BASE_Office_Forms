import type {
  FileObjectMetadata,
  FileStoragePort,
  StoredFileObject,
} from "../../application/files/file-service";

/**
 * Thin adapter over the private `FILES` R2 binding. Buckets stay private:
 * this adapter never generates or exposes a public/signed URL, and `delete`
 * exists only to compensate a D1 failure after a successful R2 write -- it
 * is intentionally not reachable from the public application service.
 */
export class R2FileStorage implements FileStoragePort {
  constructor(private readonly bucket: R2Bucket) {}

  async put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void> {
    // `etagDoesNotMatch: "*"` makes this a create-only (If-None-Match: *)
    // write: R2 returns null instead of overwriting an object that already
    // exists at this key, so an uploaded binary can never be silently
    // replaced. `sha256` has R2 verify the received bytes against the digest
    // the application already computed, rejecting the write if they differ.
    const result = await this.bucket.put(key, content, {
      onlyIf: { etagDoesNotMatch: "*" },
      sha256: metadata.sha256,
      httpMetadata: { contentType: metadata.contentType },
      customMetadata: {
        originalFilename: metadata.originalFilename,
        organizationId: metadata.organizationId,
        projectId: metadata.projectId,
        recordId: metadata.recordId,
        revisionId: metadata.revisionId,
        fileId: metadata.fileId,
        sha256: metadata.sha256,
      },
    });
    if (result === null) {
      throw new Error(
        "The file object already exists and was not overwritten.",
      );
    }
  }

  async get(key: string): Promise<StoredFileObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      body: object.body,
      size: object.size,
      httpEtag: object.httpEtag,
      contentType: object.httpMetadata?.contentType ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async head(key: string): Promise<{ size: number; sha256?: string } | null> {
    const object = await this.bucket.head(key);
    if (!object) return null;
    const sha256 = object.customMetadata?.sha256;
    return sha256 ? { size: object.size, sha256 } : { size: object.size };
  }
}
