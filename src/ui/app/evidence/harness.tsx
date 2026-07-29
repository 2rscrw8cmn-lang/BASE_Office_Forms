/*
 * Development-only evidence harness for UI-4. It mounts the REAL application
 * shell (AppProviders + ShellRoutes + AppLayout) with the production CSS, but
 * substitutes a stub runtime and a mocked session/project fetch so the shell
 * chrome can be captured without an authenticated Cloudflare Access session.
 * The feature content area shows a representative placeholder — the shell
 * chrome (sidebar, navigation, project header, tabs, drawer) is the real React
 * output. This harness is never part of the production bundle.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { AppProviders, ShellRoutes, createQueryClient } from "../App";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../types";
import type { FeatureKind } from "../routing";
import "../../styles/app.css";

const params = new URLSearchParams(window.location.search);
const route = params.get("route") ?? "/projects/p1/records";
const openDrawer = params.get("drawer") === "1";
const role = params.get("role") ?? "org_admin";
// UI-5 evidence: the native RFI register route mounts for real (AppLayout
// special-cases "project-rfis"), so it needs its own fixture/fetch/scenario
// wiring rather than the generic feature-stub used by still-legacy routes.
const rfiFixture = params.get("rfiFixture") ?? "populated";
const rfiPatchMode = params.get("rfiPatchMode") ?? "success";
const rfiScenario = params.get("rfiScenario") ?? "none";
// UI-6A evidence mounts the real native Projects register at `/projects`.
// Its server-authorized fixture and interaction states are selected here so
// screenshots remain deterministic without placing demo markup in production.
const projectFixture = params.get("projectFixture") ?? "populated";
const projectScenario = params.get("projectScenario") ?? "none";
// UI-6B evidence mounts the real native Document Register at
// `/projects/:projectId/records`. Fixture selects the authorized server
// response; scenario drives the Add Document Drawer and the mobile filter
// disclosure through real DOM events, so captures stay deterministic without
// any static demo markup.
const recordFixture = params.get("recordFixture") ?? "populated";
const recordScenario = params.get("recordScenario") ?? "none";
const recordCreateMode = params.get("recordCreateMode") ?? "success";
// UI-7 evidence mounts the three real detail workspaces. `workspaceFixture`
// selects the authorized server read model (which decides the lifecycle state
// and therefore the capabilities on screen); `workspaceScenario` drives the
// confirmations, dialogs, and failure surfaces through real DOM events, so the
// captures stay deterministic without any static demo markup.
const workspaceFixture = params.get("workspaceFixture") ?? "published";
const workspaceScenario = params.get("workspaceScenario") ?? "none";
const workspaceUploadMode = params.get("workspaceUploadMode") ?? "success";
const rfiWorkspaceFixture = params.get("rfiWorkspaceFixture") ?? "draft";
const rfiWorkspaceScenario = params.get("rfiWorkspaceScenario") ?? "none";
// RFI Slice 2B evidence drives the real mark-ready and official-issue
// workflows. `rfiReadyMode` and `rfiIssueMode` choose the authoritative server
// answer (success, refusal, transient failure, unknown outcome, or
// reconciliation), so every documented state is produced by the production
// components reacting to a real response rather than by static markup.
const rfiReadyMode = params.get("rfiReadyMode") ?? "success";
const rfiIssueMode = params.get("rfiIssueMode") ?? "success";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const RFI_CONTACT = {
  id: "contact-1",
  name: "Alex Architect",
  companyName: "Meridian Design Group",
};

function projectRow(overrides: Record<string, unknown>) {
  return {
    id: "project-x",
    projectNumber: null,
    name: "Untitled project",
    status: "planning",
    description: null,
    address: { city: null, region: null },
    updatedAt: "2026-07-24T12:00:00Z",
    ...overrides,
  };
}

const projectRows = [
  projectRow({
    id: "project-1",
    projectNumber: "24-018",
    name: "Riverside Medical Center",
    status: "active",
    address: { city: "Orlando", region: "FL" },
    updatedAt: "2026-07-23T15:00:00Z",
  }),
  projectRow({
    id: "project-2",
    projectNumber: "24-031",
    name: "North Annex Renovation",
    status: "planning",
    address: { city: "Tampa", region: "FL" },
    updatedAt: "2026-07-20T09:30:00Z",
  }),
  projectRow({
    id: "project-3",
    projectNumber: "23-104",
    name: "Central Library Modernization",
    status: "closeout",
    address: { city: "Jacksonville", region: "FL" },
    updatedAt: "2026-07-16T18:15:00Z",
  }),
  projectRow({
    id: "project-4",
    projectNumber: null,
    name: "Westside Operations Facility",
    status: "suspended",
    address: { city: null, region: null },
    updatedAt: "2026-07-10T14:45:00Z",
  }),
];

function recordRow(overrides: Record<string, unknown>) {
  return {
    id: "record-x",
    projectId: "p1",
    recordNumber: null,
    title: "Untitled document",
    recordType: "document",
    discipline: null,
    status: "active",
    currentRevision: null,
    hasDraftRevision: false,
    draftRevisionId: null,
    fileCount: 0,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-20T09:00:00Z",
    capabilities: { update: true, archive: true },
    ...overrides,
  };
}

function currentRevision(overrides: Record<string, unknown>) {
  return {
    id: "revision-x",
    revisionNumber: 1,
    revisionLabel: null,
    status: "published",
    title: "Untitled revision",
    ...overrides,
  };
}

const recordRows = [
  recordRow({
    id: "record-1",
    recordNumber: "A-101",
    title: "Level 2 Framing Plan",
    recordType: "drawing",
    discipline: "structural",
    currentRevision: currentRevision({
      id: "revision-1",
      revisionNumber: 3,
      revisionLabel: "C",
      status: "published",
    }),
    hasDraftRevision: true,
    draftRevisionId: "revision-1-draft",
    fileCount: 4,
    updatedAt: "2026-07-23T15:00:00Z",
  }),
  recordRow({
    id: "record-2",
    recordNumber: "M-501",
    title: "Mechanical Ductwork Schedule",
    recordType: "schedule",
    discipline: "mechanical",
    currentRevision: currentRevision({
      id: "revision-2",
      revisionNumber: 1,
      status: "published",
    }),
    fileCount: 2,
    updatedAt: "2026-07-21T11:30:00Z",
  }),
  recordRow({
    id: "record-3",
    recordNumber: "S-004",
    title: "Structural Calculations Narrative",
    recordType: "report",
    discipline: "structural",
    currentRevision: currentRevision({
      id: "revision-3",
      revisionNumber: 2,
      status: "superseded",
    }),
    fileCount: 6,
    updatedAt: "2026-07-18T08:00:00Z",
  }),
  // A legacy record that never received a server-generated number, and that
  // has no authoritative current revision yet -- both honest states the
  // register must show rather than paper over.
  recordRow({
    id: "record-4",
    recordNumber: null,
    title:
      "Existing conditions survey transferred from the previous document control system",
    recordType: "other",
    discipline: "survey",
    currentRevision: null,
    hasDraftRevision: true,
    draftRevisionId: "revision-4-draft",
    fileCount: 0,
    updatedAt: "2026-07-12T16:45:00Z",
  }),
  recordRow({
    id: "record-5",
    recordNumber: "A-090",
    title: "Superseded Lobby Elevation",
    recordType: "drawing",
    discipline: "architectural",
    status: "archived",
    currentRevision: currentRevision({
      id: "revision-5",
      revisionNumber: 2,
      status: "superseded",
    }),
    fileCount: 3,
    updatedAt: "2026-06-30T13:10:00Z",
  }),
];

function currentRecordRows() {
  if (recordFixture === "empty") return [];
  if (recordFixture === "archived-only") {
    return recordRows
      .filter((row) => row.id === "record-5")
      .map((row) => ({ ...row, status: "archived" }));
  }
  return recordRows;
}

function isRecordListUrl(url: string) {
  return /\/api\/v2\/projects\/[^/?]+\/records(\?|$)/.test(url);
}
function isRevisionCreateUrl(url: string) {
  return /\/api\/v2\/projects\/[^/?]+\/records\/[^/?]+\/revisions$/.test(url);
}

function rfiRow(overrides: Record<string, unknown>) {
  return {
    id: "rfi-x",
    rfiNumber: null,
    legacyReference: null,
    status: "draft",
    subject: "Untitled RFI",
    question: "",
    contractorSuggestion: null,
    drawingReferences: null,
    specificationReferences: null,
    responsiblePartyId: null,
    responsibleParty: null,
    responsiblePartyLegacyText: null,
    submittedBy: null,
    requestedResponseDate: null,
    issuedAt: null,
    responseReceivedAt: null,
    latestResponse: null,
    attachmentCount: 0,
    isOverdue: false,
    dueSoon: false,
    lockVersion: 1,
    draftRevisionId: "rev-x",
    issuanceReconciliationState: "not_issued",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    capabilities: { updateDraft: true },
    ...overrides,
  };
}

const rfiBaseRows = [
  rfiRow({
    id: "rfi-1",
    subject: "Relocate ceiling diffuser above conference room",
    question:
      "Coordinate the revised diffuser location with the structural beam layout shown on S-201.",
    drawingReferences: "A2.11",
    specificationReferences: "23 31 13",
    responsiblePartyId: RFI_CONTACT.id,
    responsibleParty: RFI_CONTACT.name,
    requestedResponseDate: "2026-08-05",
    dueSoon: true,
    updatedAt: "2026-07-23T15:00:00Z",
  }),
  rfiRow({
    id: "rfi-2",
    rfiNumber: "RFI-014",
    status: "open",
    subject: "Confirm hardware finish for corridor doors",
    question:
      "Drawings show US26D but the specification calls for US32D at corridor doors 210-214.",
    drawingReferences: "A6.01",
    specificationReferences: "08 71 00",
    responsiblePartyId: RFI_CONTACT.id,
    responsibleParty: RFI_CONTACT.name,
    requestedResponseDate: "2026-07-10",
    isOverdue: true,
    capabilities: { updateDraft: false },
    updatedAt: "2026-07-11T09:00:00Z",
  }),
  rfiRow({
    id: "rfi-3",
    rfiNumber: "RFI-009",
    status: "closed",
    subject: "Verify fire-rated assembly at stair enclosure",
    question:
      "Confirm the 2-hour rated assembly type at the north stair enclosure.",
    requestedResponseDate: "2026-06-01",
    capabilities: { updateDraft: false },
    updatedAt: "2026-06-15T09:00:00Z",
  }),
  // A deliberately long-text row -- long Subject, Question summary,
  // combined drawing/spec references, and Party/company name -- so evidence
  // captures show the single-line clamp and ellipsis truncation the approved
  // register hierarchy relies on, not just short fixture text that happens
  // to fit.
  rfiRow({
    id: "rfi-4",
    subject:
      "Resolve conflicting ceiling height requirements between the mechanical shaft enclosure and the acoustic soffit detail at the second-floor corridor",
    question:
      "The mechanical drawings show a hard lid at 9'-0\" AFF for duct clearance above the corridor, but the reflected ceiling plan calls for an acoustic soffit at 8'-6\" AFF along the same run -- please confirm which elevation governs and whether the duct routing needs to be revised.",
    drawingReferences: "A2.31, A2.32, A2.33, M4.02",
    specificationReferences: "09 51 13, 23 31 13, 23 05 93",
    responsiblePartyId: RFI_CONTACT.id,
    responsibleParty: "Alexandra Montgomery-Whitfield",
    requestedResponseDate: "2026-08-12",
    dueSoon: true,
    updatedAt: "2026-07-24T10:00:00Z",
  }),
];

let conflictOccurred = false;

function currentRfiRows() {
  if (rfiFixture === "empty") return [];
  if (conflictOccurred) {
    return rfiBaseRows.map((row) =>
      row.id === "rfi-1"
        ? { ...row, subject: "Changed by another reviewer", lockVersion: 3 }
        : row,
    );
  }
  return rfiBaseRows;
}

function isRfiListUrl(url: string) {
  return /\/api\/v2\/projects\/[^/?]+\/rfis(\?|$)/.test(url);
}
function isRfiItemUrl(url: string) {
  return /\/api\/v2\/projects\/[^/?]+\/rfis\/[^/?]+$/.test(url);
}

/* ---------------------------------------------------- UI-7 workspace models */

function workspaceFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    originalFilename: "level-2-framing-plan.pdf",
    mediaType: "application/pdf",
    byteSize: 2_400_000,
    uploadedAt: "2026-07-20T09:00:00Z",
    ...overrides,
  };
}

function workspaceRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: "revision-1",
    revisionNumber: 1,
    revisionLabel: null,
    title: "Level 2 Framing Plan",
    description: null,
    discipline: "structural",
    source: null,
    changeSummary: "Issued for construction.",
    status: "published",
    createdAt: "2026-06-02T09:00:00Z",
    fileCount: 1,
    files: [workspaceFile()],
    issuanceCount: 1,
    isCurrent: true,
    capabilities: { uploadFile: false, publishRevision: false },
    ...overrides,
  };
}

const PUBLISHED_REVISION = workspaceRevision();
const SUPERSEDED_REVISION = workspaceRevision({
  id: "revision-0",
  revisionNumber: 1,
  status: "superseded",
  isCurrent: false,
  changeSummary: "Original permit set.",
  createdAt: "2026-05-04T09:00:00Z",
  issuanceCount: 0,
});
const CURRENT_REVISION = workspaceRevision({
  id: "revision-2",
  revisionNumber: 2,
  revisionLabel: "B",
  status: "published",
  isCurrent: true,
  changeSummary: "Revised beam layout at grid C-4 per RFI-014.",
  createdAt: "2026-07-02T09:00:00Z",
});
const DRAFT_REVISION = workspaceRevision({
  id: "revision-3",
  revisionNumber: 3,
  revisionLabel: null,
  status: "draft",
  isCurrent: false,
  changeSummary: "Coordination updates pending structural review.",
  createdAt: "2026-07-22T09:00:00Z",
  issuanceCount: 0,
  capabilities: { uploadFile: true, publishRevision: true },
});
const EMPTY_DRAFT_REVISION = workspaceRevision({
  ...DRAFT_REVISION,
  id: "revision-4",
  files: [],
  fileCount: 0,
});

