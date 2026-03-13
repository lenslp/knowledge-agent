"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BookOpen,
    Upload,
    Trash2,
    RefreshCw,
    ArrowLeft,
    FileText,
    Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type DocItem = { source: string; filename: string; chunkCount: number };

export default function KnowledgePage() {
    const [list, setList] = useState<DocItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [actioning, setActioning] = useState<{ source: string; type: "delete" | "reindex" } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchList = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/knowledge");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || res.statusText);
            }
            const data = await res.json();
            setList(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败");
            setList([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchList();
    }, []);

    const handleUpload = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        setError(null);
        let ok = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            if (!["txt", "md", "pdf", "docx", "json"].includes(ext)) continue;
            try {
                const form = new FormData();
                form.append("file", file);
                const res = await fetch("/api/knowledge/upload", {
                    method: "POST",
                    body: form,
                });
                const data = await res.json();
                if (res.ok && data?.ok) ok++;
            } catch {
                // skip
            }
        }
        setUploading(false);
        if (ok > 0) fetchList();
    };

    const handleDelete = async (source: string) => {
        setActioning({ source, type: "delete" });
        setError(null);
        try {
            const res = await fetch("/api/knowledge", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "删除失败");
            setList((prev) => prev.filter((x) => x.source !== source));
        } catch (e) {
            setError(e instanceof Error ? e.message : "删除失败");
        } finally {
            setActioning(null);
        }
    };

    const handleReindex = async (source: string) => {
        setActioning({ source, type: "reindex" });
        setError(null);
        try {
            const res = await fetch("/api/knowledge/reindex", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "重新索引失败");
            await fetchList();
        } catch (e) {
            setError(e instanceof Error ? e.message : "重新索引失败");
        } finally {
            setActioning(null);
        }
    };

    const isActioning = (source: string, type: "delete" | "reindex") =>
        actioning?.source === source && actioning?.type === type;

    return (
        <div className="min-h-screen bg-[#1e1e19] text-[#ececec] font-sans">
            <header className="sticky top-0 z-10 border-b border-white/5 bg-[#1e1e19]/95 backdrop-blur">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <BookOpen className="w-6 h-6 text-[#d48c66]" />
                            <h1 className="text-lg font-serif tracking-tight text-[#e7e7e4]">
                                知识库管理
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
                {error && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {/* 上传区 */}
                <section>
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        上传文档
                    </h2>
                    <label
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            handleUpload(e.dataTransfer.files);
                        }}
                        className={`flex flex-col items-center justify-center w-full h-40 rounded-2xl border-2 border-dashed transition-colors cursor-pointer ${
                            dragOver
                                ? "border-[#d48c66] bg-[#d48c66]/10"
                                : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
                    >
                        <input
                            type="file"
                            multiple
                            accept=".txt,.md,.pdf,.docx,.json"
                            className="hidden"
                            onChange={(e) => handleUpload(e.target.files)}
                            disabled={uploading}
                        />
                        {uploading ? (
                            <Loader2 className="w-10 h-10 text-[#d48c66] animate-spin mb-2" />
                        ) : (
                            <Upload className="w-10 h-10 text-gray-500 mb-2" />
                        )}
                        <span className="text-sm text-gray-400">
                            {uploading
                                ? "正在解析并向量化…"
                                : "拖拽文件到此处，或点击选择（支持 .txt / .md / .pdf / .docx / .json）"}
                        </span>
                    </label>
                </section>

                {/* 文档列表 */}
                <section>
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        已入库文档
                    </h2>
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-[#d48c66] animate-spin" />
                        </div>
                    ) : list.length === 0 ? (
                        <div className="rounded-2xl border border-white/5 bg-white/5 py-16 text-center text-gray-500 text-sm">
                            暂无文档，请先上传或运行 <code className="px-1.5 py-0.5 rounded bg-white/10">npx tsx scripts/ingest.ts</code>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            <AnimatePresence>
                                {list.map((item) => (
                                    <motion.li
                                        key={item.source}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="flex items-center gap-4 p-4 rounded-xl bg-[#23221d] border border-white/5 hover:border-white/10"
                                    >
                                        <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-[#e7e7e4] truncate">
                                                {item.filename}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {item.chunkCount} 个片段
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleReindex(item.source)}
                                                disabled={actioning !== null}
                                                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
                                                title="重新索引"
                                            >
                                                {isActioning(item.source, "reindex") ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="w-4 h-4" />
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(item.source)}
                                                disabled={actioning !== null}
                                                className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                                                title="删除"
                                            >
                                                {isActioning(item.source, "delete") ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </ul>
                    )}
                </section>
            </main>
        </div>
    );
}
