"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface DeleteConfirmDialogProps {
    chatTitle: string;
    isDeleting: boolean;
    onConfirm: (e: React.MouseEvent) => void;
    onCancel: () => void;
}

export default function DeleteConfirmDialog({
    chatTitle,
    isDeleting,
    onConfirm,
    onCancel,
}: DeleteConfirmDialogProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
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
                    确定要删除「{chatTitle}」吗？删除后无法恢复。
                </p>
                <div className="flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-gray-400 hover:bg-white/10 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={isDeleting}
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                        {isDeleting ? "删除中..." : "删除"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
