"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, BookOpen, Trash2, LogOut, Settings } from "lucide-react";

interface Chat {
    id: string;
    title: string;
    created_at: string;
}

interface ChatSidebarProps {
    chats: Chat[];
    activeChatId: string | null;
    user: { email?: string | null } | null;
    onSwitchChat: (chatId: string | null) => void;
    onDeleteChat: (e: React.MouseEvent, chatId: string) => void;
    onSignOut: () => void;
}

export default function ChatSidebar({
    chats,
    activeChatId,
    user,
    onSwitchChat,
    onDeleteChat,
    onSignOut,
}: ChatSidebarProps) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

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

    return (
        <div className="p-4 flex flex-col gap-5 w-[280px] h-full">
            <div className="flex gap-2">
                <button onClick={() => onSwitchChat(null)} className="flex-1 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-[#ececec] text-sm flex items-center justify-center gap-2 font-medium border border-white/5">
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
                            onClick={() => onSwitchChat(chat.id)}
                            className={`p-3 rounded-xl cursor-pointer flex items-start gap-3 text-sm transition-all group ${
                                activeChatId === chat.id
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
                                onClick={(e) => onDeleteChat(e, chat.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-opacity flex-shrink-0"
                                title="删除对话"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 用户信息栏 */}
            <div ref={settingsRef} className="relative mt-auto">
                <button
                    type="button"
                    onClick={() => setIsSettingsOpen(v => !v)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
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
                            <div className="px-4 py-3 border-b border-white/5">
                                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                            </div>
                            <div className="p-1">
                                <button
                                    type="button"
                                    onClick={onSignOut}
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
    );
}
