import { describe, expect, it } from "vitest";

import {
  mergeKnowledgeSources,
  parseKnowledgeSearchToolOutput,
} from "./knowledge-sources";

describe("knowledge source helpers", () => {
  it("parses structured knowledge search payloads", () => {
    const sources = parseKnowledgeSearchToolOutput(
      JSON.stringify({
        context: "片段 1（来源：产品手册.md）:\n这里是内容",
        sources: [
          {
            source: "/tmp/product.md",
            filename: "产品手册.md",
            snippet: "这里是内容",
          },
        ],
      })
    );

    expect(sources).toEqual([
      {
        source: "/tmp/product.md",
        filename: "产品手册.md",
        snippet: "这里是内容",
      },
    ]);
  });

  it("deduplicates repeated source snippets", () => {
    const sources = mergeKnowledgeSources([
      {
        source: "/tmp/product.md",
        filename: "产品手册.md",
        snippet: "这里是内容",
      },
      {
        source: "/tmp/product.md",
        filename: "产品手册.md",
        snippet: "这里是内容",
      },
    ]);

    expect(sources).toHaveLength(1);
  });
});
