import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type {
  FrozenRfiRenderPayload,
  RfiIssueFileSummary,
} from "../../domain/rfis/official-issue";
import type {
  RenderedRfiArtifact,
  RfiArtifactRenderer,
} from "../../application/rfis/rfi-artifact-renderer";
import { requireValidRendererDefinition } from "../../rendering/renderer-definition";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 9;
const LEADING = 12;
const MAROON = rgb(0.36, 0.055, 0.11);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.36, 0.34, 0.33);

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fieldValues(payload: FrozenRfiRenderPayload): Record<string, string> {
  return {
    subject: payload.rfi.subject,
    responsible_party: payload.rfi.responsibleParty.contactName,
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

/**
 * Deterministic definition-driven PDF implementation for the RFI issue port.
 * It consumes the same validated renderer definition contract as browser
 * preview, but never scrapes browser DOM or accepts a browser-generated file.
 */
export class RfiPdfArtifactRenderer implements RfiArtifactRenderer {
  readonly rendererVersion = "base-rfi-pdf/v1";

  async render(payload: FrozenRfiRenderPayload): Promise<RenderedRfiArtifact> {
    const definition = requireValidRendererDefinition(
      payload.template.definition,
    );
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const issuedAt = new Date(payload.issuedAt);
    document.setTitle(
      `${payload.officialDisplayNumber} — ${payload.rfi.subject}`,
    );
    document.setSubject("Official Request for Information");
    document.setAuthor(payload.organization.name ?? "BASE");
    document.setCreator(this.rendererVersion);
    document.setProducer(this.rendererVersion);
    document.setCreationDate(issuedAt);
    document.setModificationDate(issuedAt);

    const newPage = (): Cursor => {
      const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawText(payload.organization.name ?? "BASE", {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN + 8,
        size: 9,
        font: bold,
        color: MAROON,
      });
      page.drawText(payload.officialDisplayNumber, {
        x: PAGE_WIDTH - MARGIN - 95,
        y: PAGE_HEIGHT - MARGIN + 8,
        size: 9,
        font: bold,
        color: MAROON,
      });
      return { page, y: PAGE_HEIGHT - MARGIN - 18 };
    };

    let cursor = newPage();
    const ensure = (height: number): void => {
      if (cursor.y - height < MARGIN + 20) cursor = newPage();
    };
    const text = (
      value: string,
      options: {
        font?: PDFFont;
        size?: number;
        color?: ReturnType<typeof rgb>;
        gap?: number;
      } = {},
    ): void => {
      const font = options.font ?? regular;
      const size = options.size ?? BODY_SIZE;
      const lines = wrap(value, font, size, CONTENT_WIDTH);
      ensure(lines.length * LEADING + (options.gap ?? 0));
      for (const line of lines) {
        cursor.page.drawText(line, {
          x: MARGIN,
          y: cursor.y,
          size,
          font,
          color: options.color ?? INK,
        });
        cursor.y -= LEADING;
      }
      cursor.y -= options.gap ?? 0;
    };

    text(definition.title, {
      font: bold,
      size: 19,
      color: MAROON,
      gap: 4,
    });
    text(`${payload.project.projectNumber} · ${payload.project.name}`, {
      font: bold,
      size: 11,
      gap: 3,
    });
    text(
      `Issued ${payload.issuedAt} by ${payload.issuedBy.displayName ?? payload.issuedBy.userId}`,
      {
        color: MUTED,
        gap: 10,
      },
    );

    const values = fieldValues(payload);
    const sections = Array.isArray(definition.sections)
      ? definition.sections
      : [];
    for (const sectionValue of sections) {
      if (!sectionValue || typeof sectionValue !== "object") continue;
      const section = sectionValue as Record<string, unknown>;
      const fields = Array.isArray(section.fields) ? section.fields : [];
      const name = typeof section.name === "string" ? section.name : "Section";
      ensure(34);
      text(name, { font: bold, size: 11, color: MAROON, gap: 3 });
      for (const fieldValue of fields) {
        if (!fieldValue || typeof fieldValue !== "object") continue;
        const field = fieldValue as Record<string, unknown>;
        const id = typeof field.id === "string" ? field.id : "";
        const label = typeof field.label === "string" ? field.label : id;
        const value = values[id] ?? "";
        ensure(30);
        text(label, { font: bold, size: 8, color: MUTED });
        text(value || "—", { gap: 5 });
      }
    }

    const recipientLine = (role: string, names: string[]): void => {
      text(`${role}: ${names.join("; ") || "—"}`, { gap: 2 });
    };
    ensure(58);
    text("Routing snapshot", { font: bold, size: 11, color: MAROON, gap: 3 });
    recipientLine(
      "To",
      payload.routing.to.map((contact) => contact.contactName),
    );
    recipientLine(
      "CC",
      payload.routing.cc.map((contact) => contact.contactName),
    );

    ensure(40);
    text("Included files", { font: bold, size: 11, color: MAROON, gap: 3 });
    const files: RfiIssueFileSummary[] = payload.includedFiles;
    if (files.length === 0) text("No supporting files included.", { gap: 3 });
    for (const file of files) {
      text(
        `${file.originalFilename} · ${file.byteSize.toString()} bytes · SHA-256 ${file.sha256}`,
        { gap: 2 },
      );
    }

    for (const page of document.getPages()) {
      page.drawText(
        `Frozen render ${payload.template.definitionSha256.slice(0, 12)} · ${this.rendererVersion}`,
        {
          x: MARGIN,
          y: 28,
          size: 7,
          font: regular,
          color: MUTED,
        },
      );
    }

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
