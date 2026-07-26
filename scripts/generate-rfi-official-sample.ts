import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildBaseRfiTemplateDefinition } from "../src/domain/rfis/base-rfi-template";
import type { FrozenRfiRenderPayload } from "../src/domain/rfis/official-issue";
import { RfiPdfArtifactRenderer } from "../src/infrastructure/rendering/rfi-pdf-artifact-renderer";

const definition = buildBaseRfiTemplateDefinition();
const payload: FrozenRfiRenderPayload = {
  schemaVersion: "rfi-official-render.v1",
  rendererVersion: "base-rfi-official-document/v1",
  issuedAt: "2026-07-25T14:30:00.000Z",
  officialDisplayNumber: "RFI-027",
  template: {
    templateVersionId: "sample-base-rfi-v1",
    key: "base-rfi",
    name: "BASE Request for Information",
    versionNumber: 1,
    definitionSha256: createHash("sha256")
      .update(JSON.stringify(definition))
      .digest("hex"),
    definition,
  },
  organization: {
    id: "sample-org",
    name: "BASE Construction",
  },
  project: {
    id: "sample-project",
    projectNumber: "26-014",
    name: "Riverside Community Center",
    status: "active",
    timezone: "America/New_York",
    address: {
      line1: "1450 River Avenue",
      line2: null,
      city: "Jacksonville",
      region: "FL",
      postalCode: "32202",
      country: "US",
    },
  },
  rfi: {
    id: "sample-rfi",
    subject:
      "Coordination of lobby storefront head, structure, and concealed fire protection",
    question:
      "Architectural detail A8.31/5 locates the interior storefront head at elevation 10'-0\" AFF. Structural detail S5.12/3 shows a continuous HSS member at elevation 10'-2\" AFF, while the reflected ceiling plan indicates a 9'-10\" ceiling with concealed sprinkler coverage.\n\nPlease confirm the controlling storefront head elevation and provide the required attachment detail between the aluminum storefront framing and the structural HSS. Please also confirm whether the sprinkler branch line may pass through the resulting 2-inch zone or whether the ceiling and storefront head should be lowered together.\n\nThe requested clarification is needed before storefront release so the glazing package, ceiling framing, and fire-protection layout can be coordinated without field modification.",
    contractorSuggestion:
      "Maintain the structural HSS elevation shown on S5.12/3. Set the storefront head at 9'-10\" AFF, align it with the finished ceiling, and use a slotted clip connection designed by the storefront delegated-design engineer. Route the sprinkler branch line above the HSS and provide flexible drops to the concealed heads.",
    drawingReferences: "A2.21, A8.31/5, A9.12, FP2.21, S5.12/3",
    specificationReferences:
      "08 41 13 Aluminum-Framed Entrances and Storefronts; 21 13 13 Wet-Pipe Sprinkler Systems",
    responsibleParty: {
      projectContactId: "sample-contact-architect",
      contactName: "Morgan Lee, AIA",
      companyName: "Harbor Design Studio",
      email: "morgan.lee@example.test",
    },
    submittedBy: "Jordan Ramirez",
    responseDueDate: "2026-08-01",
  },
  routing: {
    to: [
      {
        projectContactId: "sample-contact-architect",
        contactName: "Morgan Lee, AIA",
        companyName: "Harbor Design Studio",
        email: "morgan.lee@example.test",
      },
      {
        projectContactId: "sample-contact-engineer",
        contactName: "Priya Shah, PE",
        companyName: "Northline Structures",
        email: "priya.shah@example.test",
      },
    ],
    cc: [
      {
        projectContactId: "sample-contact-owner",
        contactName: "Alex Thompson",
        companyName: "City Facilities Department",
        email: "alex.thompson@example.test",
      },
    ],
    deliveryMode: "record_only",
  },
  includedFiles: [
    {
      fileId: "sample-file-1",
      role: "reference_drawing",
      originalFilename: "RFI-027-coordination-markup.pdf",
      mediaType: "application/pdf",
      byteSize: 284331,
      sha256:
        "6e061b517b084838920715f36603754d013a06b57bfaf76e160f24640c8495d2",
    },
    {
      fileId: "sample-file-2",
      role: "supporting_attachment",
      originalFilename: "storefront-vendor-sketch-SK-12.pdf",
      mediaType: "application/pdf",
      byteSize: 198044,
      sha256:
        "a836bff2669312bfdf57d19be9d5287ee40cda0ec02c7fdc230737f6a87f90d8",
    },
  ],
  issuedBy: {
    userId: "sample-user",
    displayName: "Jordan Ramirez",
  },
};

async function main(): Promise<void> {
  const renderer = new RfiPdfArtifactRenderer();
  const artifact = await renderer.render(payload);
  const outputDirectory = resolve("output/pdf");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "base-rfi-official-sample.pdf"),
    new Uint8Array(artifact.bytes),
  );
}

void main();
