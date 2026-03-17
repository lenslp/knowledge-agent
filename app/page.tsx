"use client";

import { useChat } from "ai/react";
import { Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "katex/dist/katex.min.css";

import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import ChatSidebar from "./components/ChatSidebar";
import DeleteConfirmDialog from "./components/DeleteConfirmDialog";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";

export default function ChatPage() {
    const [chats, setChats] = useState<{ id: string; title: string; created_at: string }[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null);
    const [isDeletingChat, setIsDeletingChat] = useState(false);
    const [pendingImages, setPendingImages] = useState<{ dataUrl: string; name: string }[]>([]);
    const [chatError, setChatError] = useState<string | null>(null);
    const [user, setUser] = useState<{ email?: string | null } | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const supabase = getSupabaseBrowserClient();

    // ── Auth ──
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = "/login";
    };

    useEffect(() => {
        supabase.auth.getUser().then(({ data }: { data: { user: { email?: string | null } | null } }) => setUser(data.user));
    }, [supabase]);

    // ── Chat hook ──
    const { messages, setMessages, input, handleInputChange, handleSubmit, append, isLoading, stop } =
        useChat({
            api: "/api/chat",
            body: { chatId: activeChatId },
            onResponse: (response) => {
                const newChatId = response.headers.get("x-chat-id");
                if (newChatId && newChatId !== activeChatId) {
                    setActiveChatId(newChatId);
                    fetchChats();
                }
            },
            onFinish: () => fetchChats(),
            onError: (err) => setChatError(err.message || "请求失败，请检查 API 配置"),
        });

    // ── Chats CRUD ──
    const fetchChats = async () => {
        try {
            const res = await fetch("/api/chats");
            const data = await res.json();
            setChats(Array.isArray(data) ? data : []);
        } catch {
            setChats([]);
        }
    };

    useEffect(() => { fetchChats(); }, []);

    const switchChat = async (chatId: string | null) => {
        setActiveChatId(chatId);
        if (chatId) {
            try {
                const res = await fetch(`/api/chats/${chatId}`);
                const data = await res.json();
                setMessages(data.map((msg: any) => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    annotations: msg.tool_invocations?.images
                        ? msg.tool_invocations.images.map((url: string) => ({ type: "image", url }))
                        : undefined,
                })));
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
            if (!res.ok) throw new Error("删除失败");
            setChats((prev) => prev.filter((c) => c.id !== chatId));
            if (activeChatId === chatId) { setActiveChatId(null); setMessages([]); }
            setPendingDeleteChatId(null);
        } catch (err) {
            console.error(err);
        } finally {
            setIsDeletingChat(false);
        }
    };

    // ── Images ──
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

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const imageFiles = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
        if (imageFiles.length > 0) addImages(imageFiles);
    }, [addImages]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
        if (imageFiles.length > 0) addImages(imageFiles);
    }, [addImages]);

    // ── Submit ──
    const handleFormSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) { stop(); return; }
        if (!input.trim() && pendingImages.length === 0) return;
        setChatError(null);

        if (pendingImages.length > 0) {
            const imageContent: any[] = [];
            if (input.trim()) imageContent.push({ type: "text", text: input.trim() });
            pendingImages.forEach(img => {
                imageContent.push({ type: "image_url", image_url: { url: img.dataUrl } });
            });
            append(
                {
                    role: "user",
                    content: input.trim() || "（图片）",
                    annotations: pendingImages.map(img => ({ type: "image", url: img.dataUrl })) as any,
                },
                { body: { chatId: activeChatId, imageContent } }
            );
            handleInputChange({ target: { value: "" } } as any);
            setPendingImages([]);
        } else {
            handleSubmit(e);
        }
    }, [isLoading, stop, input, pendingImages, append, handleSubmit, handleInputChange, activeChatId]);

    // ── Render ──
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
                        <ChatSidebar
                            chats={chats}
                            activeChatId={activeChatId}
                            user={user}
                            onSwitchChat={switchChat}
                            onDeleteChat={(e, chatId) => { e.stopPropagation(); setPendingDeleteChatId(chatId); }}
                            onSignOut={handleSignOut}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete confirm dialog */}
            <AnimatePresence>
                {pendingDeleteChatId && (
                    <DeleteConfirmDialog
                        chatTitle={chats.find((c) => c.id === pendingDeleteChatId)?.title || "该对话"}
                        isDeleting={isDeletingChat}
                        onConfirm={(e) => deleteChat(e, pendingDeleteChatId)}
                        onCancel={() => setPendingDeleteChatId(null)}
                    />
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden relative transition-all duration-300 bg-[#1e1e19]">
                {/* Header */}
                <header className="px-6 py-4 flex items-center justify-between z-10 sticky top-0 border-b border-transparent">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-300"
                        >
                            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                        </button>
                        <h1 className="text-lg font-serif tracking-tight text-[#e7e7e4] flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#e7e7e4]/70" />
                            Knowledge Agent
                        </h1>
                    </div>
                </header>

                <ChatMessages
                    messages={messages}
                    isLoading={isLoading}
                    onSuggestionClick={(text) => handleInputChange({ target: { value: text } } as any)}
                />

                <ChatInput
                    input={input}
                    isLoading={isLoading}
                    pendingImages={pendingImages}
                    chatError={chatError}
                    onInputChange={handleInputChange}
                    onSubmit={handleFormSubmit}
                    onPaste={handlePaste}
                    onDrop={handleDrop}
                    onAddImages={(files) => addImages(files)}
                    onRemoveImage={(i) => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                    onClearError={() => setChatError(null)}
                    imageInputRef={imageInputRef}
                />
            </div>
        </div>
    );
}
