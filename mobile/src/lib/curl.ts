import type { JsonValue } from "../domain/issues";

export type ApiHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface CurlCommandInput {
  method: ApiHttpMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  serializedBody?: string;
  baseUrl?: string;
}

export interface ApiCurlCommandInput {
  method: ApiHttpMethod;
  url: string;
  workspaceId: string;
  body?: JsonValue;
  baseUrl?: string;
}

export function quoteShellArgument(value: unknown): string {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function resolveAbsoluteUrl(url: string, baseUrl?: string): string {
  if (baseUrl) {
    return new URL(url, baseUrl).href;
  }

  return new URL(url).href;
}

export function createCurlHeaders(
  workspaceId: string,
  hasBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Demo-Workspace-Id": workspaceId,
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

export function formatCurlCommand({
  method,
  url,
  headers,
  serializedBody,
  baseUrl,
}: CurlCommandInput): string {
  const lines = [
    `curl --request ${method}`,
    `  --url ${quoteShellArgument(resolveAbsoluteUrl(url, baseUrl))}`,
  ];

  for (const [name, value] of Object.entries(headers)) {
    lines.push(`  --header ${quoteShellArgument(`${name}: ${value}`)}`);
  }

  if (serializedBody !== undefined) {
    lines.push(`  --data-raw ${quoteShellArgument(serializedBody)}`);
  }

  return lines.join(" \\\n");
}

export function buildApiCurlCommand({
  method,
  url,
  workspaceId,
  body,
  baseUrl,
}: ApiCurlCommandInput): string {
  const hasBody = body !== undefined;

  return formatCurlCommand({
    method,
    url,
    headers: createCurlHeaders(workspaceId, hasBody),
    serializedBody: hasBody ? JSON.stringify(body) : undefined,
    baseUrl,
  });
}