function workspaceRecordModel() {
  return {
    id: "record-1",
    projectId: "p1",
    recordType: "drawing",
    recordNumber: "A-101",
    title: "Level 2 Framing Plan",
    description:
      "Structural framing plan for the second floor, including the revised beam layout at grid C-4.",
    discipline: "structural",
    source: "Meridian Design Group",
    status: workspaceFixture === "archived" ? "archived" : "active",
    archivedAt: workspaceFixture === "archived" ? "2026-07-15T09:00:00Z" : null,
    createdAt: "2026-05-04T09:00:00Z",
    updatedAt: "2026-07-22T09:00:00Z",
  };
}

function currentRecordWorkspace() {
  const active = workspaceFixture !== "archived";
  const revisions =
    workspaceFixture === "no-revision"
      ? []
      : workspaceFixture === "draft"
        ? [DRAFT_REVISION, CURRENT_REVISION, SUPERSEDED_REVISION]
        : workspaceFixture === "empty-draft"
          ? [EMPTY_DRAFT_REVISION]
          : [CURRENT_REVISION, SUPERSEDED_REVISION];
  return {
    record: workspaceRecordModel(),
    revisions,
    totalFileCount: revisions.reduce((sum, item) => sum + item.fileCount, 0),
    currentRevision: revisions.find((item) => item.isCurrent) ?? null,
    capabilities: {
      updateRecord: active,
      archiveRecord: active,
      createRevision: active,
    },
  };
}

function currentRevisionWorkspace() {
  const revision =
    workspaceFixture === "draft" || workspaceFixture === "empty-draft"
      ? workspaceFixture === "empty-draft"
        ? EMPTY_DRAFT_REVISION
        : DRAFT_REVISION
      : workspaceFixture === "superseded"
        ? SUPERSEDED_REVISION
        : PUBLISHED_REVISION;
  return {
    record: workspaceRecordModel(),
    revision,
    currentRevisionId: revision.isCurrent ? revision.id : CURRENT_REVISION.id,
  };
}

const RFI_ATTACHMENTS = [
  {
    id: "attachment-1",
    role: "supporting_attachment",
    revisionId: "rfi-draft-1",
    revisionLabel: "Current Draft",
    originalFilename: "ceiling-coordination-sketch.pdf",
    mediaType: "application/pdf",
    byteSize: 812_000,
    uploadedBy: "user-1",
    uploadedAt: "2026-07-19T09:00:00Z",
  },
  {
    id: "attachment-2",
    role: "reference_drawing",
    revisionId: "rfi-draft-1",
    revisionLabel: "Current Draft",
    originalFilename: "A2-11-reflected-ceiling.pdf",
    mediaType: "application/pdf",
    byteSize: 1_450_000,
    uploadedBy: "user-1",
    uploadedAt: "2026-07-19T10:30:00Z",
  },
];

const LONG_RFI_ATTACHMENTS = [
  {
    ...RFI_ATTACHMENTS[0],
    originalFilename:
      "second-floor-corridor-ceiling-height-and-duct-clearance-coordination-sketch-revision-c-superseding-the-july-issue.pdf",
  },
  {
    ...RFI_ATTACHMENTS[1],
    originalFilename:
      "A2-11-reflected-ceiling-plan-with-acoustic-soffit-and-sprinkler-head-coordination-overlay.pdf",
  },
];

const RFI_ISSUE_RECIPIENTS = {
  to: [
    {
      projectContactId: RFI_CONTACT.id,
      contactName: RFI_CONTACT.name,
      companyName: RFI_CONTACT.companyName,
      email: "alex@meridian.example",
    },
  ],
  cc: [
    {
      projectContactId: "contact-2",
      contactName: "Sam Engineer",
      companyName: "Northline MEP",
      email: null,
    },
  ],
};

function issuedFileSnapshot(attachment: (typeof RFI_ATTACHMENTS)[number]) {
  return {
    fileId: attachment.id,
    role: attachment.role,
    originalFilename: attachment.originalFilename,
    mediaType: attachment.mediaType,
    byteSize: attachment.byteSize,
    sha256: "0".repeat(64),
  };
}

const LONG_RFI_SUBJECT =
  "Resolve conflicting ceiling height, duct clearance, acoustic soffit, and sprinkler head layout requirements across the second-floor corridor between grid lines C and G, including coordination with the adjacent classroom wing";
