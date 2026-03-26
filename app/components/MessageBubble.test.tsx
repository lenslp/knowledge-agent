import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MessageBubble from "./MessageBubble";
import { getKnowledgeSnippetId } from "../../lib/knowledge-sources";

describe("MessageBubble", () => {
  it("renders clickable knowledge source snippets for assistant messages", () => {
    const source = "/knowledge/user-1/product.md";
    const snippet = "这里是命中的原文片段。";

    render(
      <MessageBubble
        message={{
          id: "assistant-1",
          role: "assistant",
          content: "这是回答正文。\n\n> 📄 来源：产品手册.md",
          annotations: [
            {
              type: "knowledge_sources",
              sources: [
                {
                  source,
                  filename: "产品手册.md",
                  snippet,
                },
              ],
            },
          ],
        }}
      />
    );

    expect(screen.getByText("引用来源")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "产品手册.md" })).toBeInTheDocument();
    expect(screen.getByText("这里是命中的原文片段。")).toBeInTheDocument();
    expect(screen.queryByText("📄 来源：产品手册.md")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看知识库详情" })).toHaveAttribute(
      "href",
      `/knowledge?source=${encodeURIComponent(source)}&snippet=${encodeURIComponent(
        getKnowledgeSnippetId(source, snippet)
      )}`
    );
  });

  it("lets users expand long source snippets to view more context", async () => {
    const user = userEvent.setup();
    const longSnippet =
      "这是一段很长的来源片段。".repeat(30) + "结尾内容。";

    render(
      <MessageBubble
        message={{
          id: "assistant-2",
          role: "assistant",
          content: "这里是带长来源的回答。",
          annotations: [
            {
              type: "knowledge_sources",
              sources: [
                {
                  source: "/knowledge/user-1/long.md",
                  filename: "长文档.md",
                  snippet: longSnippet,
                },
              ],
            },
          ],
        }}
      />
    );

    expect(screen.getByRole("button", { name: "查看更多上下文" })).toBeInTheDocument();
    expect(screen.queryByText("结尾内容。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看更多上下文" }));

    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
    expect(screen.getByText(longSnippet)).toBeInTheDocument();
  });

  it("copies the visible assistant answer content", async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(window.navigator.clipboard, "writeText");

    render(
      <MessageBubble
        message={{
          id: "assistant-copy",
          role: "assistant",
          content: "<think>中间推理</think>\n这是最终回答。\n\n> 📄 来源：内部手册.md",
          annotations: [
            {
              type: "knowledge_sources",
              sources: [
                {
                  source: "/knowledge/user-1/internal.md",
                  filename: "内部手册.md",
                  snippet: "这是命中的来源片段。",
                },
              ],
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith("这是最终回答。");
    });
    expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  });

  it("triggers regenerate for the latest assistant message", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageBubble
        message={{
          id: "assistant-regenerate",
          role: "assistant",
          content: "请重新生成这条回复。",
        }}
        canRegenerate
        onRegenerate={onRegenerate}
      />
    );

    await user.click(screen.getByRole("button", { name: "重新生成" }));

    expect(onRegenerate).toHaveBeenCalledWith("assistant-regenerate");
  });

  it("lets users edit and resend a text message", async () => {
    const user = userEvent.setup();
    const onEditAndResend = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageBubble
        message={{
          id: "user-edit",
          role: "user",
          content: "原始问题",
        }}
        canEditAndResend
        onEditAndResend={onEditAndResend}
      />
    );

    await user.click(screen.getByRole("button", { name: "编辑重发" }));
    await user.clear(screen.getByPlaceholderText("修改后重新发送..."));
    await user.type(screen.getByPlaceholderText("修改后重新发送..."), "更新后的问题");
    await user.click(screen.getByRole("button", { name: "保存并重发" }));

    await waitFor(() => {
      expect(onEditAndResend).toHaveBeenCalledWith("user-edit", "更新后的问题");
    });
  });
});
