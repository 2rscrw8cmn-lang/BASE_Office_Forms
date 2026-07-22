import { describe, expect, it } from "vitest";
import { fileTypeLabel, revisionName } from "../../public/app-format.js";

describe("shared presentation helpers", () => {
  it("maps stored revision sequence numbers to user-facing version names", () => {
    expect(revisionName({ revisionNumber: 1, revisionLabel: null })).toBe(
      "Original",
    );
    expect(revisionName({ revisionNumber: 2, revisionLabel: null })).toBe(
      "Rev 1",
    );
    expect(revisionName({ revisionNumber: 3, revisionLabel: null })).toBe(
      "Rev 2",
    );
  });

  it("supplements Original and revision names with stored labels", () => {
    expect(revisionName({ revisionNumber: 1, revisionLabel: "IFC" })).toBe(
      "Original · IFC",
    );
    expect(revisionName({ revisionNumber: 3, revisionLabel: "C" })).toBe(
      "Rev 2 · C",
    );
  });

  it("uses human-readable file type labels without exposing MIME types", () => {
    expect(fileTypeLabel("image/png")).toBe("PNG image");
    expect(fileTypeLabel("application/pdf")).toBe("PDF document");
    expect(
      fileTypeLabel(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("Excel workbook");
    expect(fileTypeLabel("application/octet-stream")).toBe("File");
  });
});