const LONG_RFI_QUESTION = [
  "The mechanical drawings show a hard lid at 9'-0\" AFF for duct clearance above the corridor, but the reflected ceiling plan calls for an acoustic soffit at 8'-6\" AFF along the same run -- please confirm which elevation governs.",
  "In addition, the sprinkler shop drawings (F-201) show heads centered on a 4'-0\" grid that conflicts with the soffit return at three locations near column lines D and F; if the soffit governs, those heads will need to be relocated and the fire-protection engineer will need to reissue calculations for the affected zone.",
  "Please also confirm whether the acoustic treatment above the soffit needs to extend into the adjacent classroom wing, since the existing RCP only shows it terminating at the corridor line and the specification section referenced below implies continuous treatment across the corridor-to-classroom transition.",
].join(" ");

let rfiIssueCommitted = false;

function currentRfiWorkspace() {
  const long =
    rfiWorkspaceFixture === "long" || rfiWorkspaceFixture === "ready-long";
  const issued =
    (["issued", "responded", "legacy"].includes(rfiWorkspaceFixture) &&
      !long) ||
    rfiIssueCommitted;
  const legacy = rfiWorkspaceFixture === "legacy";
  const responded = rfiWorkspaceFixture === "responded";
  const ready =
    (rfiWorkspaceFixture === "ready" || rfiWorkspaceFixture === "ready-long") &&
    !rfiIssueCommitted;
  return {
    rfi: {
      id: "rfi-1",
      rfiNumber: issued ? "RFI-014" : null,
      legacyReference: null,
      status: responded
        ? "response_received"
        : issued
          ? "open"
          : ready
            ? "ready_to_issue"
            : "draft",
      subject: long
        ? LONG_RFI_SUBJECT
        : "Resolve conflicting ceiling height requirements at the second-floor corridor",
      question: long
        ? LONG_RFI_QUESTION
        : "The mechanical drawings show a hard lid at 9'-0\" AFF for duct clearance above the corridor, but the reflected ceiling plan calls for an acoustic soffit at 8'-6\" AFF along the same run — please confirm which elevation governs.",
      contractorSuggestion:
        "Hold the acoustic soffit at 8'-6\" and reroute the duct above the adjacent classroom.",
      drawingReferences: long
        ? "A2.31, A2.32, A2.33, M4.02, M4.03, F-201, F-202"
        : "A2.31, A2.32, M4.02",
      specificationReferences: "09 51 13, 23 31 13",
      responsibleParty: RFI_CONTACT.name,
      responsiblePartyId: RFI_CONTACT.id,
      responsiblePartyLegacyText: null,
      submittedBy: null,
      requestedResponseDate: "2026-08-05",
      costImpact: responded ? "No cost impact" : null,
      scheduleImpact: responded ? "No schedule impact" : null,
      issuedAt: issued ? "2026-07-10T09:00:00Z" : null,
      responseReceivedAt: responded ? "2026-07-18T09:00:00Z" : null,
      closedAt: null,
      lockVersion: 1,
      createdAt: "2026-07-01T09:00:00Z",
      updatedAt: "2026-07-22T09:00:00Z",
      isOverdue: false,
      dueSoon: true,
      issuanceReconciliationState: legacy ? "legacy_incomplete" : "not_issued",
    },
    currentVersion: {
      id: "rfi-draft-1",
      label: issued ? "Original Issue" : "Current Draft",
      status: issued ? "published" : "draft",
    },
    responsibleContacts: [
      RFI_CONTACT,
      { id: "contact-2", name: "Sam Engineer", companyName: "Northline MEP" },
    ],
    project: {
      id: "p1",
      projectNumber: "24-018",
      name: "Riverside Medical Center",
      status: "active",
      timezone: "America/New_York",
      address: {
        line1: null,
        line2: null,
        city: "Orlando",
        region: "FL",
        postalCode: null,
        country: null,
      },
    },
    organization: { id: "org-1", name: "BASE Construction Group" },
    template: null,
    attachments: {
      // The server labels an attachment with the revision it belongs to, which
      // becomes "Original Issue" once that revision is promoted at issue.
      supporting_attachment: [
        {
          ...(long ? LONG_RFI_ATTACHMENTS[0] : RFI_ATTACHMENTS[0]),
          revisionLabel: issued ? "Original Issue" : "Current Draft",
        },
      ],
      reference_drawing: [
        {
          ...(long ? LONG_RFI_ATTACHMENTS[1] : RFI_ATTACHMENTS[1]),
          revisionLabel: issued ? "Original Issue" : "Current Draft",
        },
      ],
    },
    officialIssue:
      issued && !legacy
        ? {
            officialDisplayNumber: "RFI-014",
            issuedRevision: {
              id: "rfi-draft-1",
              internalRevisionNumber: 1,
              userFacingVersion: "Original Issue" as const,
            },
            issuance: { id: "issuance-1", issueNumber: "ISS-014" },
            issuedAt: "2026-07-10T09:00:00Z",
            responseDueDate: "2026-08-05",
            officialArtifact: {
              fileId: "official-rfi-pdf",
              role: "generated_artifact",
              originalFilename: "RFI-014.pdf",
              mediaType: "application/pdf",
              byteSize: 42_000,
              sha256: "0".repeat(64),
            },
            includedFiles: (long ? LONG_RFI_ATTACHMENTS : RFI_ATTACHMENTS).map(
              issuedFileSnapshot,
            ),
            recipients: RFI_ISSUE_RECIPIENTS,
            originalIssueRequestId: "req-original-issue",
          }
        : null,
    responses: responded
      ? [
          {
            id: "response-1",
            response:
              "Hold the acoustic soffit at 8'-6\" AFF. Reroute the supply duct above the adjacent classroom as suggested; no structural change is required.",
            respondedBy: "Alex Architect",
            createdAt: "2026-07-18T09:00:00Z",
          },
        ]
      : [],
    activity: long
      ? [
          {
            action: "rfi.created",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-01T09:00:00Z",
            changedFields: [],
            role: null,
          },
          {
            action: "rfi.attachment_added",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-02T11:15:00Z",
            changedFields: [],
            role: "supporting_attachment",
          },
          {
            action: "rfi.updated",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-05T09:00:00Z",
            changedFields: ["question", "drawingReferences"],
            role: null,
          },
          {
            action: "rfi.attachment_added",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-08T14:45:00Z",
            changedFields: [],
            role: "reference_drawing",
          },
          {
            action: "rfi.updated",
            actorType: "system",
            actorDisplayName: null,
            createdAt: "2026-07-12T09:00:00Z",
            changedFields: ["requestedResponseDate"],
            role: null,
          },
          {
            action: "rfi.attachment_added",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-15T10:30:00Z",
            changedFields: [],
            role: "reference_drawing",
          },
          {
            action: "rfi.updated",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-19T10:30:00Z",
            changedFields: ["subject"],
            role: null,
          },
          {
            action: "rfi.updated",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-22T09:00:00Z",
            changedFields: ["subject", "requestedResponseDate"],
            role: null,
          },
        ]
      : [
          {
            action: "rfi.created",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-01T09:00:00Z",
            changedFields: [],
            role: null,
          },
          {
            action: "rfi.attachment_added",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-19T10:30:00Z",
            changedFields: [],
            role: "reference_drawing",
          },
          {
            action: "rfi.updated",
            actorType: "user",
            actorDisplayName: "Dana Project Manager",
            createdAt: "2026-07-22T09:00:00Z",
            changedFields: ["subject", "requestedResponseDate"],
            role: null,
          },
        ],
    capabilities: {
      updateDraft: !issued && !ready,
      uploadAttachment: !issued,
      markReady: !issued && !ready && !legacy,
      returnToDraft: ready,
      issue: ready,
      recordResponse: issued && !responded,
      returnForClarification: false,
      close: responded,
      reopen: false,
      void: !legacy,
    },
  };
}

