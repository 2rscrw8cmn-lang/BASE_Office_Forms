export interface ApplicationUser {
  id: string;
  identitySubject: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface ExternalIdentity {
  subject: string;
  email: string;
  displayName: string;
}

interface UserRow {
  id: string;
  identity_subject: string;
  email: string;
  display_name: string;
  status: ApplicationUser["status"];
  created_at: string;
  updated_at: string;
}

function mapUser(row: UserRow): ApplicationUser {
  return {
    id: row.id,
    identitySubject: row.identity_subject,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1UsersRepository {
  constructor(private readonly database: D1Database) {}

  async upsertExternalIdentity(
    identity: ExternalIdentity,
  ): Promise<ApplicationUser> {
    const normalizedSubject = identity.subject.trim();
    const normalizedEmail = identity.email.trim().toLowerCase();
    const displayName = identity.displayName.trim() || normalizedEmail;
    if (!normalizedSubject || !normalizedEmail) {
      throw new Error("An external identity subject and email are required.");
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await this.database
      .prepare(
        `INSERT INTO users
          (id, identity_subject, email, display_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(identity_subject) DO UPDATE SET
           email = excluded.email,
           display_name = excluded.display_name,
           updated_at = excluded.updated_at`,
      )
      .bind(id, normalizedSubject, normalizedEmail, displayName, now, now)
      .run();

    const row = await this.database
      .prepare(
        `SELECT id, identity_subject, email, display_name, status, created_at, updated_at
         FROM users
         WHERE identity_subject = ?`,
      )
      .bind(normalizedSubject)
      .first<UserRow>();
    if (!row) {
      throw new Error(
        "The external identity could not be resolved after upsert.",
      );
    }
    return mapUser(row);
  }

  async findById(userId: string): Promise<ApplicationUser | null> {
    const row = await this.database
      .prepare(
        `SELECT id, identity_subject, email, display_name, status, created_at, updated_at
         FROM users WHERE id = ?`,
      )
      .bind(userId)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }
}
