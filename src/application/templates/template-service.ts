import type { AppSession } from "../../auth/authentication-adapter";
import { requireTemplateManagement } from "../../domain/templates/authorization";
import { TemplateNotFoundError } from "../../domain/templates/errors";
import type { TemplateWithPublishedVersion } from "../../domain/templates/template";
import { validateTemplateMetadata } from "../../domain/templates/validation";
import { requireValidRendererDefinition } from "../../rendering/renderer-definition";
import { D1TemplatesRepository } from "../../infrastructure/db/d1/templates-repository";

export interface TemplatePublishInput {
  key: string;
  name: string;
  kind: string;
  definition: Record<string, unknown>;
  correlationId: string;
}

export class TemplateService {
  constructor(private readonly templates: D1TemplatesRepository) {}

  async list(actor: AppSession): Promise<TemplateWithPublishedVersion[]> {
    return this.templates.list(actor.organizationId);
  }

  async get(
    actor: AppSession,
    key: string,
  ): Promise<TemplateWithPublishedVersion> {
    const template = await this.templates.findByKey(actor.organizationId, key);
    if (!template) throw new TemplateNotFoundError();
    return template;
  }

  async publish(
    actor: AppSession,
    input: TemplatePublishInput,
  ): Promise<TemplateWithPublishedVersion> {
    requireTemplateManagement(actor);
    const metadata = validateTemplateMetadata(input);
    requireValidRendererDefinition(input.definition);
    return this.templates.publishWithActivity(
      actor.organizationId,
      metadata,
      input.definition,
      { actorUserId: actor.userId, correlationId: input.correlationId },
    );
  }
}
