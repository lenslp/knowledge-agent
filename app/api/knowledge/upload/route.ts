import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { getCurrentUser } from "../../../../lib/supabase-server";
import { ingestOneFile, computeFileHash, deleteDocumentsBySource } from "../../../../lib/knowledge";
import { getManifestHash, upsertManifest } from "../../../../lib/knowledge-db";

export const maxDuration = 60;

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Missing or invalid field: file" }, { status: 400 });
        }

        const sanitized = file.name
            .replace(/[/\\:*?"<>|\x00-\x1f]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "") || "document";

        const buffer = Buffer.from(await file.arrayBuffer());

        // 按用户隔离存储目录
        const knowledgeDir = path.join(process.cwd(), "knowledge", user.id);
        if (!fs.existsSync(knowledgeDir)) fs.mkdirSync(knowledgeDir, { recursive: true });

        const filePath = path.join(knowledgeDir, sanitized);
        fs.writeFileSync(filePath, buffer);

        const sourceLabel = filePath;
        const fileHash = computeFileHash(buffer);
        const existingHash = await getManifestHash(sourceLabel, user.id);

        if (existingHash === fileHash) {
            return NextResponse.json({ ok: true, filename: sanitized, chunks: 0, skipped: true });
        }

        await deleteDocumentsBySource(sourceLabel, user.id);
        const { chunks } = await ingestOneFile(buffer, sanitized, { sourceLabel, userId: user.id });
        await upsertManifest(sourceLabel, fileHash, user.id);

        return NextResponse.json({ ok: true, filename: sanitized, chunks });
    } catch (e: unknown) {
        console.error("[upload error]", e);
        return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
    }
}
