"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;

function ensureInitialized() {
    if (!initialized) {
        initialized = true;
        mermaid.initialize({
            startOnLoad: false,
            suppressErrorRendering: true,
            theme: "dark",
            themeVariables: {
                primaryColor: "#1e3a5f",
                primaryTextColor: "#e7e7e4",
                primaryBorderColor: "#3b82f6",
                lineColor: "#6b8bad",
                secondaryColor: "#2d2c25",
                tertiaryColor: "#23221d",
                background: "#1e1e19",
                mainBkg: "#1e3a5f",
                nodeBorder: "#3b82f6",
                clusterBkg: "#23221d",
                titleColor: "#e7e7e4",
                edgeLabelBackground: "#23221d",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }
        });
    }
}

let mermaidCounter = 0;

export default function MermaidChart({ chart }: { chart: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    // 初始用 null 表示"尚未触发渲染"，骨架图一直显示到首次成功为止
    const [svg, setSvg] = useState<string | null>(null);
    // 防止同一 chart 内容被多次渲染（debounce 计时器）
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 保留最后一次成功的 SVG 避免闪白
    const lastSvgRef = useRef<string | null>(null);

    useEffect(() => {
        ensureInitialized();

        // 如果已有上一次的结果，先保持显示（不重置成 null 闪烁）
        // 只在第一次 (lastSvgRef 为 null) 时才显示骨架屏
        if (lastSvgRef.current) {
            setSvg(lastSvgRef.current);
        }

        // 清除上一个 debounce 定时器
        if (timerRef.current) clearTimeout(timerRef.current);

        // 等内容 500ms 不变化后再渲染
        timerRef.current = setTimeout(async () => {
            const id = `mermaid-${++mermaidCounter}-${Date.now()}`;
            try {
                await mermaid.parse(chart);
                const { svg } = await mermaid.render(id, chart);
                if (svg.includes("Syntax error")) {
                    setError("图表语法存在错误");
                } else {
                    lastSvgRef.current = svg;
                    setSvg(svg);
                    setError(null);
                }
            } catch (err: any) {
                // 流式生成过程中内容不完整会出错，直接忽略，保持上一次结果
                // 只有在内容稳定后仍然失败才显示错误
                setError(err?.message || "Mermaid 图表语法错误");
            }
        }, 500);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [chart]);

    if (svg) {
        return (
            <div
                ref={ref}
                className="my-3 p-4 rounded-xl bg-[#0d1117]/80 border border-white/10 overflow-x-auto flex justify-center"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        );
    }

    if (error && !lastSvgRef.current) {
        return (
            <div className="my-3 rounded-xl overflow-hidden border border-yellow-500/30">
                <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 text-yellow-400 text-xs font-semibold">
                    ⚠️ 图表渲染失败（语法错误），原始代码：
                </div>
                <pre className="p-3 bg-black/40 text-gray-300 text-xs overflow-x-auto font-mono">
                    {chart}
                </pre>
            </div>
        );
    }

    // 骨架占位（首次加载 / 流式生成期间）
    return (
        <div className="my-3 p-4 rounded-xl bg-black/20 border border-white/5 flex items-center justify-center h-20 text-gray-500 text-xs gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="inline-block w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="inline-block w-2 h-2 rounded-full bg-gray-500 animate-bounce" />
        </div>
    );
}
