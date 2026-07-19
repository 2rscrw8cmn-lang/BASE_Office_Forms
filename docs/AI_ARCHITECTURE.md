# AI Architecture

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19


## 1. Purpose

AI is a core product capability, but it is not the record authority.

AI reduces repetitive document work while the deterministic application controls official actions.

## 2. Principles

- Structured input and output
- Human review before mutation
- Least-data access
- Project and tenant isolation
- Traceable source references
- Model/provider abstraction
- Repeatable evaluation
- No hidden autonomous issuance

## 3. Initial use cases

### 3.1 Template creation

Input:

- uploaded blank form
- existing PDF
- written description
- example definition JSON

Output:

- proposed definition JSON
- proposed field bindings
- validation warnings
- preview

### 3.2 Draft RFI

Input:

- field note
- email text
- superintendent note
- selected drawing references
- project context

Output:

- subject
- question
- contractor suggestion
- references
- proposed due date
- impact questions

### 3.3 Submittal metadata extraction

Input:

- vendor PDF package
- selected project
- optional cost code/specification section

Output:

- specification section
- description
- manufacturer
- product
- revision/date
- suggested vendor
- source-file classification

### 3.4 Revision comparison

Input:

- prior submittal revision
- new submittal revision

Output:

- changed pages
- changed products/values
- removed items
- unresolved prior comments
- concise review summary

### 3.5 Review-comment summary

Input:

- returned marked-up PDF
- review disposition

Output:

- structured comments
- action items
- responsible party suggestions
- resubmission checklist

### 3.6 Definition repair

Input:

- invalid or incomplete definition JSON
- renderer validation errors

Output:

- proposed corrected definition
- change list
- unresolved warnings

## 4. Prohibited autonomous actions

AI may not:

- assign or reserve official sequence numbers
- issue an RFI
- submit a submittal
- select final approval disposition
- close, void, or reopen a record
- publish a template
- publish a controlled document
- delete files or records
- change permissions
- create unrestricted external shares
- send a delivery without an explicit user action
- overwrite a user-approved revision

## 5. AI job model

AI work is asynchronous from the UI perspective but represented as a normal persisted job.

Job states:

```text
queued → processing → proposed → applied
                    ↘ failed
                    ↘ cancelled
```

Each job stores:

- organization
- requesting user
- project/record scope
- capability
- model/provider
- prompt version
- input references
- output JSON
- validation result
- token/cost metadata
- timestamps
- applied-by user
- resulting object/version

## 6. Request pipeline

1. User chooses a defined AI action.
2. Application resolves permitted context.
3. Files are converted/extracted through a controlled pipeline.
4. Prompt builder creates a versioned structured request.
5. Provider adapter submits the request.
6. Output is parsed against JSON Schema.
7. Deterministic validators run.
8. UI displays proposed changes and source references.
9. User accepts selected fields.
10. Standard API applies the patch with normal permission and workflow checks.
11. Activity event records AI assistance.

## 7. Provider abstraction

Application code calls a provider-neutral interface:

```text
generateStructured(capability, schema, context)
```

The adapter owns:

- provider request format
- model selection
- retries
- timeout
- usage accounting
- safety settings
- response normalization

Do not embed provider-specific payloads in domain services.

## 8. Prompt versioning

Every capability has:

- capability key
- prompt version
- output schema version
- allowed context types
- evaluation set
- minimum confidence rules

A prompt change is deployed like code and evaluated before production use.

## 9. Source grounding

AI outputs should include source references where possible:

- file ID
- page number
- quoted field label
- drawing number
- prior comment ID

The interface must distinguish:

- extracted fact
- AI inference
- user-provided context
- generated recommendation

## 10. Data handling

- Only organization-authorized files enter a job.
- Temporary extracted text follows retention policy.
- External-share users do not receive AI access initially.
- Sensitive project data is not used for model training unless an organization explicitly opts in under a future policy.
- Prompts and outputs are access-controlled and redacted from general logs.
- Files remain in the organization's storage boundary.

## 11. Confidence and validation

AI confidence never substitutes for validation.

Examples:

- Specification section must match allowed format.
- Proposed project must equal the selected project.
- Record number is ignored if supplied by AI.
- Dates are normalized and checked.
- Extracted vendor is matched against the organization directory or marked new.
- Definition JSON must pass the render schema.

## 12. UI rules

AI actions are task-specific buttons, not a floating general chatbot as the first implementation.

Examples:

- Draft RFI
- Extract Submittal
- Compare Revisions
- Summarize Review
- Build Template
- Repair Definition

Proposal UI shows:

- before/after
- source
- confidence/warning
- accept/reject per field
- final preview

## 13. Evaluation

Maintain private test sets for:

- RFI notes to structured draft
- submittal cover extraction
- revision comparison
- returned review comment extraction
- template generation
- invalid definition repair

Measure:

- schema-valid output rate
- field precision
- field recall
- false project/vendor association
- unsupported claim rate
- user acceptance/edit rate
- time saved
- cost per successful job

A model upgrade requires evaluation against the same set.

## 14. Rollout stages

### Stage A — JSON assistance

Keep current copy/paste JSON workflow and add stronger schema validation.

### Stage B — Native template and RFI drafting

Task-specific API calls with user review.

### Stage C — File extraction and submittal assistance

PDF extraction, metadata suggestions, and review summaries.

### Stage D — Revision intelligence

Page-level comparison and unresolved-comment tracking.

### Stage E — Project intelligence

Cross-record summaries, overdue risk, and suggested next actions.

Project intelligence remains advisory.
