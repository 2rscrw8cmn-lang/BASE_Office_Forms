/*
 * The UI Lab catalog: the single source of the component/state matrix rendered
 * by both the UI Lab (src/ui/lab/UiLab.tsx) and the visual/markup tests
 * (tests/unit/ui-lab-catalog.test.tsx). Every example here instantiates a REAL
 * production component from the library barrel — the lab never duplicates demo
 * markup. Adding a component or a state means adding it here so the lab and the
 * tests stay in lockstep.
 */

import { useState, type ReactNode } from "react";
import {
  ActivityFeed,
  AlertDialog,
  AttentionBadge,
  Badge,
  Breadcrumbs,
  Button,
  Checkbox,
  Collapsible,
  CommandMenu,
  DateInput,
  Dialog,
  Divider,
  DropdownMenu,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FileRow,
  FilterChip,
  FormDialog,
  HelpText,
  Icon,
  IconButton,
  Label,
  MetadataStrip,
  PageHeader,
  Panel,
  PermissionState,
  Popover,
  ProjectHeader,
  ProjectTabs,
  RadioGroup,
  RecordStatusBadge,
  RegisterToolbar,
  RevisionStatusBadge,
  RfiStatusBadge,
  SaveIndicator,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  TextArea,
  TextInput,
  Tooltip,
  ValidationMessage,
  WorkspaceSection,
  useToast,
} from "../components";

/** The required UI Lab states (UI_IMPLEMENTATION_PLAYBOOK §6 "UI Lab"). */
export const LAB_STATES = [
  "default",
  "hover",
  "focus",
  "selected",
  "disabled",
  "loading",
  "error",
  "long-text",
  "empty",
] as const;

export type LabState = (typeof LAB_STATES)[number];

export type LabGroup = "primitive" | "interactive" | "pattern";

export interface LabExample {
  state: LabState;
  render: () => ReactNode;
  /** Optional note (e.g. hover/focus are demonstrated live). */
  note?: string;
}

export interface LabEntry {
  id: string;
  name: string;
  group: LabGroup;
  description: string;
  examples: LabExample[];
}

const LONG_TEXT =
  "Request for information regarding the coordination of the mechanical, electrical, and plumbing rough-in above the level 3 corridor ceiling where the structural beam depth conflicts with the specified duct routing shown on the contract documents";

function ToastDemo() {
  const { toast } = useToast();
  return (
    <Button
      onClick={() => {
        toast({
          title: "Draft saved",
          description: "RFI-014 saved as draft.",
          tone: "success",
        });
      }}
    >
      Raise toast
    </Button>
  );
}

function DialogDemo() {
  return (
    <Dialog
      trigger={<Button>Open dialog</Button>}
      title="Edit responsible party"
      description="Update who is accountable for this RFI."
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button variant="primary">Save</Button>
        </>
      }
    >
      <Field label="Responsible party">
        <Select>
          <option>Structural Engineer of Record</option>
          <option>Mechanical Contractor</option>
        </Select>
      </Field>
    </Dialog>
  );
}

function AlertDialogDemo() {
  return (
    <AlertDialog
      trigger={<Button variant="danger">Void RFI</Button>}
      title="Void this RFI?"
      description="Voiding is permanent and the assigned number is never reused."
      confirmLabel="Void RFI"
      destructive
    />
  );
}

function FormDialogDemo() {
  return (
    <FormDialog
      trigger={
        <Button variant="primary" iconStart="plus">
          Add RFI
        </Button>
      }
      title="Add RFI"
      description="Drafts do not consume an official number."
      onSubmit={(event) => {
        event.preventDefault();
      }}
      submitLabel="Create draft"
    >
      <Field label="Subject" required>
        <TextInput placeholder="Short subject" />
      </Field>
      <Field label="Question" help="Describe the information requested.">
        <TextArea placeholder="What do you need answered?" />
      </Field>
    </FormDialog>
  );
}

