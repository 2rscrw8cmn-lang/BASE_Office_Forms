// Deterministic RFI register fixtures used by the Tabulator spike for the
// custom-vs-Tabulator performance comparison. The shapes mirror the
// GET /projects/:projectId/rfis read model rows the register renders, so the
// same dataset drives both implementations for a fair measurement.

export interface FixtureRfi {
  id: string;
  projectId: string;
  rfiNumber: string | null;
  status: string;
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsiblePartyId: string | null;
  responsibleParty: string | null;
  responsiblePartyLegacyText: string | null;
  requestedResponseDate: string | null;
  issuedAt: string | null;
  updatedAt: string;
  createdAt: string;
  lockVersion: number;
  latestResponse: string | null;
  legacyReference: string | null;
  attachmentCount: number;
  isOverdue: boolean;
  dueSoon: boolean;
  issuanceReconciliationState: string;
  capabilities: { updateDraft: boolean };
}

export const FIXTURE_SIZES = [0, 1, 50, 500, 2000] as const;

const STATUSES = [
  "draft",
  "open",
  "response_received",
  "returned_for_clarification",
  "closed",
] as const;

const CONTACTS = [
  { id: "contact-1", name: "Alex Architect", companyName: "Design Co" },
  { id: "contact-2", name: "Bailey Builder", companyName: "GC LLC" },
  { id: "contact-3", name: "Casey Consultant", companyName: "MEP Group" },
];

export function fixtureContacts(): typeof CONTACTS {
  return CONTACTS;
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}

// Builds `count` deterministic rows. Roughly one third are editable drafts
// (blank RFI number, updateDraft true) and the remainder are locked, issued
// rows — matching the register's mix of live drafts and read-only history.
export function makeRfiDataset(count: number): FixtureRfi[] {
  const rows: FixtureRfi[] = [];
  for (let index = 0; index < count; index += 1) {
    const isDraft = index % 3 === 0;
    const status = isDraft ? "draft" : STATUSES[index % STATUSES.length];
    const contact = CONTACTS[index % CONTACTS.length];
    const day = pad((index % 27) + 1, 2);
    const month = pad((index % 12) + 1, 2);
    rows.push({
      id: `rfi-${pad(index, 5)}`,
      projectId: "project-1",
      rfiNumber: isDraft ? null : `RFI-${pad(index, 4)}`,
      status,
      subject: `RFI ${String(index)}: coordination of assembly ${String(index % 40)}`,
      question: `Confirm the intended detail for grid line ${String(index % 30)} where the ${status} condition affects the adjacent scope and downstream trades.`,
      contractorSuggestion:
        index % 4 === 0
          ? null
          : `Proposed approach ${String(index % 12)} pending engineer confirmation.`,
      drawingReferences: `A-${pad((index % 900) + 100, 3)}`,
      specificationReferences: `${pad((index % 30) + 1, 2)} ${pad(index % 100, 2)} ${pad(index % 100, 2)}`,
      responsiblePartyId: contact.id,
      responsibleParty: contact.name,
      responsiblePartyLegacyText: null,
      requestedResponseDate: `2026-${month}-${day}`,
      issuedAt: isDraft ? null : `2026-${month}-${day}T12:00:00Z`,
      updatedAt: `2026-${month}-${day}T13:00:00Z`,
      createdAt: `2026-${month}-${day}T09:00:00Z`,
      lockVersion: 1,
      latestResponse:
        status === "response_received"
          ? `Resolved per response ${String(index)}.`
          : null,
      legacyReference: index % 7 === 0 ? `OLD-${String(index)}` : null,
      attachmentCount: index % 5,
      isOverdue: !isDraft && index % 6 === 0,
      dueSoon: isDraft && index % 5 === 0,
      issuanceReconciliationState: isDraft ? "not_issued" : "reconciled",
      capabilities: { updateDraft: isDraft },
    });
  }
  return rows;
}
