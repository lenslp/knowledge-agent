import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KnowledgePage from "./page";
import { getKnowledgeSnippetId } from "../../lib/knowledge-sources";

const push = vi.fn();
const replace = vi.fn();
const getSearchParam = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace,
  }),
  useSearchParams: () => ({
    get: getSearchParam,
  }),
}));

describe("KnowledgePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    const source = "/knowledge/user-1/product.md";
    const highlightedSnippet = "第二段知识片段";

    push.mockReset();
    replace.mockReset();
    getSearchParam.mockReset();
    getSearchParam.mockImplementation((key: string) =>
      key === "source"
        ? source
        : key === "snippet"
          ? getKnowledgeSnippetId(source, highlightedSnippet)
          : null
    );

    vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/knowledge") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                source,
                filename: "product.md",
                chunkCount: 2,
              },
            ])
          )
        );
      }

      if (url.includes("/api/knowledge/source?source=")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source,
              filename: "product.md",
              chunks: [
                { content: "第一段知识片段" },
                { content: "第二段知识片段" },
              ],
            })
          )
        );
      }

      throw new Error(`Unhandled fetch call: ${url}`);
    });
  });

  it("shows the selected knowledge source detail view from query params", async () => {
    render(<KnowledgePage />);

    expect(await screen.findByText("文档详情")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("product.md")).toHaveLength(2);
      expect(screen.getByText("第一段知识片段")).toBeInTheDocument();
      expect(screen.getByText("第二段知识片段")).toBeInTheDocument();
      expect(screen.getByText("当前引用")).toBeInTheDocument();
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });
});
