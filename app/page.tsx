"use client";

import { useChat } from "ai/react";
import Link from "next/link";
import { Send, Bot, User, Loader2, Sparkles, Globe, Menu, Plus, MessageSquare, PanelLeftClose, PanelLeftOpen, BookOpen, Trash2, ImagePlus, X, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "katex/dist/katex.min.css";
import MermaidChart from "./components/MermaidChart";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

export default function ChatPage() {
    const [chats, setChats] = useState<{ id: string, title: string, created_at: string }[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);
    const [isDeletingChat, setIsDeletingChat] = useState(false);
    const [pendingImages, setPendingImages] = useState<{ dataUrl: string; name: string }[]>([]);
    const [chatError, setChatError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [user, setUser] = useState<{ email?: string | null } | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const supabase = getSupabaseBrowserClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = "/login";
    };

    // 获取当前用户信息
    useEffect(() => {
        supabase.auth.getUser().then(({ data }: { data: { user: { email?: string | null } | null } }) => setUser(data.user));
    }, [supabase]);

    // 点击外部关闭设置菜单
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const { messages, setMessages, input, handleInputChange, handleSubmit, append, isLoading, data, stop } =
        useChat({
            api: "/api/chat",
            body: {
                chatId: activeChatId
            },
            onResponse: (response) => {
                const newChatId = response.headers.get("x-chat-id");
                if (newChatId && newChatId !== activeChatId) {
                    setActiveChatId(newChatId);
                    // 立即刷新侧边栏以免等待对话结束才显示
                    fetchChats();
                }
            },
            onFinish: () => {
                // Refresh chats list after a message finishes so new chats appear in sidebar
                fetchChats();
            },
            onError: (err) => {
                setChatError(err.message || "请求失败，请检查 API 配置");
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
                    content: msg.content,
                    annotations: msg.tool_invocations?.images
                        ? msg.tool_invocations.images.map((url: string) => ({ type: "image", url }))
                        : undefined,
                }));
                setMessages(formattedMessages);
            } catch (e) {
                console.error(e);
            }
        } else {
            setMessages([]);
        }
    };

    const deleteChat = async (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation();
        setIsDeletingChat(true);
        try {
            const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "删除失败");
            }
            setChats((prev) => prev.filter((c) => c.id !== chatId));
            if (activeChatId === chatId) {
                setActiveChatId(null);
                setMessages([]);
            }
            setPendingDeleteChatId(null);
        } catch (err) {
            console.error("Delete chat error:", err);
        } finally {
            setIsDeletingChat(false);
        }
    };

    const confirmDeleteChat = (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation();
        setPendingDeleteChatId(chatId);
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // 将 File 转为 base64 data URL
    const fileToDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const addImages = useCallback(async (files: FileList | File[]) => {
        const arr = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 4);
        const results = await Promise.all(arr.map(async f => ({ dataUrl: await fileToDataUrl(f), name: f.name })));
        setPendingImages(prev => [...prev, ...results].slice(0, 4));
    }, []);

    // 粘贴图片
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const imageFiles = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
        if (imageFiles.length > 0) addImages(imageFiles);
    }, [addImages]);

    // 拖拽图片到输入框
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
        if (imageFiles.length > 0) addImages(imageFiles);
    }, [addImages]);

    // 自定义提交：若有图片则构造 multimodal content
    const handleFormSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) { stop(); return; }
        if (!input.trim() && pendingImages.length === 0) return;
        setChatError(null);

        if (pendingImages.length > 0) {
            // 构造 multimodal content array（OpenAI vision 格式）
            const imageContent: any[] = [];
            if (input.trim()) imageContent.push({ type: "text", text: input.trim() });
            pendingImages.forEach(img => {
                imageContent.push({ type: "image_url", image_url: { url: img.dataUrl } });
            });
            // 用 append 发送，同时把 imageContent 放进 body 让后端处理
            // 前端消息显示用 annotations 存图片 URL
            append(
                {
                    role: "user",
                    content: input.trim() || "（图片）",
                    annotations: pendingImages.map(img => ({ type: "image", url: img.dataUrl })) as any,
                },
                {
                    body: { chatId: activeChatId, imageContent },
                }
            );
            // 清空 input
            handleInputChange({ target: { value: "" } } as any);
            setPendingImages([]);
        } else {
            handleSubmit(e);
        }
    }, [isLoading, stop, input, pendingImages, append, handleSubmit, handleInputChange, activeChatId]);

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
                            <div className="flex gap-2">
                                <button onClick={() => switchChat(null)} className="flex-1 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[#ececec] text-sm flex items-center justify-center gap-2 font-medium border border-white/5">
                                    <Plus className="w-4 h-4" /> 新建对话
                                </button>
                                <Link href="/knowledge" className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[#ececec] text-sm flex items-center justify-center gap-2 font-medium border border-white/5" title="知识库管理">
                                    <BookOpen className="w-4 h-4" />
                                </Link>
                            </div>

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
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <p className={`truncate ${activeChatId === chat.id ? "font-medium text-white" : ""}`}>{chat.title}</p>
                                                <p className={`text-xs mt-1 ${activeChatId === chat.id ? "text-blue-300/60" : "text-gray-500"}`}>
                                                    {new Date(chat.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => confirmDeleteChat(e, chat.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-opacity flex-shrink-0"
                                                title="删除对话"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 用户信息栏 - Claude 风格 */}
                            <div ref={settingsRef} className="relative mt-auto">
                                <button
                                    type="button"
                                    onClick={() => setIsSettingsOpen(v => !v)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                                >
                                    {/* 头像缩写 */}
                                    <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center flex-shrink-0 text-indigo-300 text-sm font-semibold">
                                        {user?.email?.[0]?.toUpperCase() ?? "?"}
                                    </div>
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="text-sm text-[#e7e7e4] truncate font-medium">
                                            {user?.email?.split("@")[0] ?? "用户"}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{user?.email ?? ""}</p>
                                    </div>
                                    <Settings className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors flex-shrink-0" />
                                </button>

                                <AnimatePresence>
                                    {isSettingsOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute bottom-full left-0 right-0 mb-2 bg-[#2a2a24] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                                        >
                                            {/* 邮箱展示 */}
                                            <div className="px-4 py-3 border-b border-white/5">
                                                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                                            </div>
                                            <div className="p-1">
                                                <button
                                                    type="button"
                                                    onClick={handleSignOut}
                                                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    退出登录
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 删除确认弹框 */}
            <AnimatePresence>
                {pendingDeleteChatId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setPendingDeleteChatId(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="rounded-2xl bg-[#2f2e27] border border-white/10 shadow-xl max-w-sm w-full p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <p className="text-[#e7e7e4] font-medium mb-1">删除对话</p>
                            <p className="text-sm text-gray-400 mb-6">
                                确定要删除「{chats.find((c) => c.id === pendingDeleteChatId)?.title || "该对话"}」吗？删除后无法恢复。
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setPendingDeleteChatId(null)}
                                    className="px-4 py-2 rounded-lg text-gray-400 hover:bg-white/10 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletingChat}
                                    onClick={(e) => { if (pendingDeleteChatId) deleteChat(e, pendingDeleteChatId); }}
                                    className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isDeletingChat ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                                    {isDeletingChat ? "删除中..." : "删除"}
                                </button>
                            </div>
                        </motion.div>
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
                </header>

                {/* 聊天内容区 */}
                <main className="flex-1 overflow-y-auto w-full p-4 sm:p-8 space-y-6 scroll-smooth">
                    <div className="max-w-3xl mx-auto space-y-8 pb-32">
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-2xl">
                                    <div onClick={() => handleInputChange({ target: { value: "今天有什么重要的AI新闻？" } } as any)} className="p-4 rounded-xl bg-[#23221d] border border-white/5 hover:bg-[#2d2c25] cursor-pointer transition text-sm text-[#e7e7e4] flex items-center gap-3">
                                        <Globe className="w-4 h-4 text-[#d48c66] shrink-0" />
                                        <p className="font-medium">今天有什么重要的AI新闻？</p>
                                    </div>
                                    <div onClick={() => handleInputChange({ target: { value: "Next.js 的 App Router 是什么？" } } as any)} className="p-4 rounded-xl bg-[#23221d] border border-white/5 hover:bg-[#2d2c25] cursor-pointer transition text-sm text-[#e7e7e4] flex items-center gap-3">
                                        <Bot className="w-4 h-4 text-gray-400 shrink-0" />
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
                                            className={`min-w-0 max-w-[85%] sm:max-w-[85%] rounded-2xl px-5 py-3.5 font-normal leading-relaxed text-[15px] ${m.role === "user"
                                                ? "bg-[#2d2c25] text-[#ececec] border border-white/5"
                                                : "text-[#ececec]"
                                                }`}
                                        >
                                            {/* Tool 调用可视化气泡 (拦截的 streamEvents 状态) */}
                                            {(() => {
                                                if (!m.annotations || m.annotations.length === 0) return null;
                                                
                                                // 按照 id 进行去重分组，保留最新的状态
                                                // 当一个工具拥有 running 和 complete 两个状态时，只展示 complete
                                                const toolCallsMap = new Map();
                                                m.annotations.forEach((annotation: any) => {
                                                    if (annotation && annotation.type === "tool_call" && annotation.id) {
                                                        // 如果当前已存的是 running 且新来的是 complete，则覆盖
                                                        // 否则直接存入
                                                        const existing = toolCallsMap.get(annotation.id);
                                                        if (!existing || existing.status === "running") {
                                                            toolCallsMap.set(annotation.id, annotation);
                                                        }
                                                    }
                                                });

                                                return Array.from(toolCallsMap.values()).map((annotation: any, index) => {
                                                    const isSearch = annotation.toolName?.includes("search");
                                                    const isKnowledge = annotation.toolName?.includes("knowledge");
                                                    const isRunning = annotation.status === "running";
                                                    
                                                    return (
                                                        <motion.div 
                                                            key={`${annotation.id}-${index}`}
                                                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                                            animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
                                                            className="p-3 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-2 text-xs text-white/80 font-mono shadow-inner backdrop-blur-sm"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isKnowledge ? (
                                                                    <BookOpen className={`w-4 h-4 ${isRunning ? "text-indigo-400 animate-pulse" : "text-emerald-400"}`} />
                                                                ) : (
                                                                    <Globe className={`w-4 h-4 ${isRunning ? "text-blue-400 animate-pulse" : "text-emerald-400"}`} />
                                                                )}
                                                                <span className="font-semibold text-white/90">
                                                                    {isRunning ? "Agent is calling " : "Agent called "}
                                                                    <span className={isKnowledge ? "text-indigo-300" : "text-blue-300"}>{annotation.toolName}</span>
                                                                </span>
                                                                {!isRunning && <span className="ml-auto text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/20">SUCCESS</span>}
                                                            </div>
                                                            {annotation.toolInput && isRunning && (
                                                                <div className="text-gray-400 break-words opacity-70 mt-1 pl-6">
                                                                    Input: {JSON.stringify(annotation.toolInput)}
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    );
                                                });
                                            })()}
                                            {m.role === "user" ? (
                                                <div className="prose prose-invert prose-sm sm:prose-base max-w-none 
                                                    prose-p:leading-relaxed prose-p:mb-3 
                                                    prose-img:max-h-60 prose-img:rounded-lg prose-img:object-contain prose-img:my-2
                                                    break-words"
                                                >
                                                    {/* 渲染图片附件（存在 annotations 中） */}
                                                    {(() => {
                                                        const imgs = (m.annotations as any[])?.filter((a: any) => a?.type === "image");
                                                        if (!imgs?.length) return null;
                                                        return (
                                                            <div className="flex flex-wrap gap-2 mb-2">
                                                                {imgs.map((img: any, i: number) => (
                                                                    <img key={i} src={img.url} alt="附件图片" className="max-h-48 max-w-xs rounded-xl object-cover border border-white/10" />
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                        {typeof m.content === "string" ? m.content : (m.content as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ")}
                                                    </ReactMarkdown>
                                                </div>
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
                                                                        components={{
                                                                            code({ node, className, children, ...props }: any) {
                                                                                const match = /language-(\w+)/.exec(className || '');
                                                                                const lang = match?.[1];
                                                                                const isInline = !className;

                                                                                // Mermaid 图表渲染
                                                                                if (lang === 'mermaid') {
                                                                                    return <MermaidChart chart={String(children).replace(/\n$/, '')} />;
                                                                                }

                                                                                return !isInline && match ? (
                                                                                    <SyntaxHighlighter
                                                                                        style={oneDark}
                                                                                        language={lang}
                                                                                        PreTag="div"
                                                                                        customStyle={{
                                                                                            margin: '0.75rem 0',
                                                                                            borderRadius: '0.75rem',
                                                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                                                            fontSize: '0.85rem',
                                                                                        }}
                                                                                        {...props}
                                                                                    >
                                                                                        {String(children).replace(/\n$/, '')}
                                                                                    </SyntaxHighlighter>
                                                                                ) : (
                                                                                    <code className={className} {...props}>
                                                                                        {children}
                                                                                    </code>
                                                                                );
                                                                            }
                                                                        }}
                                                                    >
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

                        {/* 错误提示 */}
                        <AnimatePresence>
                            {chatError && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    className="mb-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center justify-between gap-3"
                                >
                                    <span>{chatError}</span>
                                    <button type="button" onClick={() => setChatError(null)} className="text-red-400 hover:text-red-200 flex-shrink-0">
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <form
                            onSubmit={handleFormSubmit}
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            className="relative flex flex-col w-full rounded-2xl overflow-hidden bg-[#2f2e27] transition duration-300 border border-white/5 focus-within:border-white/20"
                        >
                            {/* 图片预览区 */}
                            {pendingImages.length > 0 && (
                                <div className="flex flex-wrap gap-2 px-4 pt-3">
                                    {pendingImages.map((img, i) => (
                                        <div key={i} className="relative group">
                                            <img
                                                src={img.dataUrl}
                                                alt={img.name}
                                                className="h-16 w-16 object-cover rounded-xl border border-white/10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1e1e19] border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                                            >
                                                <X className="w-3 h-3 text-gray-300" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center w-full">
                                {/* 图片上传按钮 */}
                                <button
                                    type="button"
                                    onClick={() => imageInputRef.current?.click()}
                                    disabled={isLoading || pendingImages.length >= 4}
                                    className="ml-3 p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                                    title="上传图片（最多4张）"
                                >
                                    <ImagePlus className="w-5 h-5" />
                                </button>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => e.target.files && addImages(e.target.files)}
                                />
                                <input
                                    className="flex-1 bg-transparent px-4 py-4 text-[#e7e7e4] placeholder:text-gray-500 focus:outline-none focus:ring-0 text-[15px]"
                                    value={input}
                                    placeholder="How can I help you today?"
                                    onChange={handleInputChange}
                                    onPaste={handlePaste}
                                    disabled={isLoading}
                                />
                                <button
                                    type="submit"
                                    className={`m-2 p-2 rounded-lg transition-all relative ${
                                        isLoading
                                            ? "bg-white/10 hover:bg-white/20 text-white"
                                            : "bg-[#534032] hover:bg-[#6c5442] text-[#d48c66] disabled:opacity-50 disabled:cursor-not-allowed"
                                    }`}
                                    disabled={!isLoading && !input && pendingImages.length === 0}
                                >
                                    {isLoading ? (
                                        <>
                                            {/* Claude 风格：外圆进度环 + 中间方形 Stop 图标 */}
                                            <span className="absolute inset-0 rounded-lg border-2 border-white/30 animate-ping" />
                                            <svg className="w-4 h-4 relative z-10" viewBox="0 0 16 16" fill="currentColor">
                                                <rect x="3" y="3" width="10" height="10" rx="2" />
                                            </svg>
                                        </>
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                {/* End of Main Chat Area */}
            </div>
        </div>
    );
}
