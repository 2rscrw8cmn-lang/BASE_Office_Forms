import { RequestValidationError } from "./project-schemas";

export interface ParsedFileUpload {
  originalFilename: string;
  mediaType: string;
  content: ArrayBuffer;
}

/**
 * Parses and shape-validates the multipart transport envelope only (one
 * "file" field, no unexpected fields). Substantive checks -- blank
 * filename, invalid media type, zero-byte/over-limit size -- are the
 * application/domain layer's responsibility via `validateFileUpload`, so
 * they apply uniformly regardless of transport.
 */
export async function parseFileUpload(
  request: Request,
): Promise<ParsedFileUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new RequestValidationError("A multipart/form-data body is required.");
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new RequestValidationError(
      "The multipart request body could not be parsed.",
    );
  }
  const entries = Array.from(formData.entries());
  const fileEntries = entries.filter(([key]) => key === "file");
  if (fileEntries.length === 0) {
    throw new RequestValidationError("A file field is required.");
  }
  if (fileEntries.length > 1) {
    throw new RequestValidationError("Only one file field is allowed.");
  }
  if (entries.length > fileEntries.length) {
    throw new RequestValidationError(
      "Unexpected fields were included with the upload.",
    );
  }
  const [, value] = fileEntries[0];
  if (!(value instanceof File)) {
    throw new RequestValidationError("The file field must be a file.");
  }
  return {
    originalFilename: value.name,
    mediaType: value.type,
    content: await value.arrayBuffer(),
  };
}
