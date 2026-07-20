import { describe, expect, it } from "vitest";

import {
  FileValidationError,
  MAX_FILE_BYTES,
  buildContentDisposition,
  isValidMediaType,
  sanitizeContentDispositionFilename,
  validateFileUpload,
} from "../../src/domain/files/validation";

describe("file domain validation", () => {
  it("accepts a valid upload and trims the filename", () => {
    expect(
      validateFileUpload({
        originalFilename: "  Floor Plan.pdf  ",
        mediaType: "application/pdf",
        byteSize: 1024,
      }),
    ).toEqual({
      originalFilename: "Floor Plan.pdf",
      mediaType: "application/pdf",
    });
  });

  it("rejects a blank filename", () => {
    expect(() =>
      validateFileUpload({
        originalFilename: "   ",
        mediaType: "application/pdf",
        byteSize: 1024,
      }),
    ).toThrow(FileValidationError);
  });

  it("rejects a missing filename", () => {
    expect(() =>
      validateFileUpload({
        originalFilename: undefined,
        mediaType: "application/pdf",
        byteSize: 1024,
      }),
    ).toThrow(FileValidationError);
  });

  it("rejects a missing or blank media type", () => {
    expect(() =>
      validateFileUpload({
        originalFilename: "file.pdf",
        mediaType: undefined,
        byteSize: 1024,
      }),
    ).toThrow(FileValidationError);
    expect(() =>
      validateFileUpload({
        originalFilename: "file.pdf",
        mediaType: "   ",
        byteSize: 1024,
      }),
    ).toThrow(FileValidationError);
  });

  it("rejects an invalid media type shape", () => {
    expect(() =>
      validateFileUpload({
        originalFilename: "file.pdf",
        mediaType: "not-a-media-type",
        byteSize: 1024,
      }),
    ).toThrow(FileValidationError);
  });

  it("accepts arbitrary binary content types rather than a PDF whitelist", () => {
    for (const mediaType of [
      "application/pdf",
      "image/png",
      "application/octet-stream",
      "video/mp4",
      "application/vnd.ms-excel",
    ]) {
      expect(isValidMediaType(mediaType)).toBe(true);
    }
  });

  it("rejects zero-byte files", () => {
    expect(() =>
      validateFileUpload({
        originalFilename: "file.pdf",
        mediaType: "application/pdf",
        byteSize: 0,
      }),
    ).toThrow(FileValidationError);
  });

  it("rejects files over the 50 MB limit", () => {
    expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(() =>
      validateFileUpload({
        originalFilename: "file.pdf",
        mediaType: "application/pdf",
        byteSize: MAX_FILE_BYTES + 1,
      }),
    ).toThrow(FileValidationError);
    expect(() =>
      validateFileUpload({
        originalFilename: "file.pdf",
        mediaType: "application/pdf",
        byteSize: MAX_FILE_BYTES,
      }),
    ).not.toThrow();
  });

  it("sanitizes Content-Disposition filenames against path traversal and injection", () => {
    expect(sanitizeContentDispositionFilename("report.pdf")).toBe("report.pdf");
    expect(sanitizeContentDispositionFilename("../../etc/passwd")).toBe(
      "passwd",
    );
    expect(sanitizeContentDispositionFilename("C:\\secrets\\report.pdf")).toBe(
      "report.pdf",
    );
    expect(sanitizeContentDispositionFilename("evil\r\nSet-Cookie: a=b")).toBe(
      "evilSet-Cookie: a=b",
    );
    expect(sanitizeContentDispositionFilename('quo"ted.pdf')).toBe(
      "quo'ted.pdf",
    );
    expect(sanitizeContentDispositionFilename("")).toBe("file");
    expect(sanitizeContentDispositionFilename("   ")).toBe("file");
  });

  it("builds a safe, quoted Content-Disposition header value", () => {
    const header = buildContentDisposition('weird "name".pdf');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("attachment; filename=");
    expect(header).toContain("filename*=UTF-8''");
    expect(header).not.toContain('"name"');
  });
});