function isRecordWorkspaceUrl(url: string) {
  return /\/api\/v2\/projects\/[^/?]+\/records\/[^/?]+\/workspace$/.test(url);
}
function isRevisionWorkspaceUrl(url: string) {
  return /\/records\/[^/?]+\/revisions\/[^/?]+\/workspace$/.test(url);
}
function isRfiWorkspaceUrl(url: string) {
  return /\/rfis\/[^/?]+\/workspace$/.test(url);
}

globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = (init?.method || "GET").toUpperCase();
  if (url.includes("/api/v2/session")) {
    return Promise.resolve(
      response({
        data: {
          organization: { name: "BASE Construction Group" },
          membership: { role },
        },
      }),
    );
  }

  if (/\/api\/v2\/projects(?:\?|$)/.test(url) && method === "GET") {
    if (projectFixture === "error") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "PROJECTS_UNAVAILABLE",
              message: "The projects service is temporarily unavailable.",
              requestId: "req-ui6a-evidence",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(
      response({
        data: projectFixture === "empty" ? [] : projectRows,
        meta: {
          requestId: "req-ui6a-evidence",
          capabilities: { createProject: true },
        },
      }),
    );
  }

  if (/\/api\/v2\/projects(?:\?|$)/.test(url) && method === "POST") {
    const body =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    return Promise.resolve(
      response(
        {
          data: projectRow({
            id: "project-created",
            ...body,
            updatedAt: "2026-07-24T12:00:00Z",
          }),
        },
        201,
      ),
    );
  }

  // --- UI-7 detail workspaces --------------------------------------------
  if (isRevisionWorkspaceUrl(url) && method === "GET") {
    if (workspaceFixture === "error") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "REVISION_UNAVAILABLE",
              message: "The revision could not be loaded.",
              requestId: "req-ui7-revision",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(
      response({
        data: currentRevisionWorkspace(),
        meta: { requestId: "req-ui7-revision" },
      }),
    );
  }

  if (isRecordWorkspaceUrl(url) && method === "GET") {
    if (workspaceFixture === "error") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "RECORD_UNAVAILABLE",
              message: "The document could not be loaded.",
              requestId: "req-ui7-record",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(
      response({
        data: currentRecordWorkspace(),
        meta: { requestId: "req-ui7-record" },
      }),
    );
  }

  // --- RFI Slice 2B lifecycle -------------------------------------------
  if (/\/rfis\/[^/?]+\/ready$/.test(url) && method === "POST") {
    if (rfiReadyMode === "validation-failure") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "RFI_READY_VALIDATION_FAILED",
              message:
                "A responsible project contact must be active on this project before this RFI can be marked ready.",
              requestId: "req-rfi2b-ready",
            },
          },
          422,
        ),
      );
    }
    return Promise.resolve(response({ data: {} }));
  }

  if (/\/rfis\/[^/?]+\/issue$/.test(url) && method === "POST") {
    if (rfiIssueMode === "pending") {
      // Never settles, so the capture documents the real in-flight state.
      return new Promise<Response>(() => undefined);
    }
    if (rfiIssueMode === "retryable") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "RFI_ARTIFACT_RENDER_FAILED",
              message: "The official RFI artifact could not be generated.",
              requestId: "req-rfi2b-render",
            },
          },
          503,
        ),
      );
    }
    if (rfiIssueMode === "reconcile") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "RFI_ARTIFACT_RECONCILIATION_REQUIRED",
              message:
                "The issuance outcome is uncertain and its artifact requires reconciliation.",
              requestId: "req-rfi2b-reconcile",
            },
          },
          500,
        ),
      );
    }
    rfiIssueCommitted = true;
    return Promise.resolve(
      response({
        data: {
          rfiId: "rfi-1",
          recordId: "rfi-1",
          officialDisplayNumber: "RFI-014",
          status: "open",
          issuedRevision: {
            id: "rfi-draft-1",
            internalRevisionNumber: 1,
            userFacingVersion: "Original Issue",
          },
          issuance: { id: "issuance-1", issueNumber: "ISS-014" },
          issuedAt: "2026-07-10T09:00:00Z",
          responseDueDate: "2026-08-05",
          officialArtifact: {
            fileId: "official-rfi-pdf",
            role: "generated_artifact",
            originalFilename: "RFI-014.pdf",
            mediaType: "application/pdf",
            byteSize: 42_000,
            sha256: "0".repeat(64),
          },
          includedFiles: RFI_ATTACHMENTS.map(issuedFileSnapshot),
          recipients: RFI_ISSUE_RECIPIENTS,
          capabilities: {
            issue: false,
            recordResponse: true,
            returnForClarification: false,
            close: false,
            reopen: false,
            void: true,
          },
          requestId: "req-rfi2b-issue",
        },
      }),
    );
  }

  if (isRfiWorkspaceUrl(url) && method === "GET") {
    if (rfiWorkspaceFixture === "error") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "RFI_UNAVAILABLE",
              message: "The RFI could not be loaded.",
              requestId: "req-ui7-rfi",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(
      response({
        data: currentRfiWorkspace(),
        meta: { requestId: "req-ui7-rfi" },
      }),
    );
  }

  if (/\/revisions\/[^/?]+\/files$/.test(url) && method === "POST") {
    if (workspaceUploadMode === "failure") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "FILE_UNAVAILABLE",
              message: "The file could not be stored.",
              requestId: "req-ui7-upload",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(response({ data: { id: "file-new" } }, 201));
  }

  if (isRecordListUrl(url) && method === "GET") {
    if (recordFixture === "error") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "RECORDS_UNAVAILABLE",
              message: "The document register is temporarily unavailable.",
              requestId: "req-ui6b-evidence",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(
      response(
        {
          data: {
            records: currentRecordRows(),
            capabilities: { createRecord: true },
          },
          meta: { requestId: "req-ui6b-evidence" },
        },
        200,
      ),
    );
  }

  if (isRecordListUrl(url) && method === "POST") {
    const body =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    return Promise.resolve(
      response(
        { data: { id: "record-new", recordNumber: "A-118", ...body } },
        201,
      ),
    );
  }

  if (isRevisionCreateUrl(url) && method === "POST") {
    // The partial-success evidence stops here: the Record exists, its draft
    // Revision does not, and the workflow must say so and offer recovery.
    if (recordCreateMode === "revision-failure") {
      return Promise.resolve(
        response(
          {
            error: {
              code: "REVISION_UNAVAILABLE",
              message: "The original draft revision could not be created.",
              requestId: "req-ui6b-revision",
            },
          },
          503,
        ),
      );
    }
    return Promise.resolve(
      response(
        {
          data: { id: "revision-new", revisionNumber: 1, revisionLabel: null },
        },
        201,
      ),
    );
  }

  if (isRfiItemUrl(url) && method === "PATCH") {
    if (rfiPatchMode === "conflict") {
      conflictOccurred = true;
      return Promise.resolve(
        response(
          {
            error: {
              code: "RFI_VERSION_CONFLICT",
              message: "This RFI changed elsewhere.",
            },
          },
          409,
        ),
      );
    }
    if (rfiPatchMode === "slow") {
      return new Promise((resolve) => {
        window.setTimeout(() => {
          resolve(response({ data: { lockVersion: 2 } }));
        }, 8000);
      });
    }
    const body =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    return Promise.resolve(response({ data: { ...body, lockVersion: 2 } }));
  }

  if (isRfiListUrl(url) && method === "POST") {
    const body =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    return Promise.resolve(
      response(
        {
          data: rfiRow({ id: "rfi-new", ...body }),
        },
        201,
      ),
    );
  }

  if (isRfiListUrl(url) && method === "GET") {
    return Promise.resolve(
      response({
        data: {
          project: {
            id: "p1",
            projectNumber: "24-018",
            name: "Riverside Medical Center",
            status: "active",
          },
          responsibleContacts: [RFI_CONTACT],
          rfis: currentRfiRows(),
          capabilities: { createRfi: true },
        },
      }),
    );
  }

  if (/\/api\/v2\/projects\/[^/?]+$/.test(url)) {
    return Promise.resolve(
      response({
        data: {
          id: "p1",
          name: "Riverside Medical Center",
          projectNumber: "24-018",
          status: "active",
        },
      }),
    );
  }
  return Promise.resolve(response({}, 404));
};

