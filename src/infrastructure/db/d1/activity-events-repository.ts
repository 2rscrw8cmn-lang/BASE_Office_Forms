export interface NewActivityEvent {
  organizationId: string;
  actorUserId: string | null;
  actorType: "user" | "system";
  objectType: string;
  objectId: string;
  action: string;
  priorState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  correlationId: string;
}

export class D1ActivityEventsRepository {
  constructor(private readonly database: D1Database) {}

  async append(input: NewActivityEvent): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO activity_events
          (id, organization_id, actor_user_id, actor_type, object_type, object_id,
           action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.organizationId,
        input.actorUserId,
        input.actorType,
        input.objectType,
        input.objectId,
        input.action,
        input.priorState ? JSON.stringify(input.priorState) : null,
        input.newState ? JSON.stringify(input.newState) : null,
        JSON.stringify(input.metadata ?? {}),
        input.correlationId,
        new Date().toISOString(),
      )
      .run();
  }
}
