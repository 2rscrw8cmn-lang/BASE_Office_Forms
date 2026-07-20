import { beforeEach, describe, expect, it } from "vitest";

import { invokeLegacyApi, jsonBody } from "../helpers/api";
import { resetLegacyLibrary } from "../helpers/d1";

const validDefinition = {
  kind: "form",
  no: "REG-1",
  title: "Legacy regression form",
  sections: [{ name: "Details", fields: [["Project", 2]] }],
};

describe("legacy shared-library API", () => {
  beforeEach(async () => {
    await resetLegacyLibrary();
  });

  it("still creates, lists, and reads existing renderer definitions", async () => {
    const createdResponse = await invokeLegacyApi("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definition: validDefinition }),
    });
    const created = await jsonBody(createdResponse);

    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({
      document: { title: "Legacy regression form", kind: "form" },
    });
    expect(created).toHaveProperty("editToken");

    const listResponse = await invokeLegacyApi("/api/documents");
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      documents: [{ title: "Legacy regression form", kind: "form" }],
    });
  });

  it("returns clear field paths for invalid renderer definitions", async () => {
    const response = await invokeLegacyApi("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        definition: {
          kind: "form",
          title: "Invalid form",
          sections: [{ name: "Details", fields: [["Project", "wide"]] }],
        },
      }),
    });
    const body = await jsonBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: "Renderer definition is invalid." });
    expect(body.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/sections/0/fields/0/1" }),
      ]),
    );
  });
});
