import { describe, expect, it, vi } from "vitest";

import { D1DashboardReadRepository } from "../../src/infrastructure/db/d1/dashboard-read-repository";

// A minimal D1Database stand-in that records how work is dispatched. The point
// of these tests is the *shape* of the dispatch: the dashboard must run its
// eight reads through a single `batch()` and must never execute an individual
// statement (`first()`/`all()`/`run()`) that would open its own connection.

interface RecordedStatement {
  sql: string;
  bindings: unknown[];
  first: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

function resultFor(sql: string): D1Result {
  const normalized = sql.replace(/\s+/g, " ");
  const result = (results: unknown[]): D1Result =>
    ({ results, success: true, meta: {} }) as unknown as D1Result;

  if (normalized.includes("COUNT(*) AS n FROM ( SELECT rev.id")) {
    return result([{ n: 2 }]); // ready-to-issue count
  }
  if (normalized.includes("COUNT(*) AS n FROM record_revisions")) {
    return result([{ n: 3 }]); // draft revision count
  }
  if (normalized.includes("COUNT(*) AS n FROM rfi_records")) {
    return result([{ n: 4 }]); // active RFI count
  }
  if (normalized.includes("COUNT(f.id) AS file_count")) {
    return result([
      {
        revision_id: "rev-ready",
        revision_number: 1,
        revision_label: null,
        title: "Ready",
        record_id: "rec-1",
        record_number: "R-1",
        record_title: "Record 1",
        project_id: "proj-1",
        project_number: "P-001",
        project_name: "Project One",
        created_at: "2026-07-04T00:00:00Z",
        file_count: 2,
      },
    ]);
  }
  if (normalized.includes("rev.status = 'draft'")) {
    return result([
      {
        revision_id: "rev-draft",
        revision_number: 2,
        revision_label: null,
        title: "Draft",
        record_id: "rec-1",
        record_number: "R-1",
        record_title: "Record 1",
        project_id: "proj-1",
        project_number: "P-001",
        project_name: "Project One",
        created_at: "2026-07-05T00:00:00Z",
      },
    ]);
  }
  if (normalized.includes("FROM rfi_records r")) {
    return result([
      {
        rfi_id: "rfi-1",
        rfi_number: "RFI-1",
        title: "Question",
        status: "issued",
        due_date: "2026-07-25",
        project_id: "proj-1",
        project_number: "P-001",
        project_name: "Project One",
        created_at: "2026-07-10T00:00:00Z",
      },
    ]);
  }
  if (normalized.includes("FROM revision_files f")) {
    return result([
      {
        file_id: "file-1",
        original_filename: "plan.pdf",
        uploaded_at: "2026-07-20T00:00:00Z",
        revision_id: "rev-ready",
        revision_number: 1,
        record_id: "rec-1",
        record_title: "Record 1",
        project_id: "proj-1",
        project_number: "P-001",
        project_name: "Project One",
      },
    ]);
  }
  if (normalized.includes("FROM issuances i")) {
    return result([
      {
        issuance_id: "iss-1",
        issue_number: "ISS-1",
        purpose: "for_construction",
        issued_at: "2026-07-21T00:00:00Z",
        issued_by_name: "Dana Lee",
        record_id: "rec-1",
        record_title: "Record 1",
        revision_id: "rev-ready",
        project_id: "proj-1",
        project_number: "P-001",
        project_name: "Project One",
        file_count: 2,
      },
    ]);
  }
  return result([]);
}

function createMockDatabase() {
  const prepared: RecordedStatement[] = [];
  const batchCalls: RecordedStatement[][] = [];

  const database = {
    prepare(sql: string): D1PreparedStatement {
      const statement: RecordedStatement = {
        sql,
        bindings: [],
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      const api = {
        bind(...bindings: unknown[]) {
          statement.bindings = bindings;
          return api;
        },
        first: statement.first,
        all: statement.all,
        run: statement.run,
        __statement: statement,
      };
      prepared.push(statement);
      return api as unknown as D1PreparedStatement;
    },
    batch: vi.fn((statements: D1PreparedStatement[]) => {
      const recorded = statements.map(
        (s) => (s as unknown as { __statement: RecordedStatement }).__statement,
      );
      batchCalls.push(recorded);
      return Promise.resolve(recorded.map((s) => resultFor(s.sql)));
    }),
  };

  return { database, prepared, batchCalls };
}

describe("D1DashboardReadRepository batching", () => {
  it("dispatches all eight reads through a single batch() call", async () => {
    const { database, prepared, batchCalls } = createMockDatabase();
    const repository = new D1DashboardReadRepository(
      database as unknown as D1Database,
    );

    await repository.load("org-1", ["proj-1", "proj-2"]);

    expect(database.batch).toHaveBeenCalledTimes(1);
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(8);
    // Every prepared statement went into the batch; none was executed on its
    // own connection.
    expect(prepared).toHaveLength(8);
    for (const statement of prepared) {
      expect(statement.first).not.toHaveBeenCalled();
      expect(statement.all).not.toHaveBeenCalled();
      expect(statement.run).not.toHaveBeenCalled();
    }
  });

  it("never launches eight independent concurrent statements", async () => {
    const { database, prepared } = createMockDatabase();
    const repository = new D1DashboardReadRepository(
      database as unknown as D1Database,
    );

    await repository.load("org-1", ["proj-1"]);

    const independentExecutions = prepared.reduce(
      (total, statement) =>
        total +
        statement.first.mock.calls.length +
        statement.all.mock.calls.length +
        statement.run.mock.calls.length,
      0,
    );
    expect(independentExecutions).toBe(0);
  });

  it("maps batch results back into the dashboard response contract", async () => {
    const { database } = createMockDatabase();
    const repository = new D1DashboardReadRepository(
      database as unknown as D1Database,
    );

    const data = await repository.load("org-1", ["proj-1", "proj-2"]);

    expect(data.draftRevisionCount).toBe(3);
    expect(data.readyToIssueCount).toBe(2);
    expect(data.activeRfiCount).toBe(4);
    expect(data.draftRevisions.map((r) => r.revisionId)).toEqual(["rev-draft"]);
    expect(data.readyToIssue[0]).toMatchObject({
      revisionId: "rev-ready",
      fileCount: 2,
    });
    expect(data.activeRfis[0]).toMatchObject({
      rfiId: "rfi-1",
      dueDate: "2026-07-25",
    });
    expect(data.recentFiles[0].fileId).toBe("file-1");
    expect(data.recentIssuances[0]).toMatchObject({
      issuanceId: "iss-1",
      fileCount: 2,
    });
  });

  it("returns an empty dashboard without touching the database when no projects are accessible", async () => {
    const { database, prepared } = createMockDatabase();
    const repository = new D1DashboardReadRepository(
      database as unknown as D1Database,
    );

    const data = await repository.load("org-1", []);

    expect(database.batch).not.toHaveBeenCalled();
    expect(prepared).toHaveLength(0);
    expect(data).toEqual({
      draftRevisionCount: 0,
      readyToIssueCount: 0,
      activeRfiCount: 0,
      draftRevisions: [],
      readyToIssue: [],
      activeRfis: [],
      recentFiles: [],
      recentIssuances: [],
    });
  });
});
