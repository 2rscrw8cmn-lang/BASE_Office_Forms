import type { TemplateVersion } from "../../domain/templates/template";
import {
  BASE_RFI_TEMPLATE_KEY,
  BASE_RFI_TEMPLATE_NAME,
  buildBaseRfiTemplateDefinition,
} from "../../domain/rfis/base-rfi-template";
import { requireValidRendererDefinition } from "../../rendering/renderer-definition";
import { D1TemplatesRepository } from "../../infrastructure/db/d1/templates-repository";

export interface BoundRfiTemplate {
  templateVersionId: string;
  key: string;
  name: string;
  versionNumber: number;
  status: TemplateVersion["status"];
  definition: Record<string, unknown>;
}

/**
 * Narrow adapter between an RFI draft and the approved BASE RFI template. It
 * resolves the published `base-rfi` template version for the organization,
 * seeding it on first use so a project user never has to visit Studio to make
 * RFIs work. This is deliberately the *only* template coupling in the RFI slice;
 * full template governance (versioned migrations, template lifecycle) remains a
 * documented Phase-3 gap and is not built here.
 */
export class RfiTemplateBindingService {
  constructor(private readonly templates: D1TemplatesRepository) {}

  async resolveDefault(
    organizationId: string,
    actorUserId: string,
    correlationId: string,
  ): Promise<BoundRfiTemplate> {
    const existing = await this.templates.findByKey(
      organizationId,
      BASE_RFI_TEMPLATE_KEY,
    );
    if (existing) return this.toBound(existing.publishedVersion);

    const definition = requireValidRendererDefinition(
      buildBaseRfiTemplateDefinition(),
    );
    try {
      const seeded = await this.templates.publishWithActivity(
        organizationId,
        {
          key: BASE_RFI_TEMPLATE_KEY,
          name: BASE_RFI_TEMPLATE_NAME,
          kind: "form",
        },
        definition,
        { actorUserId, correlationId },
      );
      return this.toBound(seeded.publishedVersion);
    } catch (error) {
      // A concurrent first-draft may have seeded the template between our read
      // and write; the unique constraints reject the loser. Re-resolve rather
      // than fail the draft.
      const raced = await this.templates.findByKey(
        organizationId,
        BASE_RFI_TEMPLATE_KEY,
      );
      if (raced) return this.toBound(raced.publishedVersion);
      throw error;
    }
  }

  async describe(
    organizationId: string,
    templateVersionId: string | null,
  ): Promise<BoundRfiTemplate | null> {
    const template = await this.templates.findByKey(
      organizationId,
      BASE_RFI_TEMPLATE_KEY,
    );
    if (!template) return null;
    if (!templateVersionId) return this.toBound(template.publishedVersion);
    const exact = await this.templates.findVersionById(
      organizationId,
      templateVersionId,
    );
    if (!exact || exact.templateId !== template.id) return null;
    return this.toBound(exact);
  }

  private toBound(version: TemplateVersion): BoundRfiTemplate {
    return {
      templateVersionId: version.id,
      key: BASE_RFI_TEMPLATE_KEY,
      name: BASE_RFI_TEMPLATE_NAME,
      versionNumber: version.versionNumber,
      status: version.status,
      definition: version.definition,
    };
  }
}
