import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type {
  RenderedRfiArtifact,
  RfiArtifactRenderer,
} from "../../application/rfis/rfi-artifact-renderer";
import {
  compileBaseRfiOfficialDocument,
  type BaseRfiOfficialField,
} from "../../domain/rfis/base-rfi-official-document";
import type {
  FrozenRfiRenderPayload,
  RfiIssueFileSummary,
} from "../../domain/rfis/official-issue";
import { requireValidRendererDefinition } from "../../rendering/renderer-definition";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 30;
const MAROON = rgb(0.34, 0.035, 0.095);
const PALE_MAROON = rgb(0.965, 0.935, 0.942);
const INK = rgb(0.105, 0.105, 0.115);
const MUTED = rgb(0.39, 0.39, 0.42);
const RULE = rgb(0.72, 0.69, 0.69);
const WHITE = rgb(1, 1, 1);

/**
 * Official timestamps are stored in UTC, while controlled documents display
 * the project-local calendar date. Never obtain that date by slicing the UTC
 * timestamp: an evening issue can belong to the next UTC day.
 */
export function formatOfficialIssueDate(
  issuedAt: string,
  projectTimezone: string,
): string {
  const issued = new Date(issuedAt);
  if (Number.isNaN(issued.getTime())) {
    throw new TypeError("Official issue timestamp is invalid.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: projectTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(issued);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function splitWord(
  word: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const character of word) {
    const next = piece + character;
    if (piece && font.widthOfTextAtSize(next, size) > width) {
      pieces.push(piece);
      piece = character;
    } else {
      piece = next;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const originalWord of words) {
      const pieces =
        font.widthOfTextAtSize(originalWord, size) > width
          ? splitWord(originalWord, font, size, width)
          : [originalWord];
      for (const word of pieces) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          line = word;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

function fieldValues(payload: FrozenRfiRenderPayload): Record<string, string> {
  return {
    subject: payload.rfi.subject,
    responsible_party: [
      payload.rfi.responsibleParty.contactName,
      payload.rfi.responsibleParty.companyName,
    ]
      .filter(Boolean)
      .join(" — "),
    requested_response_date: payload.rfi.responseDueDate,
    question: payload.rfi.question,
    contractor_suggestion: payload.rfi.contractorSuggestion ?? "",
    drawing_references: payload.rfi.drawingReferences ?? "",
    specification_references: payload.rfi.specificationReferences ?? "",
    response: "",
  };
}

interface Cursor {
  page: PDFPage;
  y: number;
}

export class RfiPdfArtifactRenderer implements RfiArtifactRenderer {
  readonly rendererVersion = "base-rfi-official-document/v1";

  async render(payload: FrozenRfiRenderPayload): Promise<RenderedRfiArtifact> {
    const definition = requireValidRendererDefinition(
      payload.template.definition,
    );
    const plan = compileBaseRfiOfficialDocument(definition);
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const issuedAt = new Date(payload.issuedAt);

    document.setTitle(
      `${payload.officialDisplayNumber} — ${payload.rfi.subject}`,
    );
    document.setSubject("Official Request for Information");
    document.setAuthor(payload.organization.name ?? plan.brand);
    document.setCreator(this.rendererVersion);
    document.setProducer(this.rendererVersion);
    document.setCreationDate(issuedAt);
    document.setModificationDate(issuedAt);

    const drawPageHeader = (page: PDFPage): number => {
      page.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - 58,
        width: PAGE_WIDTH,
        height: 58,
        color: MAROON,
      });
      page.drawText(plan.brand.toUpperCase(), {
        x: MARGIN,
        y: PAGE_HEIGHT - 31,
        size: 9,
        font: bold,
        color: WHITE,
      });
      page.drawText(plan.title, {
        x: MARGIN,
        y: PAGE_HEIGHT - 48,
        size: 16,
        font: bold,
        color: WHITE,
      });
      page.drawText(payload.officialDisplayNumber, {
        x: PAGE_WIDTH - MARGIN - 86,
        y: PAGE_HEIGHT - 40,
        size: 14,
        font: bold,
        color: WHITE,
      });
      return PAGE_HEIGHT - 76;
    };

    const newPage = (): Cursor => {
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      return { page, y: drawPageHeader(page) };
    };
    let cursor = newPage();
    const ensure = (height: number): void => {
      if (cursor.y - height < MARGIN + FOOTER_HEIGHT) cursor = newPage();
    };

    const drawControlCell = (
      x: number,
      y: number,
      width: number,
      label: string,
      value: string,
    ): void => {
      cursor.page.drawRectangle({
        x,
        y: y - 35,
        width,
        height: 35,
        borderColor: RULE,
        borderWidth: 0.6,
      });
      cursor.page.drawText(label.toUpperCase(), {
        x: x + 7,
        y: y - 11,
        size: 6.5,
        font: bold,
        color: MUTED,
      });
      const line = wrap(value || "—", regular, 8.3, width - 14)[0] ?? "—";
      cursor.page.drawText(line, {
        x: x + 7,
        y: y - 25,
        size: 8.3,
        font: regular,
        color: INK,
      });
    };

    const half = CONTENT_WIDTH / 2;
    drawControlCell(
      MARGIN,
      cursor.y,
      half,
      "Project",
      `${payload.project.projectNumber} — ${payload.project.name}`,
    );
    drawControlCell(
      MARGIN + half,
      cursor.y,
      half,
      "Document control",
      `${plan.documentType} · ${payload.officialDisplayNumber} · Original Issue`,
    );
    cursor.y -= 35;
    drawControlCell(
      MARGIN,
      cursor.y,
      half,
      "Issue date / response due",
      `${formatOfficialIssueDate(payload.issuedAt, payload.project.timezone)} / ${payload.rfi.responseDueDate}`,
    );
    drawControlCell(
      MARGIN + half,
      cursor.y,
      half,
      "Issued by",
      payload.issuedBy.displayName ?? payload.issuedBy.userId,
    );
    cursor.y -= 49;

    const values = fieldValues(payload);
    const drawSectionHeader = (name: string): void => {
      ensure(25);
      cursor.page.drawRectangle({
        x: MARGIN,
        y: cursor.y - 18,
        width: CONTENT_WIDTH,
        height: 18,
        color: PALE_MAROON,
      });
      cursor.page.drawText(name.toUpperCase(), {
        x: MARGIN + 7,
        y: cursor.y - 12,
        size: 7.5,
        font: bold,
        color: MAROON,
      });
      cursor.y -= 18;
    };

    const requiredHeight = (
      field: BaseRfiOfficialField,
      value: string,
      width: number,
    ): number =>
      Math.max(
        field.multiline ? field.minimumHeight * 1.65 : 0,
        29 + wrap(value || "—", regular, 8.5, width - 14).length * 11,
      );

    const drawField = (
      field: BaseRfiOfficialField,
      value: string,
      x: number,
      width: number,
      forcedHeight?: number,
    ): void => {
      const lines = wrap(value || "—", regular, 8.5, width - 14);
      const height = forcedHeight ?? requiredHeight(field, value, width);
      cursor.page.drawRectangle({
        x,
        y: cursor.y - height,
        width,
        height,
        borderColor: RULE,
        borderWidth: 0.6,
      });
      cursor.page.drawText(field.label.toUpperCase(), {
        x: x + 7,
        y: cursor.y - 11,
        size: 6.5,
        font: bold,
        color: MUTED,
      });
      let textY = cursor.y - 25;
      for (const line of lines.slice(
        0,
        Math.max(1, Math.floor((height - 29) / 11)),
      )) {
        cursor.page.drawText(line, {
          x: x + 7,
          y: textY,
          size: 8.5,
          font: regular,
          color: INK,
        });
        textY -= 11;
      }
    };

    for (const section of plan.sections) {
      const firstField = section.fields[0];
      const firstValue = values[firstField.id] ?? "";
      const firstWidth = firstField.width === 6 ? half : CONTENT_WIDTH;
      ensure(
        18 + Math.min(requiredHeight(firstField, firstValue, firstWidth), 60),
      );
      drawSectionHeader(section.name);
      for (let index = 0; index < section.fields.length; index += 1) {
        const field = section.fields[index];
        const next = section.fields[index + 1];
        const value = values[field.id] ?? "";
        if (
          field.width === 6 &&
          index + 1 < section.fields.length &&
          next.width === 6
        ) {
          const nextValue = values[next.id] ?? "";
          const height = Math.max(
            requiredHeight(field, value, half),
            requiredHeight(next, nextValue, half),
          );
          ensure(height);
          drawField(field, value, MARGIN, half, height);
          drawField(next, nextValue, MARGIN + half, half, height);
          cursor.y -= height;
          index += 1;
        } else {
          const lines = wrap(value || "—", regular, 8.5, CONTENT_WIDTH - 14);
          const maxLinesPerPage = Math.max(
            1,
            Math.floor((cursor.y - MARGIN - FOOTER_HEIGHT - 29) / 11),
          );
          if (lines.length <= maxLinesPerPage) {
            const height = requiredHeight(field, value, CONTENT_WIDTH);
            ensure(height);
            drawField(field, value, MARGIN, CONTENT_WIDTH, height);
            cursor.y -= height;
          } else {
            let offset = 0;
            while (offset < lines.length) {
              ensure(51);
              const capacity = Math.max(
                1,
                Math.floor((cursor.y - MARGIN - FOOTER_HEIGHT - 29) / 11),
              );
              const chunk = lines.slice(offset, offset + capacity);
              const continued = {
                ...field,
                label:
                  offset === 0 ? field.label : `${field.label} (continued)`,
                minimumHeight: 0,
              };
              const height = 29 + chunk.length * 11;
              drawField(
                continued,
                chunk.join("\n"),
                MARGIN,
                CONTENT_WIDTH,
                height,
              );
              cursor.y -= height;
              offset += chunk.length;
              if (offset < lines.length) cursor = newPage();
            }
          }
        }
      }
      cursor.y -= 10;
    }

    const summaryLines = [
      `To: ${payload.routing.to.map((item) => item.contactName).join("; ") || "—"}`,
      `CC: ${payload.routing.cc.map((item) => item.contactName).join("; ") || "—"}`,
      `Delivery: Record only`,
    ];
    const files: RfiIssueFileSummary[] = payload.includedFiles;
    summaryLines.push(
      files.length
        ? `Included files: ${files.map((file) => `${file.originalFilename} (${file.sha256.slice(0, 12)}…)`).join("; ")}`
        : "Included files: None",
    );
    const summaryField: BaseRfiOfficialField = {
      id: "distribution",
      label: "Official routing snapshot",
      width: 12,
      multiline: true,
      minimumHeight: 30,
    };
    const summary = summaryLines.join("\n");
    const summaryHeight = requiredHeight(summaryField, summary, CONTENT_WIDTH);
    ensure(18 + summaryHeight);
    drawSectionHeader("Distribution and file record");
    drawField(summaryField, summary, MARGIN, CONTENT_WIDTH, summaryHeight);
    cursor.y -= summaryHeight + 12;

    for (const footnote of plan.footnotes) {
      const lines = wrap(footnote, regular, 7.5, CONTENT_WIDTH - 12);
      ensure(lines.length * 10 + 18);
      cursor.page.drawLine({
        start: { x: MARGIN, y: cursor.y },
        end: { x: MARGIN + CONTENT_WIDTH, y: cursor.y },
        thickness: 0.6,
        color: RULE,
      });
      cursor.y -= 13;
      for (const line of lines) {
        cursor.page.drawText(line, {
          x: MARGIN + 6,
          y: cursor.y,
          size: 7.5,
          font: regular,
          color: MUTED,
        });
        cursor.y -= 10;
      }
    }

    const pages = document.getPages();
    pages.forEach((page, index) => {
      page.drawText(
        `Frozen definition ${payload.template.definitionSha256.slice(0, 12)} · ${this.rendererVersion}`,
        {
          x: MARGIN,
          y: 24,
          size: 6.5,
          font: regular,
          color: MUTED,
        },
      );
      const pageLabel = `Page ${String(index + 1)} of ${String(pages.length)}`;
      page.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 6.5),
        y: 24,
        size: 6.5,
        font: regular,
        color: MUTED,
      });
    });

    const bytes = await document.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
    return {
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      mediaType: "application/pdf",
    };
  }
}