const FEATURE_TITLES: Record<FeatureKind, string> = {
  dashboard: "Work Dashboard",
  projects: "Projects",
  overview: "Overview",
  records: "Document Register",
  "record-detail": "Record detail",
  "revision-detail": "Document revision",
  rfis: "RFIs",
  "rfi-workspace": "RFI",
};

function renderStubFeature(container: HTMLElement, kind: FeatureKind) {
  const title = FEATURE_TITLES[kind];
  container.innerHTML = `
    <section class="workspace-page app-register-page">
      <header class="app-register-header app-container-register">
        <div class="app-register-title">
          <h1 id="page-title" tabindex="-1">${title}</h1>
          <span class="app-register-count">3 documents</span>
        </div>
        <button class="primary-button" type="button">Add document</button>
      </header>
      <div class="app-register-toolbar app-container-register">
        <div class="app-register-controls">
          <div class="app-field app-search-field app-register-control">
            <input type="search" placeholder="Search documents..." />
          </div>
        </div>
        <div class="app-register-filter-state">
          <p class="app-register-result-count">3 documents</p>
        </div>
      </div>
      <p style="padding: 0 var(--app-gutter); color: var(--shell-muted); font-size: 12px;">
        Compatibility mount: the ${kind} feature controller renders here
        unchanged. The surrounding sidebar, project header, tabs, and drawer are
        the React application shell.
      </p>
    </section>`;
}

const runtime: ShellRuntime = {
  getApiClient: () =>
    Promise.resolve({
      request: () =>
        Promise.resolve({ data: undefined, requestId: "", status: 200 }),
    } as LegacyApiClient),
  loadFeatureFactory: (kind) =>
    Promise.resolve((deps: FeatureControllerDeps) => ({
      mount: (container: HTMLElement) => {
        renderStubFeature(container, kind);
      },
      reload: () => {
        deps.requestRender();
      },
      destroy: () => {
        /* no-op */
      },
    })),
};

const rootElement = document.getElementById("react-app");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppProviders queryClient={createQueryClient()}>
        <MemoryRouter initialEntries={[route]}>
          <ShellRoutes runtime={runtime} />
        </MemoryRouter>
      </AppProviders>
    </StrictMode>,
  );
}

if (openDrawer) {
  window.setTimeout(() => {
    document.querySelector<HTMLButtonElement>(".mobile-menu-button")?.click();
  }, 300);
}

// Drives the RFI register into a specific interaction state (open editor,
// saving, validation error, conflict) using real DOM events so the capture
// script only needs a static screenshot -- no external browser-automation
// scripting required. Population/filtering/empty states are reachable purely
// through `route`'s query string and `rfiFixture`, so they need no scripting.
function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called via .call() immediately below
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function openMenuTrigger(trigger: HTMLElement) {
  trigger.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  trigger.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, button: 0 }),
  );
  trigger.click();
}

async function waitForSelector(
  selector: string,
  timeout = 4000,
): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return found;
    await new Promise((resolve) => {
      window.setTimeout(resolve, 50);
    });
  }
  throw new Error(`Evidence harness: timed out waiting for ${selector}`);
}

