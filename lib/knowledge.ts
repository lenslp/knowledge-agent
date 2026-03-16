import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { Embeddings } from "@langchain/core/embeddings";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import * as path from "path";
import { prisma } from "./prisma";
import { deleteDocumentsBySource as _deleteBySource, listKnowledgeSources as _listSources } from "./knowledge-db";

export const deleteDocumentsBySource = _deleteBySource;
export const listKnowledgeSources = _listSources;

/** 计算文件内容 SHA-256 哈希（用于增量更新：未变更则跳过） */
export function computeFileHash(buffer: Buffer): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

const ALLOWED_EXT = [".txt", ".md", ".pdf", ".docx", ".json"];

function extractJsonText(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map(extractJsonText).filter(Boolean).join("\n");
    if (typeof obj === "object" && obj !== null) {
        return Object.values(obj).map(extractJsonText).filter(Boolean).join("\n");
    }
    return "";
}

/** 使用 pdfjs-dist 在 Node 环境提取 PDF 文本（无需 canvas） */
async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { pathToFileURL } = await import("url");
    const workerPath = path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
        "legacy",
        "build",
        "pdf.worker.mjs"
    );
    (pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const numPages = doc.numPages;
    const parts: string[] = [];
    for (let i = 1; i <= numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
            .map((item: unknown) => (item && typeof item === "object" && "str" in item ? String((item as { str: string }).str) : ""))
            .join(" ");
        parts.push(pageText);
    }
    return parts.join("\n\n").trim() || "";
}

/** 根据 buffer + 文件名解析为单个 Document（未分块） */
export async function parseFileToDocument(
    buffer: Buffer,
    filename: string,
    options?: { sourceLabel?: string }
): Promise<Document | null> {
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return null;

    const sourceLabel = options?.sourceLabel ?? filename;

    if (ext === ".txt" || ext === ".md") {
        const text = buffer.toString("utf-8");
        return new Document({ pageContent: text, metadata: { source: sourceLabel } });
    }
    if (ext === ".pdf") {
        const text = await extractTextFromPdfBuffer(buffer);
        return new Document({
            pageContent: text,
            metadata: { source: sourceLabel },
        });
    }
    if (ext === ".docx") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        return new Document({
            pageContent: result.value,
            metadata: { source: sourceLabel },
        });
    }
    if (ext === ".json") {
        const raw = buffer.toString("utf-8");
        const json = JSON.parse(raw) as unknown;
        const text = extractJsonText(json);
        return new Document({ pageContent: text, metadata: { source: sourceLabel } });
    }
    return null;
}

/** 根据本地文件路径解析为 Document（未分块） */
export async function parseFilePathToDocument(filePath: string): Promise<Document | null> {
    const fs = await import("fs");
    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    return parseFileToDocument(buffer, filename, { sourceLabel: filePath });
}

const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // 每块约 1000 字符
    chunkOverlap: 200, // 相邻块重叠 200 字符
});

export function getTextSplitter() {
    return textSplitter;
}

/** 千问 text-embedding-v3 嵌入，供 ingest 与 API 共用 */
export class CustomMiniMaxEmbeddings extends Embeddings {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string) {
        super({});
        this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? "";
        this.baseUrl = process.env.OPENAI_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        for (const text of texts) {
            const res = await this.embedQuery(text);
            results.push(res);
        }
        return results;
    }

    async embedQuery(text: string): Promise<number[]> {
        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "text-embedding-v3",
                input: text,
                encoding_format: "float",
                dimensions: 1024,
            }),
        });
        const data = (await response.json()) as { data?: { embedding: number[] }[] };
        if (!data.data?.[0]?.embedding) {
            throw new Error(`Embedding API error: ${JSON.stringify(data)}`);
        }
        return data.data[0].embedding;
    }
}

function getSupabaseClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return createClient(url, key);
}

/** 将已分块的 docs 向量化并写入 Supabase */
export async function addDocumentsToVectorStore(docs: Document[]): Promise<void> {
    if (docs.length === 0) return;
    const client = getSupabaseClient();
    const embeddings = new CustomMiniMaxEmbeddings();
    const vectorStore = new SupabaseVectorStore(embeddings, {
        client,
        tableName: "documents",
        queryName: "match_documents",
    });
    await vectorStore.addDocuments(docs);
}

/** 单文件入库：解析 → 分块 → 向量化入库 */
export async function ingestOneFile(
    buffer: Buffer,
    filename: string,
    options?: { sourceLabel?: string }
): Promise<{ chunks: number }> {
    // 解析文件
    const doc = await parseFileToDocument(buffer, filename, options);
    if (!doc) throw new Error(`Unsupported file type: ${path.extname(filename)}`);
    // 分块
    const docs = await textSplitter.splitDocuments([doc]);
    // 向量化入库
    await addDocumentsToVectorStore(docs);
    return { chunks: docs.length };
}
