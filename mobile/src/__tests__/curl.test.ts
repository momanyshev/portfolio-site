import { describe, expect, it } from "@jest/globals";

import {
  buildApiCurlCommand,
  createCurlHeaders,
  formatCurlCommand,
  quoteShellArgument,
  resolveAbsoluteUrl,
} from "../lib/curl";

const WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("cURL helpers", () => {
  it("quotes apostrophes with a POSIX shell-safe sequence", () => {
    expect(quoteShellArgument("O'Brien")).toBe(`'O'"'"'Brien'`);
    expect(quoteShellArgument("")).toBe("''");
  });

  it("resolves relative URLs against the configured API base", () => {
    expect(
      resolveAbsoluteUrl("/api/issues?status=open", "http://127.0.0.1:8888"),
    ).toBe("http://127.0.0.1:8888/api/issues?status=open");
    expect(resolveAbsoluteUrl("https://example.test/api/issues")).toBe(
      "https://example.test/api/issues",
    );
  });

  it("adds Content-Type only when a JSON body is present", () => {
    expect(createCurlHeaders(WORKSPACE_ID, false)).toEqual({
      Accept: "application/json",
      "X-Demo-Workspace-Id": WORKSPACE_ID,
    });
    expect(createCurlHeaders(WORKSPACE_ID, true)).toEqual({
      Accept: "application/json",
      "X-Demo-Workspace-Id": WORKSPACE_ID,
      "Content-Type": "application/json",
    });
  });

  it("builds a reproducible command with exact serialized JSON", () => {
    const serializedBody =
      '{"title":"Кнопка O\'Brien","description":"Не работает после клика"}';
    const command = formatCurlCommand({
      method: "POST",
      url: "/api/issues",
      baseUrl: "http://127.0.0.1:8888",
      headers: createCurlHeaders(WORKSPACE_ID, true),
      serializedBody,
    });

    expect(command).toContain("curl --request POST");
    expect(command).toContain(
      "--url 'http://127.0.0.1:8888/api/issues'",
    );
    expect(command).toContain("--header 'Accept: application/json'");
    expect(command).toContain(
      `--header 'X-Demo-Workspace-Id: ${WORKSPACE_ID}'`,
    );
    expect(command).toContain("--header 'Content-Type: application/json'");
    expect(command).toContain(
      `--data-raw ${quoteShellArgument(serializedBody)}`,
    );
  });

  it("never carries a previous body into a bodyless DELETE command", () => {
    const command = buildApiCurlCommand({
      method: "DELETE",
      url: `https://example.test/api/issues/${WORKSPACE_ID}`,
      workspaceId: WORKSPACE_ID,
    });

    expect(command).not.toContain("Content-Type");
    expect(command).not.toContain("--data-raw");
  });

  it("produces identical output for identical API request data", () => {
    const input = {
      method: "PATCH" as const,
      url: "https://example.test/api/issues/1",
      workspaceId: WORKSPACE_ID,
      body: { status: "testing" } as const,
    };

    expect(buildApiCurlCommand(input)).toBe(buildApiCurlCommand(input));
  });
});