function DrawerDemo({
  side = "left",
  size = "navigation",
}: {
  side?: "left" | "right";
  size?: "navigation" | "detail";
}) {
  return (
    <Drawer
      trigger={
        <Button iconStart={side === "left" ? "menu" : "pencil"}>
          {size === "detail" ? "Open detail Drawer" : "Open menu"}
        </Button>
      }
      title={size === "detail" ? "Edit draft" : "Navigation"}
      side={side}
      size={size}
    >
      {size === "navigation" ? (
        <nav>
          <p>Dashboard</p>
          <p>Projects</p>
          <p>Records</p>
        </nav>
      ) : (
        <Field label="Subject">
          <TextInput value="Lobby ceiling conflict" readOnly />
        </Field>
      )}
    </Drawer>
  );
}

function PopoverDemo() {
  return (
    <Popover trigger={<Button iconStart="filter">Filters</Button>}>
      <Field label="Status">
        <Select>
          <option>Open</option>
          <option>Closed</option>
        </Select>
      </Field>
    </Popover>
  );
}

function CommandMenuDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open command menu
      </Button>
      <CommandMenu
        open={open}
        onOpenChange={setOpen}
        items={[
          {
            id: "new-rfi",
            label: "New RFI",
            icon: "plus",
            onSelect: () => undefined,
          },
          {
            id: "records",
            label: "Go to Records",
            icon: "file-text",
            onSelect: () => undefined,
          },
          {
            id: "settings",
            label: "Open settings",
            icon: "settings",
            onSelect: () => undefined,
          },
        ]}
      />
    </>
  );
}

