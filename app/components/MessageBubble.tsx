"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, PencilLine, RefreshCcw, Sparkles, User, X } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import MermaidChart from "./MermaidChart";
import ToolCallBubble from "./ToolCallBubble";

import type { Message } from "ai";
import {
    getKnowledgeSnippetId,
    type KnowledgeSourceSnippet,
} from "../../lib/knowledge-sources";

/** 从 annotations 中去重提取工具调用，保留最新状态 */
function dedupeToolCalls(annotations: any[]) {
    const map = new Map();
    annotations.forEach((annotation: any) => {
        if (annotation?.type === "tool_call" && annotation.id) {
            const existing = map.get(annotation.id);
            if (!existing || existing.status === "running") {
                map.set(annotation.id, annotation);
            }
        }
    });
    return Array.from(map.values());
}

function dedupeKnowledgeSources(annotations: any[]): KnowledgeSourceSnippet[] {
    const merged: KnowledgeSourceSnippet[] = [];

    annotations.forEach((annotation: any) => {
        if (annotation?.type === "knowledge_sources" && Array.isArray(annotation.sources)) {
            annotation.sources.forEach((source: KnowledgeSourceSnippet) => {
                merged.push(source);
            });
        }
    });

    const map = new Map<string, KnowledgeSourceSnippet>();
    merged.forEach((source) => {
        const key = `${source.source}::${source.snippet}`;
        if (!map.has(key)) {
            map.set(key, source);
        }
    });

    return Array.from(map.values());
}

function stripLegacyCitationFooter(content: string) {
    return content.replace(/\n?\s*>?\s*📄 来源：.+$/m, "").trim();
}

function getUserMessageText(message: Message) {
    return typeof message.content === "string"
        ? message.content
        : (message.content as any[])
            .filter((part: any) => part.type === "text")
            .map((part: any) => part.text)
            .join(" ");
}

function getAssistantMessageParts(message: Message) {
    const knowledgeSources = dedupeKnowledgeSources((message.annotations as any[]) ?? []);
    let mainContent = typeof message.content === "string" ? message.content : getUserMessageText(message);
    let thinkContent = "";

    const thinkMatches = Array.from(mainContent.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g));
    if (thinkMatches.length > 0) {
        thinkContent = thinkMatches.map((match) => match[1].trim()).join("\n\n");
        mainContent = mainContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
    }

    if (knowledgeSources.length > 0) {
        mainContent = stripLegacyCitationFooter(mainContent);
    }

    return { thinkContent, mainContent, knowledgeSources };
}

