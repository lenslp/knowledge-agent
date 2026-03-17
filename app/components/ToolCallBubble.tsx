"use client";

import { motion } from "framer-motion";
import { Globe, BookOpen } from "lucide-react";

interface ToolCallAnnotation {
    type: string;
    toolName: string;
    status: string;
    toolInput?: any;
    toolOutput?: string;
    id: string;
}

export default function ToolCallBubble({ annotation }: { annotation: ToolCallAnnotation }) {
    const isSearch = annotation.toolName?.includes("search");
    const isKnowledge = annotation.toolName?.includes("knowledge");
    const isRunning = annotation.status === "running";

    return (
        <motion.div
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
}
