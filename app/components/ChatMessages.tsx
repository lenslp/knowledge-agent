"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Globe, Bot, Loader2 } from "lucide-react";
import MessageBubble from "./MessageBubble";

import type { Message } from "ai";

interface ChatMessagesProps {
    messages: Message[];
    isLoading: boolean;
    onSuggestionClick: (text: string) => void;
}

export default function ChatMessages({ messages, isLoading, onSuggestionClick }: ChatMessagesProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
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
                            <span>有什么可以帮你？</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-2xl">
                            <div onClick={() => onSuggestionClick("今天有什么重要的AI新闻？")} className="p-4 rounded-xl bg-[#23221d] border border-white/5 hover:bg-[#2d2c25] cursor-pointer transition text-sm text-[#e7e7e4] flex items-center gap-3">
                                <Globe className="w-4 h-4 text-[#d48c66] shrink-0" />
                                <p className="font-medium">今天有什么重要的AI新闻？</p>
                            </div>
                            <div onClick={() => onSuggestionClick("Next.js 的 App Router 是什么？")} className="p-4 rounded-xl bg-[#23221d] border border-white/5 hover:bg-[#2d2c25] cursor-pointer transition text-sm text-[#e7e7e4] flex items-center gap-3">
                                <Bot className="w-4 h-4 text-gray-400 shrink-0" />
                                <p className="font-medium">Next.js 的 App Router 是什么？</p>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <AnimatePresence>
                        {messages.map((m) => (
                            <MessageBubble key={m.id} message={m} />
                        ))}
                    </AnimatePresence>
                )}

                {isLoading && messages[messages.length - 1]?.role === "user" && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex gap-4"
                    >
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
    );
}