/** Markdown 渲染的 code 组件 */
const MarkdownCode = ({ node, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match?.[1];
    const isInline = !className;

    if (lang === "mermaid") {
        return <MermaidChart chart={String(children).replace(/\n$/, "")} />;
    }

    return !isInline && match ? (
        <SyntaxHighlighter
            style={oneDark}
            language={lang}
            PreTag="div"
            customStyle={{
                margin: "0.75rem 0",
                borderRadius: "0.75rem",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: "0.85rem",
            }}
            {...props}
        >
            {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
    ) : (
        <code className={className} {...props}>
            {children}
        </code>
    );
};

interface MessageBubbleProps {
    message: Message;
    canRegenerate?: boolean;
    canEditAndResend?: boolean;
    isLoading?: boolean;
    onRegenerate?: (messageId: string) => Promise<void>;
    onEditAndResend?: (messageId: string, content: string) => Promise<void>;
}

export default function MessageBubble({
    message,
    canRegenerate = false,
    canEditAndResend = false,
    isLoading = false,
    onRegenerate,
    onEditAndResend,
}: MessageBubbleProps) {
    const m = message;
    const { mainContent } = getAssistantMessageParts(m);
    const userMessageText = getUserMessageText(m);
    const hasImages = (m.annotations as any[])?.some((annotation: any) => annotation?.type === "image");
    const canCopy = m.role === "assistant" && Boolean(mainContent.trim());
    const canEditText = canEditAndResend && m.role === "user" && !hasImages;

    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(userMessageText);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

    const handleCopy = async () => {
        if (!canCopy || !navigator.clipboard?.writeText) return;

        await navigator.clipboard.writeText(mainContent);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    const handleEditSave = async () => {
        const nextContent = draft.trim();
        if (!nextContent || nextContent === userMessageText || !onEditAndResend) {
            setIsEditing(false);
            setDraft(userMessageText);
            return;
        }

        setIsSubmittingEdit(true);
        try {
            await onEditAndResend(m.id, nextContent);
            setIsEditing(false);
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const actionClassName = "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

    return (
        <motion.div
            key={m.id}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`group flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}
        >
            {/* 头像 */}
            <div
                className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                    m.role === "user"
                        ? "bg-[#2d2c25] border border-white/5"
                        : "bg-[#d48c66]/20 border border-[#d48c66]/30"
                }`}
            >
                {m.role === "user" ? (
                    <User className="w-4 h-4 text-[#e7e7e4]" />
                ) : (
                    <Sparkles className="w-4 h-4 text-[#d48c66]" />
                )}
            </div>

            {/* 消息内容 */}
            <div className={`min-w-0 max-w-[85%] sm:max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"} flex flex-col gap-2`}>
                <div
                    className={`w-full rounded-2xl px-5 py-3.5 font-normal leading-relaxed text-[15px] ${
                        m.role === "user"
                            ? "bg-[#2d2c25] text-[#ececec] border border-white/5"
                            : "text-[#ececec]"
                    }`}
                >
                    {/* 工具调用可视化 */}
                    {m.annotations && m.annotations.length > 0 && (
                        <>
                            {dedupeToolCalls(m.annotations).map((annotation: any, index: number) => (
                                <ToolCallBubble key={`${annotation.id}-${index}`} annotation={annotation} />
                            ))}
                        </>
                    )}

                    {m.role === "user" ? (
                        isEditing ? (
                            <div className="space-y-3">
                                <textarea
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    className="min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[15px] leading-7 text-[#ececec] outline-none transition-colors focus:border-[#d48c66]/40"
                                    placeholder="修改后重新发送..."
                                    disabled={isSubmittingEdit}
                                    autoFocus
                                />
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraft(userMessageText);
                                            setIsEditing(false);
                                        }}
                                        className={actionClassName}
                                        disabled={isSubmittingEdit}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleEditSave}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-[#d48c66]/30 bg-[#d48c66]/15 px-3 py-1.5 text-xs text-[#f1c6af] transition-colors hover:border-[#d48c66]/45 hover:bg-[#d48c66]/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        disabled={isSubmittingEdit || !draft.trim()}
                                    >
                                        <RefreshCcw className="w-3.5 h-3.5" />
                                        {isSubmittingEdit ? "重发中..." : "保存并重发"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <UserMessageContent message={m} />
                        )
                    ) : (
                        <AssistantMessageContent message={m} />
                    )}
                </div>

                {(canCopy || canRegenerate || canEditText) && !isEditing && (
                    <div className={`flex flex-wrap gap-2 opacity-70 transition-opacity group-hover:opacity-100 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        {canCopy && (
                            <button type="button" onClick={handleCopy} className={actionClassName}>
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? "已复制" : "复制"}
                            </button>
                        )}
                        {canRegenerate && onRegenerate && (
                            <button
                                type="button"
                                onClick={() => onRegenerate(m.id)}
                                className={actionClassName}
                                disabled={isLoading}
                            >
                                <RefreshCcw className="w-3.5 h-3.5" />
                                重新生成
                            </button>
                        )}
                        {canEditText && (
                            <button
                                type="button"
                                onClick={() => {
                                    setDraft(userMessageText);
                                    setIsEditing(true);
                                }}
                                className={actionClassName}
                                disabled={isLoading}
                            >
                                <PencilLine className="w-3.5 h-3.5" />
                                编辑重发
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

/** 用户消息内容 */
function UserMessageContent({ message }: { message: Message }) {
    const imgs = (message.annotations as any[])?.filter((a: any) => a?.type === "image");

    return (
        <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-p:leading-relaxed prose-p:mb-3 prose-img:max-h-60 prose-img:rounded-lg prose-img:object-contain prose-img:my-2 break-words">
            {imgs?.length ? (
                <div className="flex flex-wrap gap-2 mb-2">
                    {imgs.map((img: any, i: number) => (
                        <img key={i} src={img.url} alt="附件图片" className="max-h-48 max-w-xs rounded-xl object-cover border border-white/10" />
                    ))}
                </div>
            ) : null}
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {getUserMessageText(message)}
            </ReactMarkdown>
        </div>
    );
}

/** AI 助手消息内容 */
function AssistantMessageContent({ message }: { message: Message }) {
    const { knowledgeSources, mainContent, thinkContent } = getAssistantMessageParts(message);

    return (
        <div className="flex flex-col gap-3">
            {thinkContent && (
                <details open className="group/think mb-2">
                    <summary className="text-sm text-gray-400/80 cursor-pointer select-none font-medium flex items-center gap-2 hover:text-gray-300 transition-colors w-max list-none">
                        <div className="w-4 h-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center -ml-1">
                            <svg className="w-2.5 h-2.5 transform transition-transform group-open/think:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                        Thinking Process
                    </summary>
                    <div className="mt-3 pl-4 border-l-2 border-white/10 text-sm text-gray-400 leading-relaxed font-mono whitespace-pre-wrap">
                        {thinkContent}
                        {!message.content.includes("</think>") && (
                            <span className="inline-block w-1.5 h-3 ml-1 bg-gray-500 animate-pulse" />
                        )}
                    </div>
                </details>
            )}
            {mainContent && (
                <div className="prose prose-invert prose-sm sm:prose-base max-w-none
                    prose-p:leading-relaxed prose-p:mb-3
                    prose-pre:bg-transparent prose-pre:p-0
                    prose-code:text-blue-300 prose-code:bg-blue-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                    prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-white prose-strong:font-semibold
                    prose-ul:list-disc prose-ol:list-decimal prose-li:my-1
                    prose-headings:text-white prose-headings:font-bold prose-headings:mb-4
                    prose-blockquote:border-l-teal-400/60 prose-blockquote:bg-teal-500/5 prose-blockquote:rounded-r-lg prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:text-teal-300/90 prose-blockquote:text-sm prose-blockquote:not-italic
                    prose-table:text-sm prose-thead:text-gray-300 prose-th:border prose-th:border-white/20 prose-th:bg-white/5 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-white/10 prose-td:px-3 prose-td:py-2
                    break-words"
                >
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{ code: MarkdownCode }}
                    >
                        {mainContent}
                    </ReactMarkdown>
                </div>
            )}
            {knowledgeSources.length > 0 && (
                <KnowledgeSourcesPanel sources={knowledgeSources} />
            )}
        </div>
    );
}

function KnowledgeSourcesPanel({ sources }: { sources: KnowledgeSourceSnippet[] }) {
    const [activeSource, setActiveSource] = useState<KnowledgeSourceSnippet | null>(
        sources[0] ?? null
    );
    const [isExpanded, setIsExpanded] = useState(false);

    const fullSnippet = activeSource?.snippet ?? "";
    const shouldCollapse = fullSnippet.length > 240;
    const visibleSnippet =
        shouldCollapse && !isExpanded
            ? `${fullSnippet.slice(0, 240).trimEnd()}...`
            : fullSnippet;
    const activeSnippetId = activeSource
        ? getKnowledgeSnippetId(activeSource.source, activeSource.snippet)
        : null;

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-white">引用来源</p>
                    <p className="text-xs text-gray-400">点击文件名查看本次回答命中的原文片段</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-gray-300">
                    {sources.length} 个片段
                </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {sources.map((source, index) => {
                    const isActive =
                        activeSource?.source === source.source &&
                        activeSource?.snippet === source.snippet;

                    return (
                        <button
                            key={`${source.source}-${index}`}
                            type="button"
                            onClick={() => {
                                setActiveSource(source);
                                setIsExpanded(false);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                isActive
                                    ? "border-[#d48c66]/50 bg-[#d48c66]/15 text-[#f1c6af]"
                                    : "border-white/10 bg-black/20 text-gray-300 hover:border-white/20 hover:bg-white/5"
                            }`}
                        >
                            {source.filename}
                        </button>
                    );
                })}
            </div>

            {activeSource && (
                <div className="mt-3 rounded-xl border border-white/10 bg-[#171712] px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#d48c66]">
                        {activeSource.filename}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-200">
                        {visibleSnippet}
                    </p>
                    {shouldCollapse && (
                        <button
                            type="button"
                            onClick={() => setIsExpanded((value) => !value)}
                            className="mt-3 text-xs font-medium text-[#d48c66] transition-colors hover:text-[#efb494]"
                        >
                            {isExpanded ? "收起" : "查看更多上下文"}
                        </button>
                    )}
                    <div className="mt-3">
                        <Link
                            href={`/knowledge?source=${encodeURIComponent(activeSource.source)}${
                                activeSnippetId
                                    ? `&snippet=${encodeURIComponent(activeSnippetId)}`
                                    : ""
                            }`}
                            className="text-xs font-medium text-[#d48c66] transition-colors hover:text-[#efb494]"
                        >
                            查看知识库详情
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
