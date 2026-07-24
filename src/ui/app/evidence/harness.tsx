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
import { MemoryRouter } from "react-router-dom";
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
  await waitForSelector('[data-subject-edit][data-id="rfi-1"]');
  document
    .querySelector<HTMLButtonElement>('[data-subject-edit][data-id="rfi-1"]')
    ?.click();
  await waitForSelector(
    '[data-field-input][data-id="rfi-1"][data-field="subject"]',
  );

  if (rfiScenario === "editor-open") return;

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