/** The full catalog. Grouped by primitive / interactive / pattern. */
export const CATALOG: LabEntry[] = [
  {
    id: "button",
    name: "Button",
    group: "primitive",
    description: "Primary, secondary, ghost, danger, and official actions.",
    examples: [
      {
        state: "default",
        render: () => <Button variant="primary">Primary</Button>,
      },
      {
        state: "hover",
        note: "Hover the control to see the state.",
        render: () => <Button variant="primary">Hover me</Button>,
      },
      {
        state: "focus",
        note: "Tab to the control to see the focus ring.",
        render: () => <Button variant="secondary">Focus me</Button>,
      },
      {
        state: "disabled",
        render: () => (
          <Button variant="primary" disabled>
            Disabled
          </Button>
        ),
      },
      {
        state: "loading",
        render: () => (
          <Button variant="primary" loading>
            Saving
          </Button>
        ),
      },
      {
        state: "long-text",
        render: () => (
          <Button variant="official">
            Issue this RFI to the design team for response
          </Button>
        ),
      },
    ],
  },
  {
    id: "icon-button",
    name: "IconButton",
    group: "primitive",
    description: "Icon-only control with a required accessible name.",
    examples: [
      {
        state: "default",
        render: () => <IconButton icon="pencil" label="Edit" />,
      },
      {
        state: "disabled",
        render: () => (
          <IconButton icon="trash" label="Delete" variant="danger" disabled />
        ),
      },
      {
        state: "loading",
        render: () => <IconButton icon="download" label="Download" loading />,
      },
    ],
  },
  {
    id: "text-input",
    name: "TextInput",
    group: "primitive",
    description: "Single-line text control with Field wiring.",
    examples: [
      {
        state: "default",
        render: () => (
          <Field label="Subject">
            <TextInput placeholder="Short subject" />
          </Field>
        ),
      },
      {
        state: "disabled",
        render: () => (
          <Field label="Subject">
            <TextInput value="Read only" disabled readOnly />
          </Field>
        ),
      },
      {
        state: "error",
        render: () => (
          <Field label="Subject" required error="Subject is required.">
            <TextInput />
          </Field>
        ),
      },
      {
        state: "long-text",
        render: () => (
          <Field label="Subject">
            <TextInput value={LONG_TEXT} readOnly />
          </Field>
        ),
      },
    ],
  },
  {
    id: "textarea",
    name: "TextArea",
    group: "primitive",
    description: "Multi-line text control.",
    examples: [
      {
        state: "default",
        render: () => (
          <Field label="Question">
            <TextArea placeholder="What do you need answered?" />
          </Field>
        ),
      },
      {
        state: "long-text",
        render: () => (
          <Field label="Question">
            <TextArea value={LONG_TEXT} readOnly rows={4} />
          </Field>
        ),
      },
    ],
  },
  {
    id: "select",
    name: "Select",
    group: "primitive",
    description: "Native single-select for short option lists.",
    examples: [
      {
        state: "default",
        render: () => (
          <Field label="Status">
            <Select>
              <option>Open</option>
              <option>Closed</option>
            </Select>
          </Field>
        ),
      },
      {
        state: "disabled",
        render: () => (
          <Field label="Status">
            <Select disabled>
              <option>Open</option>
            </Select>
          </Field>
        ),
      },
    ],
  },
  {
    id: "date-input",
    name: "DateInput",
    group: "primitive",
    description: "Native date control.",
    examples: [
      {
        state: "default",
        render: () => (
          <Field label="Due date">
            <DateInput />
          </Field>
        ),
      },
    ],
  },
  {
    id: "checkbox",
    name: "Checkbox",
    group: "primitive",
    description: "Radix-backed checkbox.",
    examples: [
      { state: "default", render: () => <Checkbox>Include archived</Checkbox> },
      {
        state: "selected",
        render: () => <Checkbox defaultChecked>Selected</Checkbox>,
      },
      {
        state: "disabled",
        render: () => <Checkbox disabled>Disabled</Checkbox>,
      },
    ],
  },
  {
    id: "radio-group",
    name: "RadioGroup",
    group: "primitive",
    description: "Radix-backed radio group with arrow-key selection.",
    examples: [
      {
        state: "default",
        render: () => (
          <RadioGroup
            label="Discipline"
            options={[
              { value: "arch", label: "Architectural" },
              { value: "struct", label: "Structural" },
              { value: "mep", label: "MEP" },
            ]}
          />
        ),
      },
      {
        state: "selected",
        render: () => (
          <RadioGroup
            label="Discipline"
            defaultValue="struct"
            options={[
              { value: "arch", label: "Architectural" },
              { value: "struct", label: "Structural" },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "field",
    name: "Field / Label / HelpText / ValidationMessage",
    group: "primitive",
    description: "Field group and standalone label/help/validation parts.",
    examples: [
      {
        state: "default",
        render: () => (
          <Field label="Subject" help="Keep it short and specific.">
            <TextInput />
          </Field>
        ),
      },
      {
        state: "error",
        render: () => (
          <div>
            <Label required>Subject</Label>
            <TextInput invalid />
            <ValidationMessage>Subject is required.</ValidationMessage>
            <HelpText>Standalone parts compose the same look.</HelpText>
          </div>
        ),
      },
    ],
  },
  {
    id: "badge",
    name: "Badge",
    group: "primitive",
    description: "Compact tone chips.",
    examples: [
      {
        state: "default",
        render: () => (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="success">Issued</Badge>
            <Badge tone="warning">Due soon</Badge>
            <Badge tone="danger">Overdue</Badge>
            <Badge tone="info">Open</Badge>
            <Badge tone="accent" mono>
              RFI-014
            </Badge>
          </div>
        ),
      },
    ],
  },
  {
    id: "status-badge",
    name: "RfiStatusBadge / RecordStatusBadge / RevisionStatusBadge / AttentionBadge",
    group: "primitive",
    description:
      "Domain-typed status vocabularies (one map per authoritative domain status enum) plus the calculated due/overdue attention condition — never a feature-invented status list.",
    examples: [
      {
        state: "default",
        render: () => (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <RfiStatusBadge status="draft" />
            <RfiStatusBadge status="ready_to_issue" />
            <RfiStatusBadge status="open" />
            <RfiStatusBadge status="response_received" />
            <RfiStatusBadge status="returned_for_clarification" />
            <RfiStatusBadge status="closed" />
            <RfiStatusBadge status="void" />
            <RecordStatusBadge status="active" />
            <RecordStatusBadge status="archived" />
            <RevisionStatusBadge status="draft" />
            <RevisionStatusBadge status="published" />
            <RevisionStatusBadge status="superseded" />
            <AttentionBadge condition="due_soon" />
            <AttentionBadge condition="overdue" />
          </div>
        ),
      },
    ],
  },
  {
    id: "tooltip",
    name: "Tooltip",
    group: "primitive",
    description: "Hover/focus tooltip that supplements accessible names.",
    examples: [
      {
        state: "default",
        note: "Hover or focus the trigger.",
        render: () => (
          <Tooltip content="Drafts do not consume a number">
            <Button variant="ghost">Why disabled?</Button>
          </Tooltip>
        ),
      },
    ],
  },
  {
    id: "divider",
    name: "Divider",
    group: "primitive",
    description: "Quiet structural divider.",
    examples: [
      {
        state: "default",
        render: () => (
          <div>
            <p>Above</p>
            <Divider />
            <p>Below</p>
          </div>
        ),
      },
    ],
  },
  {
    id: "spinner",
    name: "Spinner",
    group: "primitive",
    description: "Indeterminate loading indicator.",
    examples: [{ state: "loading", render: () => <Spinner label="Loading" /> }],
  },
  {
    id: "skeleton",
    name: "Skeleton",
    group: "primitive",
    description: "Content placeholder for loading states.",
    examples: [{ state: "loading", render: () => <Skeleton lines={3} /> }],
  },
  {
    id: "dialog",
    name: "Dialog",
    group: "interactive",
    description: "Modal dialog with focus trap and Escape.",
    examples: [{ state: "default", render: () => <DialogDemo /> }],
  },
  {
    id: "alert-dialog",
    name: "AlertDialog",
    group: "interactive",
    description: "Destructive confirmation dialog.",
    examples: [{ state: "default", render: () => <AlertDialogDemo /> }],
  },
  {
    id: "form-dialog",
    name: "FormDialog",
    group: "interactive",
    description: "Create/edit form dialog with error summary and loading.",
    examples: [{ state: "default", render: () => <FormDialogDemo /> }],
  },
  {
    id: "dropdown-menu",
    name: "DropdownMenu",
    group: "interactive",
    description: "Keyboard-navigable overflow/action menu.",
    examples: [
      {
        state: "default",
        render: () => (
          <DropdownMenu
            trigger={<IconButton icon="more" label="RFI actions" />}
            items={[
              {
                id: "edit",
                label: "Edit",
                icon: "pencil",
                onSelect: () => undefined,
              },
              {
                id: "download",
                label: "Download log",
                icon: "download",
                onSelect: () => undefined,
              },
              {
                id: "void",
                label: "Void",
                icon: "trash",
                destructive: true,
                separatorBefore: true,
                onSelect: () => undefined,
              },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "popover",
    name: "Popover",
    group: "interactive",
    description: "Non-modal overlay panel.",
    examples: [{ state: "default", render: () => <PopoverDemo /> }],
  },
  {
    id: "tabs",
    name: "Tabs",
    group: "interactive",
    description: "Tabbed panels with roving focus.",
    examples: [
      {
        state: "default",
        render: () => (
          <Tabs
            label="RFI detail"
            items={[
              {
                value: "details",
                label: "Details",
                content: <p>Details content</p>,
              },
              {
                value: "preview",
                label: "Preview",
                content: <p>Preview content</p>,
              },
            ]}
          />
        ),
      },
      {
        state: "disabled",
        render: () => (
          <Tabs
            label="RFI detail"
            items={[
              { value: "details", label: "Details", content: <p>Details</p> },
              {
                value: "history",
                label: "History",
                content: <p>History</p>,
                disabled: true,
              },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "collapsible",
    name: "Collapsible",
    group: "interactive",
    description: "Progressive-disclosure section.",
    examples: [
      {
        state: "default",
        render: () => (
          <Collapsible title="Advanced options" meta="3 settings">
            <p>Hidden until expanded.</p>
          </Collapsible>
        ),
      },
    ],
  },
  {
    id: "command-menu",
    name: "CommandMenu",
    group: "interactive",
    description: "Filterable, arrow-navigable command palette.",
    examples: [{ state: "default", render: () => <CommandMenuDemo /> }],
  },
  {
    id: "drawer",
    name: "Drawer",
    group: "interactive",
    description: "Slide-in panel (mobile navigation, side sheets).",
    examples: [
      { state: "default", render: () => <DrawerDemo /> },
      {
        state: "selected",
        render: () => <DrawerDemo side="right" size="detail" />,
      },
    ],
  },
  {
    id: "toast",
    name: "Toast",
    group: "interactive",
    description: "Live-region notifications.",
    examples: [{ state: "default", render: () => <ToastDemo /> }],
  },
  {
    id: "page-header",
    name: "PageHeader",
    group: "pattern",
    description: "The single page header with one primary action.",
    examples: [
      {
        state: "default",
        render: () => (
          <PageHeader
            eyebrow="RFIs"
            title="Request for Information"
            supporting="14 open · 3 overdue"
            primaryAction={
              <Button variant="primary" iconStart="plus">
                Add RFI
              </Button>
            }
          />
        ),
      },
      {
        state: "long-text",
        render: () => (
          <PageHeader
            title="Coordination requests for the level 3 mechanical corridor rough-in package"
            supporting={LONG_TEXT}
            primaryAction={<Button variant="primary">Add</Button>}
          />
        ),
      },
    ],
  },
  {
    id: "project-header",
    name: "ProjectHeader",
    group: "pattern",
    description: "Compact project identity bar.",
    examples: [
      {
        state: "default",
        render: () => (
          <ProjectHeader
            projectNumber="OHPA-2024"
            projectName="OHPA Conway"
            facts={
              <>
                <RfiStatusBadge status="open" /> <span>Conway, AR</span>
              </>
            }
          />
        ),
      },
    ],
  },
  {
    id: "project-tabs",
    name: "ProjectTabs",
    group: "pattern",
    description: "Router-owned project navigation tabs.",
    examples: [
      {
        state: "selected",
        render: () => (
          <ProjectTabs
            activeId="rfis"
            tabs={[
              { id: "overview", label: "Overview", href: "#" },
              { id: "records", label: "Records", href: "#" },
              { id: "rfis", label: "RFIs", href: "#" },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "register-toolbar",
    name: "RegisterToolbar",
    group: "pattern",
    description: "Search, filters, chips, and result count.",
    examples: [
      {
        state: "default",
        render: () => (
          <RegisterToolbar
            searchValue=""
            onSearchChange={() => undefined}
            searchLabel="Search RFIs"
            filters={
              <Select size="compact">
                <option>All statuses</option>
                <option>Open</option>
              </Select>
            }
            mobileFilterDisclosure={{ activeCount: 1, label: "filters" }}
            chips={
              <FilterChip
                label="Status"
                value="Open"
                onRemove={() => undefined}
              />
            }
            resultCount="14 results"
          />
        ),
      },
    ],
  },
  {
    id: "panel",
    name: "Panel",
    group: "pattern",
    description: "Surface container for grouped content.",
    examples: [
      {
        state: "default",
        render: () => (
          <Panel
            title="Question"
            actions={<IconButton icon="pencil" label="Edit question" />}
          >
            <p>How should the duct be routed around the beam?</p>
          </Panel>
        ),
      },
    ],
  },
  {
    id: "metadata-strip",
    name: "MetadataStrip",
    group: "pattern",
    description: "Authoritative workspace facts.",
    examples: [
      {
        state: "default",
        render: () => (
          <MetadataStrip
            items={[
              { label: "Number", value: "RFI-014", mono: true },
              { label: "Status", value: <RfiStatusBadge status="open" /> },
              { label: "Due", value: "2026-08-01", mono: true },
              { label: "Party", value: "Structural EOR" },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "file-row",
    name: "FileRow",
    group: "pattern",
    description: "File entry with role and processing state.",
    examples: [
      {
        state: "default",
        render: () => (
          <FileRow
            name="beam-conflict-markup.pdf"
            role="Supporting"
            meta="PDF · 1.2 MB"
            state="ready"
            actions={
              <IconButton icon="download" label="Download" variant="ghost" />
            }
          />
        ),
      },
      {
        state: "error",
        render: () => (
          <FileRow
            name="scan-pending.pdf"
            role="Response"
            meta="PDF · 3.4 MB"
            state="failed"
          />
        ),
      },
    ],
  },
  {
    id: "activity-feed",
    name: "ActivityFeed",
    group: "pattern",
    description: "Secondary history/activity context.",
    examples: [
      {
        state: "default",
        render: () => (
          <ActivityFeed
            items={[
              {
                id: "1",
                summary: "Draft created",
                actor: "J. Rivera",
                timestamp: "Jul 20",
              },
              {
                id: "2",
                summary: "Marked ready to issue",
                actor: "J. Rivera",
                timestamp: "Jul 21",
              },
            ]}
          />
        ),
      },
      { state: "empty", render: () => <ActivityFeed items={[]} /> },
    ],
  },
  {
    id: "workspace-section",
    name: "WorkspaceSection",
    group: "pattern",
    description: "Titled workspace section (primary and secondary).",
    examples: [
      {
        state: "default",
        render: () => (
          <WorkspaceSection
            title="Response"
            description="Separated from the question."
          >
            <p>Route the duct below the beam per detail 5/S-301.</p>
          </WorkspaceSection>
        ),
      },
    ],
  },
  {
    id: "breadcrumbs",
    name: "Breadcrumbs",
    group: "pattern",
    description: "Workspace breadcrumb trail.",
    examples: [
      {
        state: "default",
        render: () => (
          <Breadcrumbs
            items={[
              { label: "OHPA Conway", href: "#" },
              { label: "RFIs", href: "#" },
              { label: "RFI-014" },
            ]}
          />
        ),
      },
    ],
  },
  {
    id: "empty-state",
    name: "EmptyState",
    group: "pattern",
    description: "First-use and filtered empty states.",
    examples: [
      {
        state: "empty",
        render: () => (
          <EmptyState
            title="No RFIs yet"
            description="Create the first RFI to get started."
            action={
              <Button variant="primary" iconStart="plus">
                Add RFI
              </Button>
            }
          />
        ),
      },
      {
        state: "default",
        render: () => (
          <EmptyState
            variant="filtered"
            title="No matching RFIs"
            description="No RFIs match the current filters."
          />
        ),
      },
    ],
  },
  {
    id: "error-state",
    name: "ErrorState",
    group: "pattern",
    description: "Request failure with retry.",
    examples: [
      {
        state: "error",
        render: () => (
          <ErrorState requestId="req_8f21c" onRetry={() => undefined} />
        ),
      },
    ],
  },
  {
    id: "permission-state",
    name: "PermissionState",
    group: "pattern",
    description: "Permission-limited state.",
    examples: [{ state: "default", render: () => <PermissionState /> }],
  },
  {
    id: "save-indicator",
    name: "SaveIndicator",
    group: "pattern",
    description: "Saving / Saved / Failed / Conflict states.",
    examples: [
      {
        state: "loading",
        render: () => <SaveIndicator state="saving" />,
      },
      {
        state: "default",
        render: () => <SaveIndicator state="saved" />,
      },
      {
        state: "error",
        render: () => (
          <SaveIndicator state="failed" onResolve={() => undefined} />
        ),
      },
      {
        state: "selected",
        render: () => (
          <SaveIndicator state="conflict" onResolve={() => undefined} />
        ),
      },
    ],
  },
];

/** Every state key exercised anywhere in the catalog. */
export function coveredStates(): Set<LabState> {
  const set = new Set<LabState>();
  for (const entry of CATALOG) {
    for (const example of entry.examples) {
      set.add(example.state);
    }
  }
  return set;
}

/** Decorative icon sample used by the lab overview. */
export function IconSample() {
  return <Icon name="dashboard" size={18} title="Dashboard" />;
}
