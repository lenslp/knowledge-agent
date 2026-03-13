import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { ingestOneFile, computeFileHash, deleteDocumentsBySource } from "../../../../lib/knowledge";
import { getManifestHash, upsertManifest } from "../../../../lib/knowledge-db";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { error: "Missing or invalid field: file" },
                { status: 400 }
            );
        }
        // 只替换文件系统非法字符，保留中文等 Unicode 字符
        const sanitized = file.name.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
        const filename = sanitized || "document";
        const buffer = Buffer.from(await file.arrayBuffer());
        const knowledgeDir = path.join(process.cwd(), "knowledge");
        if (!fs.existsSync(knowledgeDir)) {
            fs.mkdirSync(knowledgeDir, { recursive: true });
        }
        const filePath = path.join(knowledgeDir, filename);
        fs.writeFileSync(filePath, buffer);
        const sourceLabel = filePath;
        const fileHash = computeFileHash(buffer);
        const existingHash = await getManifestHash(sourceLabel);
        if (existingHash === fileHash) {
            return NextResponse.json({ ok: true, filename, chunks: 0, skipped: true });
        }
        await deleteDocumentsBySource(sourceLabel);
        const { chunks } = await ingestOneFile(buffer, filename, { sourceLabel });
        await upsertManifest(sourceLabel, fileHash);
        return NextResponse.json({ ok: true, filename, chunks });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Upload failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
