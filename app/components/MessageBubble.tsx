"use client";

import { User, Sparkles } from "lucide-react";
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

export default function MessageBubble({ message }: { message: Message }) {
    const m = message;

    return (
        <motion.div
            key={m.id}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}
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
            <div
                className={`min-w-0 max-w-[85%] sm:max-w-[85%] rounded-2xl px-5 py-3.5 font-normal leading-relaxed text-[15px] ${
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
                    <UserMessageContent message={m} />
                ) : (
                    <AssistantMessageContent message={m} />
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
                {typeof message.content === "string" ? message.content : (message.content as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ")}
            </ReactMarkdown>
        </div>
    );
}

/** AI 助手消息内容 */
function AssistantMessageContent({ message }: { message: Message }) {
    let mainContent = message.content;
    let thinkContent = "";

    const thinkMatches = Array.from(message.content.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g));
    if (thinkMatches.length > 0) {
        thinkContent = thinkMatches.map(match => match[1].trim()).join("\n\n");
        mainContent = message.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
    }

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
        </div>
    );
}