async function runRfiScenario() {
  if (rfiScenario === "none") return;
  if (rfiScenario === "mobile-filters") {
    const filters = (await waitForSelector(
      'button[aria-label^="Show"][aria-controls]',
    )) as HTMLButtonElement;
    filters.click();
    await waitForSelector(".base-toolbar__filters--mobile-disclosure.is-open");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return;
  }
  if (rfiScenario === "new-draft") {
    const add = (await waitForSelector(
      "[data-create-rfi]",
    )) as HTMLButtonElement;
    add.click();
    await waitForSelector('[data-editor-drawer="rfi-new"]');
    return;
  }
  await waitForSelector('[data-subject-edit][data-id="rfi-1"]');
  if (rfiScenario === "action-menu") {
    const actions = (await waitForSelector(
      'button[aria-label^="Actions for"]',
    )) as HTMLButtonElement;
    openMenuTrigger(actions);
    await waitForSelector(".base-menu");
    return;
  }
  document
    .querySelector<HTMLButtonElement>('[data-subject-edit][data-id="rfi-1"]')
    ?.click();
  await waitForSelector(
    '[data-field-input][data-id="rfi-1"][data-field="subject"]',
  );

  if (rfiScenario === "editor-open" || rfiScenario === "additional-collapsed") {
    return;
  }

  if (rfiScenario === "additional-expanded") {
    const additional = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Additional information"),
    );
    additional?.click();
    await waitForSelector('.base-collapsible[data-state="open"]');
    return;
  }

  if (rfiScenario === "validation-error") {
    const subject = (await waitForSelector(
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    )) as HTMLInputElement;
    setNativeValue(subject, "");
    subject.blur();
    await waitForSelector('[role="alert"]');
    return;
  }

  if (rfiScenario === "saving") {
    // Uses the Subject field (visible without scrolling) rather than a
    // lower field, so the in-flight "Saving…" indicator is captured on
    // screen at the default evidence viewport height.
    const subject = (await waitForSelector(
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    )) as HTMLInputElement;
    setNativeValue(
      subject,
      "Relocate ceiling diffuser above the conference room",
    );
    subject.blur();
    await waitForSelector(".base-save--muted");
    return;
  }

  if (rfiScenario === "conflict") {
    const subject = (await waitForSelector(
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    )) as HTMLInputElement;
    setNativeValue(subject, "Changed via evidence capture");
    subject.blur();
    await waitForSelector('[role="alert"]');
  }
}

void runRfiScenario();

async function runProjectScenario() {
  if (projectScenario === "none") return;
  if (projectScenario === "mobile-filters") {
    const filters = (await waitForSelector(
      'button[aria-label^="Show"][aria-controls]',
    )) as HTMLButtonElement;
    filters.click();
    await waitForSelector(".base-toolbar__filters--mobile-disclosure.is-open");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return;
  }
  if (projectScenario === "create-dialog") {
    const create = (await waitForSelector(
      "[data-create-project]",
    )) as HTMLButtonElement;
    create.click();
    await waitForSelector(".projects-create-dialog");
  }
}

void runProjectScenario();

async function runRecordScenario() {
  if (recordScenario === "none") return;
  if (recordScenario === "mobile-filters") {
    const filters = (await waitForSelector(
      'button[aria-label^="Show"][aria-controls]',
    )) as HTMLButtonElement;
    filters.click();
    await waitForSelector(".base-toolbar__filters--mobile-disclosure.is-open");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return;
  }

  // Every remaining scenario starts by opening the Add Document Drawer from
  // the real capability-gated page action.
  const add = (await waitForSelector(
    "[data-add-document]",
  )) as HTMLButtonElement;
  add.click();
  await waitForSelector(".add-document-drawer");
  if (recordScenario === "add-choice") return;

  const upload = (await waitForSelector(
    "[data-mode='upload']",
  )) as HTMLButtonElement;
  upload.click();
  await waitForSelector(".add-document-form");
  if (recordScenario === "add-upload") {
    const title = (await waitForSelector(
      ".add-document-form input[type='text']",
    )) as HTMLInputElement;
    setNativeValue(title, "Level 3 Framing Plan");
    return;
  }

  if (recordScenario === "add-recovery") {
    const title = (await waitForSelector(
      ".add-document-form input[type='text']",
    )) as HTMLInputElement;
    setNativeValue(title, "Level 3 Framing Plan");
    const file = (await waitForSelector(
      "[data-document-file]",
    )) as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["evidence"], "level-3-framing.pdf", {
        type: "application/pdf",
      }),
    );
    file.files = transfer.files;
    file.dispatchEvent(new Event("change", { bubbles: true }));
    (
      (await waitForSelector("[data-submit-document]")) as HTMLButtonElement
    ).click();
    // Record creation succeeds and the draft Revision fails, so the recovery
    // block (server message, request ID, and link to the usable Record) is
    // what the screenshot captures. Scroll it into view so the recovery link
    // itself is visible above the Drawer's stable footer.
    const recovery = await waitForSelector("[data-recovery-link]");
    recovery.scrollIntoView({ block: "center", behavior: "instant" });
  }
}

void runRecordScenario();

/*
 * UI-7 detail-workspace scenarios. Each drives the REAL workspace through real
 * DOM events -- an overflow menu item, a confirmation, a file selection -- so a
 * screenshot documents the production component in that state rather than a
 * hand-built mock of it.
 */
async function runWorkspaceScenario() {
  if (workspaceScenario === "none") return;

  if (workspaceScenario === "publish-confirm") {
    const publish = (await waitForSelector(
      "[data-publish-revision]",
    )) as HTMLButtonElement;
    publish.click();
    await waitForSelector('[role="alertdialog"]');
    return;
  }

  if (workspaceScenario === "upload-failure") {
    const file = (await waitForSelector(
      "[data-revision-file]",
    )) as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["evidence"], "level-2-framing-rev-c.pdf", {
        type: "application/pdf",
      }),
    );
    file.files = transfer.files;
    file.dispatchEvent(new Event("change", { bubbles: true }));
    (
      (await waitForSelector("[data-upload-submit]")) as HTMLButtonElement
    ).click();
    const alert = await waitForSelector(".revision-upload__error");
    alert.scrollIntoView({ block: "center", behavior: "instant" });
    return;
  }

  if (
    workspaceScenario === "edit-dialog" ||
    workspaceScenario === "archive-confirm" ||
    workspaceScenario === "create-revision"
  ) {
    const actions = (await waitForSelector(
      "[data-record-actions]",
    )) as HTMLButtonElement;
    openMenuTrigger(actions);
    const menu = await waitForSelector(".base-menu");
    if (workspaceScenario === "edit-dialog") {
      const items = [...menu.querySelectorAll<HTMLElement>(".base-menu__item")];
      items
        .find((item) => item.textContent.includes("Edit document details"))
        ?.click();
      await waitForSelector("[data-record-title]");
      return;
    }
    if (workspaceScenario === "create-revision") {
      const items = [...menu.querySelectorAll<HTMLElement>(".base-menu__item")];
      items
        .find((item) => item.textContent.includes("Create draft revision"))
        ?.click();
      await waitForSelector("[data-revision-summary]");
      return;
    }
    const items = [...menu.querySelectorAll<HTMLElement>(".base-menu__item")];
    items
      .find((item) => item.textContent.includes("Archive document"))
      ?.click();
    await waitForSelector('[role="alertdialog"]');
  }
}

