/*
 * The UI-7 workspaces port presentation vocabulary from `public/app-format.js`
 * (the source the legacy detail views used) rather than importing that browser
 * module into the application bundle -- the same approach UI-5 took for the RFI
 * register.
 *
 * These tests are the guard that makes porting safe: they compare the ported
 * maps against the legacy module label for label, so the two cannot drift while
 * both exist. The legacy modules stay in the tree as the rollback path, so this
 * comparison stays meaningful until they are retired.
 */

import { describe, expect, it } from "vitest";
import {
  actorLabel as legacyActorLabel,
  describeActivity as legacyDescribeActivity,
  fileTypeLabel as legacyFileTypeLabel,
  rfiActivityDetail as legacyRfiActivityDetail,
  rfiAttachmentRoleLabel as legacyAttachmentRoleLabel,
  rfiFieldLabel as legacyFieldLabel,
  rfiNumberLabel as legacyNumberLabel,
} from "../../public/app-format.js";
import {
  formatBytes as recordFormatBytes,
  mediaTypeLabel,
} from "../../src/ui/features/record-workspace/format";
import {
  actorLabel,
  describeActivity,
  formatBytes as rfiFormatBytes,
  rfiActivityDetail,
  rfiAttachmentRoleLabel,
  rfiFieldLabel,
  rfiNumberLabel,
} from "../../src/ui/features/rfi-workspace/format";
import type { RfiWorkspaceActivity } from "../../src/ui/features/rfi-workspace/types";

const MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/acad",
  "application/dwg",
  "application/x-dwg",
  "application/vnd.dwg",
  "image/vnd.dwg",
  "image/x-dwg",
  // Unrecognised and absent values must degrade identically.
  "application/zip",
  "",
];

const ACTIVITY_ACTIONS = [
  "project.created",
  "project.updated",
  "project_contact.created",
  "project_contact.updated",
  "record.created",
  "record.updated",
  "record.archived",
  "revision.created",
  "revision.published",
  "revision.superseded",
  "file.uploaded",
  "issuance.created",
  "rfi.created",
  "rfi.updated",
  "rfi.marked_ready",
  "rfi.issued",
  "rfi.responded",
  "rfi.returned_for_clarification",
  "rfi.closed",
  "rfi.reopened",
  "rfi.voided",
  "rfi.attachment_added",
  "something.unmapped",
];

const RFI_FIELDS = [
  "subject",
  "question",
  "contractorSuggestion",
  "drawingReferences",
  "specificationReferences",
  "responsibleParty",
  "submittedBy",
  "requestedResponseDate",
  "costImpact",
  "scheduleImpact",
  "unknownField",
];

describe("UI-7 ported vocabulary matches public/app-format.js", () => {
  it.each(MEDIA_TYPES)("labels media type %s identically", (mediaType) => {
    expect(mediaTypeLabel(mediaType)).toBe(legacyFileTypeLabel(mediaType));
  });

  it("labels an absent media type identically", () => {
    expect(mediaTypeLabel(null)).toBe(legacyFileTypeLabel(null));
    expect(mediaTypeLabel(undefined)).toBe(legacyFileTypeLabel(undefined));
  });

  it.each(ACTIVITY_ACTIONS)("describes activity %s identically", (action) => {
    expect(describeActivity(action)).toBe(legacyDescribeActivity(action));
  });

  it.each(RFI_FIELDS)("labels RFI field %s identically", (field) => {
    expect(rfiFieldLabel(field)).toBe(legacyFieldLabel(field));
  });

  it.each(["supporting_attachment", "reference_drawing", "other_role"])(
    "labels attachment role %s identically",
    (role) => {
      expect(rfiAttachmentRoleLabel(role)).toBe(
        legacyAttachmentRoleLabel(role),
      );
    },
  );

  it("labels the RFI number identically, including the unnumbered draft", () => {
    expect(rfiNumberLabel(null)).toBe(legacyNumberLabel(null));
    expect(rfiNumberLabel("RFI-014")).toBe(legacyNumberLabel("RFI-014"));
  });

  it("labels the actor identically for users and the system", () => {
    const cases = [
      { actorType: "user", actorDisplayName: "Dana PM" },
      { actorType: "user", actorDisplayName: null },
      { actorType: "system", actorDisplayName: null },
    ];
    for (const event of cases) {
      expect(actorLabel(event)).toBe(legacyActorLabel(event));
    }
  });

  it("derives the activity detail line identically", () => {
    const cases: RfiWorkspaceActivity[] = [
      {
        action: "rfi.updated",
        actorType: "user",
        actorDisplayName: null,
        createdAt: "2026-07-01T00:00:00Z",
        changedFields: ["subject", "requestedResponseDate"],
        role: null,
      },
      {
        action: "rfi.attachment_added",
        actorType: "user",
        actorDisplayName: null,
        createdAt: "2026-07-01T00:00:00Z",
        changedFields: [],
        role: "reference_drawing",
      },
      {
        action: "rfi.created",
        actorType: "system",
        actorDisplayName: null,
        createdAt: "2026-07-01T00:00:00Z",
        changedFields: [],
        role: null,
      },
    ];
    for (const event of cases) {
      expect(rfiActivityDetail(event)).toBe(legacyRfiActivityDetail(event));
    }
  });
});

describe("UI-7 file size presentation is unchanged from the legacy detail views", () => {
  // The legacy record-detail and revision-detail views each carried this exact
  // formatter inline; both workspaces must present the same file identically.
  const legacyFormatBytes = (bytes: number) => {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  it.each([0, 1, 512, 1023, 1024, 2048, 1048575, 1048576, 5_242_880])(
    "formats %i bytes identically",
    (bytes) => {
      expect(recordFormatBytes(bytes)).toBe(legacyFormatBytes(bytes));
      expect(rfiFormatBytes(bytes)).toBe(legacyFormatBytes(bytes));
    },
  );
});
