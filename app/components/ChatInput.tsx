"use client";

import { RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ImagePlus, X } from "lucide-react";

interface ChatInputProps {
    input: string;
    isLoading: boolean;
    pendingImages: { dataUrl: string; name: string }[];
    chatError: string | null;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSubmit: (e: React.FormEvent) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onAddImages: (files: FileList) => void;
    onRemoveImage: (index: number) => void;
    onClearError: () => void;
    imageInputRef: RefObject<HTMLInputElement | null>;
}

export default function ChatInput({
    input,
    isLoading,
    pendingImages,
    chatError,
    onInputChange,
    onSubmit,
    onPaste,
    onDrop,
    onAddImages,
    onRemoveImage,
    onClearError,
    imageInputRef,
}: ChatInputProps) {
    return (
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
                            <button type="button" onClick={onClearError} className="text-red-400 hover:text-red-200 flex-shrink-0">
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <form
                    onSubmit={onSubmit}
                    onDrop={onDrop}
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
                                        onClick={() => onRemoveImage(i)}
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
                            onChange={(e) => e.target.files && onAddImages(e.target.files)}
                        />
                        <input
                            className="flex-1 bg-transparent px-4 py-4 text-[#e7e7e4] placeholder:text-gray-500 focus:outline-none focus:ring-0 text-[15px]"
                            value={input}
                            placeholder="How can I help you today?"
                            onChange={onInputChange}
                            onPaste={onPaste}
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
    );
}