void runWorkspaceScenario();

async function runRfiWorkspaceScenario() {
  if (rfiWorkspaceScenario === "none") return;

  if (rfiWorkspaceScenario === "preview") {
    // This dev harness never loads a renderer runtime, matching the
    // authenticated app -- so the document-view note renders directly, with
    // no "Show document view" toggle to click through to a dead end.
    await waitForSelector("[data-preview-unavailable]");
    return;
  }

  if (rfiWorkspaceScenario === "void-confirm") {
    const actions = (await waitForSelector(
      "[data-rfi-actions]",
    )) as HTMLButtonElement;
    openMenuTrigger(actions);
    const menu = await waitForSelector(".base-menu");
    [...menu.querySelectorAll<HTMLElement>(".base-menu__item")]
      .find((item) => item.textContent.includes("Void RFI"))
      ?.click();
    await waitForSelector('[role="alertdialog"]');
    return;
  }

  if (rfiWorkspaceScenario === "return-to-draft-confirm") {
    (
      (await waitForSelector(
        '[data-transition="return-to-draft"]',
      )) as HTMLButtonElement
    ).click();
    await waitForSelector('[role="alertdialog"]');
    return;
  }

  if (rfiWorkspaceScenario === "validation-error") {
    const subject = (await waitForSelector(
      '[data-rfi-field="subject"]',
    )) as HTMLInputElement;
    setNativeValue(subject, "");
    ((await waitForSelector("[data-save-draft]")) as HTMLButtonElement).click();
    await waitForSelector('[role="alert"], .base-field__error');
    return;
  }

  await runRfiIssueScenario();
}

/*
 * RFI Slice 2B scenarios. Each drives the production mark-ready and official
 * issue workflows through real DOM events against the real API layer, so the
 * captures document the shipped components in the state they claim -- including
 * the ones only a failing server can produce.
 */
async function runRfiIssueScenario() {
  const scenario = rfiWorkspaceScenario;

  if (scenario === "dirty-draft") {
    const subject = (await waitForSelector(
      '[data-rfi-field="subject"]',
    )) as HTMLInputElement;
    setNativeValue(
      subject,
      "Resolve conflicting ceiling height requirements at the second-floor corridor and classroom wing",
    );
    await waitForSelector('[data-rfi-content-form][data-rfi-dirty="true"]');
    return;
  }

  if (
    scenario === "mark-ready-confirm" ||
    scenario === "mark-ready-dirty-confirm" ||
    scenario === "mark-ready-failure"
  ) {
    if (scenario === "mark-ready-dirty-confirm") {
      const subject = (await waitForSelector(
        '[data-rfi-field="subject"]',
      )) as HTMLInputElement;
      setNativeValue(
        subject,
        "Resolve conflicting ceiling height requirements at the second-floor corridor and classroom wing",
      );
      await waitForSelector('[data-rfi-content-form][data-rfi-dirty="true"]');
    }
    ((await waitForSelector("[data-mark-ready]")) as HTMLButtonElement).click();
    const confirm = await waitForSelector('[role="alertdialog"]');
    if (scenario !== "mark-ready-failure") return;
    [...confirm.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent.startsWith("Mark ready"))
      ?.click();
    const alert = await waitForSelector(".rfi-workspace-error");
    alert.scrollIntoView({ block: "center", behavior: "instant" });
    return;
  }

  if (scenario === "ready-overflow") {
    const actions = (await waitForSelector(
      "[data-rfi-actions]",
    )) as HTMLButtonElement;
    openMenuTrigger(actions);
    await waitForSelector(".base-menu");
    return;
  }

  // The immutable evidence sits below the content and files sections, so the
  // capture scrolls to it rather than claiming an above-the-fold screenshot
  // shows it.
  if (scenario === "issued-evidence") {
    (await waitForSelector("[data-issued-files]")).scrollIntoView({
      block: "center",
      behavior: "instant",
    });
    return;
  }

  if (scenario === "sticky-rail") {
    (
      await waitForSelector(".base-workspace-section--secondary")
    ).scrollIntoView({
      block: "center",
      behavior: "instant",
    });
    return;
  }

  if (!scenario.startsWith("issue-")) return;

  ((await waitForSelector("[data-issue-rfi]")) as HTMLButtonElement).click();
  await waitForSelector("[data-issue-recipients]");
  if (scenario === "issue-details") return;

  if (scenario === "issue-recipients") {
    const cc = await waitForSelector("[data-issue-cc]");
    [...cc.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')][1].click();
    await waitForSelector(
      '[data-issue-cc] [role="checkbox"][data-state="checked"]',
    );
    return;
  }

  if (scenario === "issue-files") {
    const files = await waitForSelector("[data-issue-files]");
    [
      ...files.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'),
    ][1].click();
    await waitForSelector(
      '[data-issue-files] [role="checkbox"][data-state="unchecked"]',
    );
    return;
  }

  const dialog = await waitForSelector('[role="dialog"]');
  const submit = () => {
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  };
  submit();
  await waitForSelector("[data-issue-review]");
  if (scenario === "issue-review") return;

  submit();
  if (scenario === "issue-pending") {
    await waitForSelector("[data-issue-pending]");
    return;
  }
  const settled = await waitForSelector(
    ".rfi-issue-failure, [data-official-pdf-download]",
  );
  if (scenario === "issue-commit") {
    (await waitForSelector("[data-issued-files]")).scrollIntoView({
      block: "center",
      behavior: "instant",
    });
    return;
  }
  settled.scrollIntoView({ block: "center", behavior: "instant" });
}

void runRfiWorkspaceScenario();
