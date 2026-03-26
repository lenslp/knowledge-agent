export interface KnowledgeSourceSnippet {
  source: string;
  filename: string;
  snippet: string;
}

interface KnowledgeSearchToolPayload {
  context: string;
  sources: KnowledgeSourceSnippet[];
}

function isKnowledgeSourceSnippet(value: unknown): value is KnowledgeSourceSnippet {
  if (!value || typeof value !== "object") return false;

  const source = Reflect.get(value, "source");
  const filename = Reflect.get(value, "filename");
  const snippet = Reflect.get(value, "snippet");

  return (
    typeof source === "string" &&
    typeof filename === "string" &&
    typeof snippet === "string"
  );
}

export function parseKnowledgeSearchToolOutput(output: unknown): KnowledgeSourceSnippet[] {
  if (typeof output !== "string") return [];

  try {
    const parsed = JSON.parse(output) as KnowledgeSearchToolPayload;
    if (!Array.isArray(parsed.sources)) return [];

    return parsed.sources.filter(isKnowledgeSourceSnippet);
  } catch {
    return [];
  }
}

export function mergeKnowledgeSources(
  sources: KnowledgeSourceSnippet[]
): KnowledgeSourceSnippet[] {
  const deduped = new Map<string, KnowledgeSourceSnippet>();

  for (const source of sources) {
    const key = `${source.source}::${source.snippet}`;
    if (!deduped.has(key)) {
      deduped.set(key, source);
    }
  }

  return Array.from(deduped.values());
}

export function getKnowledgeSnippetId(source: string, snippet: string): string {
  const input = `${source}::${snippet}`;
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return Math.abs(hash >>> 0).toString(36);
}
