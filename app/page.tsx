"use client";

import { useChat } from "ai/react";
import { Send, Bot, User, Loader2, Sparkles, Globe, Menu, Plus, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatPage() {
    // Supabase client creation is usually done in a util, but for client components we can use createBrowserClient if we installed it.
    // However, since we only set up server SSR client, we will fetch data from a new GET API route we'll create next, or directly using Next.js Server Actions.
    // For now, let's setup the state to receive them.
    const [chats, setChats] = useState<{ id: string, title: string, created_at: string }[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    const { messages, setMessages, input, handleInputChange, handleSubmit, isLoading } =
        useChat({
            api: "/api/chat",
            body: {
                chatId: activeChatId
            },
            onFinish: () => {
                // Refresh chats list after a message finishes so new chats appear in sidebar
                fetchChats();
            }
        });

    const fetchChats = async () => {
        try {
            const res = await fetch('/api/chats');
            const data = await res.json();
            if (Array.isArray(data)) {
                setChats(data);
            } else {
                console.error("API returned non-array:", data);
                setChats([]);
            }
        } catch (e) {
            console.error("Fetch chats error:", e);
            setChats([]);
        }
    };

    useEffect(() => {
        fetchChats();
    }, []);

    // 切换聊天的函数
    const switchChat = async (chatId: string | null) => {
        setActiveChatId(chatId);
        if (chatId) {
            try {
                const res = await fetch(`/api/chats/${chatId}`);
                const data = await res.json();
                // Map DB messages to Vercel AI SDK format
                const formattedMessages = data.map((msg: any) => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content
                }));
                setMessages(formattedMessages);
            } catch (e) {
                console.error(e);
            }
        } else {
            setMessages([]);
        }
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="flex h-screen bg-[#1e1e19] overflow-hidden text-[#ececec] w-full relative font-sans">
            {/* Sidebar */}
            <AnimatePresence initial={false}>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 280, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="h-full bg-[#1e1e19] border-r border-white/5 flex flex-col overflow-hidden flex-shrink-0 z-20"
                    >
                        <div className="p-4 flex flex-col gap-5 w-[280px] h-full">
                            <button onClick={() => switchChat(null)} className="w-full p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[#ececec] text-sm flex items-center justify-center gap-2 font-medium border border-white/5">
                                <Plus className="w-4 h-4" /> 新建对话
                            </button>

                            <div className="flex flex-col flex-1 overflow-hidden">
                                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-3">历史记录</h2>
                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {chats.map((chat) => (
                                        <div
                                            key={chat.id}
                                            onClick={() => switchChat(chat.id)}
                                            className={`p-3 rounded-xl cursor-pointer flex items-start gap-3 text-sm transition-all group ${activeChatId === chat.id
                                                ? "bg-white/10 border border-white/10 text-gray-200 shadow-sm relative"
                                                : "hover:bg-white/5 text-gray-400 border border-transparent"
                                                }`}
                                        >
                                            {activeChatId === chat.id && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full"></div>
                                            )}
                                            <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${activeChatId === chat.id ? "text-indigo-400" : "opacity-70"}`} />
                                            <div className="flex-1 overflow-hidden">
                                                <p className={`truncate ${activeChatId === chat.id ? "font-medium text-white" : ""}`}>{chat.title}</p>
                                                <p className={`text-xs mt-1 ${activeChatId === chat.id ? "text-blue-300/60" : "text-gray-500"}`}>
                                                    {new Date(chat.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden relative transition-all duration-300 bg-[#1e1e19]">
                {/* 顶部导航栏 */}
                <header className="px-6 py-4 flex items-center justify-between z-10 sticky top-0 border-b border-transparent">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-300"
                        >
                            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                        </button>
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-serif tracking-tight text-[#e7e7e4] flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-[#e7e7e4]/70" />
                                Antigravity Search Agent
                            </h1>
                        </div>
                    </div>

                    {/* 特性展示徽章 */}
                    <div className="hidden sm:flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300">
                            <Globe className="w-3.5 h-3.5" />
                            <span>Tavily 实时搜索介入</span>
                        </div>
                    </div>
                </header>

                {/* 聊天内容区 */}
                <main className="flex-1 overflow-y-auto w-full p-4 sm:p-8 space-y-6 scroll-smooth">
                    <div className="max-w-4xl mx-auto space-y-8 pb-32">
                        {messages.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4"
                            >
                                <div className="text-4xl text-[#d48c66] mb-2 font-serif flex items-center gap-3">
                                    <Sparkles className="w-8 h-8" />
                                    <span>Coffee and Claude time?</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-lg">
                                    <div onClick={() => handleInputChange({ target: { value: "今天有什么重要的AI新闻？" } } as any)} className="p-4 rounded-xl bg-[#23221d] border border-white/5 hover:bg-[#2d2c25] cursor-pointer transition text-sm text-[#e7e7e4] flex items-center gap-3">
                                        <Globe className="w-4 h-4 text-[#d48c66]" />
                                        <p className="font-medium">今天有什么重要的AI新闻？</p>
                                    </div>
                                    <div onClick={() => handleInputChange({ target: { value: "Next.js 的 App Router 是什么？" } } as any)} className="p-4 rounded-xl bg-[#23221d] border border-white/5 hover:bg-[#2d2c25] cursor-pointer transition text-sm text-[#e7e7e4] flex items-center gap-3">
                                        <Bot className="w-4 h-4 text-gray-400" />
                                        <p className="font-medium">Next.js 的 App Router 是什么？</p>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <AnimatePresence>
                                {messages.map((m) => (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""
                                            }`}
                                    >
                                        <div
                                            className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${m.role === "user"
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

                                        <div
                                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 font-normal leading-relaxed text-[15px] ${m.role === "user"
                                                ? "bg-[#2d2c25] text-[#ececec] border border-white/5"
                                                : "text-[#ececec]"
                                                }`}
                                        >
                                            {/* Tool 调用可视化气泡 (Vercel SDK 内部支持) */}
                                            {m.toolInvocations?.map((toolInvocation) => (
                                                <div key={toolInvocation.toolCallId} className="mb-3 p-3 rounded-xl bg-black/30 border border-indigo-500/20 flex flex-col gap-1.5 text-xs text-indigo-300 font-mono">
                                                    <div className="flex items-center gap-2">
                                                        <Globe className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                                                        <span className="font-bold">Agent Tool Triggered: {toolInvocation.toolName}</span>
                                                    </div>
                                                    <div className="text-gray-400 break-words opacity-80">
                                                        {JSON.stringify(toolInvocation.args)}
                                                    </div>
                                                </div>
                                            ))}
                                            {m.role === "user" ? (
                                                <div className="whitespace-pre-wrap">{m.content}</div>
                                            ) : (
                                                (() => {
                                                    let mainContent = m.content;
                                                    let thinkContent = "";

                                                    // 匹配所有的 <think> 标签，支持跨越多行
                                                    const thinkMatches = Array.from(m.content.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g));
                                                    if (thinkMatches.length > 0) {
                                                        thinkContent = thinkMatches.map(match => match[1].trim()).join("\n\n");
                                                        // 从主内容中全局移除所有的 <think>...</think> 块
                                                        mainContent = m.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
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
                                                                        {!m.content.includes("</think>") && (
                                                                            <span className="inline-block w-1.5 h-3 ml-1 bg-gray-500 animate-pulse" />
                                                                        )}
                                                                    </div>
                                                                </details>
                                                            )}
                                                            {mainContent && (
                                                                <div className="prose prose-invert prose-sm sm:prose-base max-w-none 
                                                                    prose-p:leading-relaxed prose-p:mb-3 
                                                                    prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:backdrop-blur-xl prose-pre:shadow-2xl 
                                                                    prose-code:text-blue-300 prose-code:bg-blue-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                                                                    prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                                                                    prose-strong:text-white prose-strong:font-semibold
                                                                    prose-ul:list-disc prose-ol:list-decimal prose-li:my-1
                                                                    prose-headings:text-white prose-headings:font-bold prose-headings:mb-4
                                                                    break-words"
                                                                >
                                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                        {mainContent}
                                                                    </ReactMarkdown>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}

                        {isLoading && messages[messages.length - 1]?.role === 'user' && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-[#d48c66]/20 border border-[#d48c66]/30 flex items-center justify-center">
                                    <Loader2 className="w-4 h-4 text-[#d48c66] animate-spin" />
                                </div>
                                <div className="bg-[#23221d] rounded-2xl px-5 py-3.5 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-[#d48c66]/70 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                    <span className="w-1.5 h-1.5 bg-[#d48c66]/70 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                    <span className="w-1.5 h-1.5 bg-[#d48c66]/70 rounded-full animate-bounce"></span>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </main>

                {/* 底部输入区 */}
                <div className="absolute bottom-0 w-full p-4 sm:p-8 pointer-events-none">
                    <div className="max-w-3xl mx-auto relative pointer-events-auto">
                        {/* Glass 模糊底板 */}
                        <div className="absolute inset-0 -bottom-8 rounded-[2rem] bg-gradient-to-t from-black/80 via-black/40 to-transparent blur-2xl pointer-events-none"></div>

                        <form
                            onSubmit={handleSubmit}
                            className="relative flex items-center w-full rounded-2xl overflow-hidden bg-[#2f2e27] transition duration-300 border border-white/5 focus-within:border-white/20"
                        >
                            <input
                                className="flex-1 bg-transparent px-6 py-4 text-[#e7e7e4] placeholder:text-gray-500 focus:outline-none focus:ring-0 text-[15px]"
                                value={input}
                                placeholder="How can I help you today?"
                                onChange={handleInputChange}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input}
                                className="m-2 p-2 rounded-lg bg-[#534032] hover:bg-[#6c5442] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[#d48c66]"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </div>
                {/* End of Main Chat Area */}
            </div>
        </div>
    );
}
