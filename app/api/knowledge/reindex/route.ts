import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { getCurrentUser } from "../../../../lib/supabase-server";
import { deleteDocumentsBySource, ingestOneFile, computeFileHash } from "../../../../lib/knowledge";
import { upsertManifest } from "../../../../lib/knowledge-db";

export const maxDuration = 60;

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const source = typeof body?.source === "string" ? body.source : null;
        if (!source) return NextResponse.json({ error: "Missing body.source" }, { status: 400 });

        // 确保文件在当前用户目录下
        const userKnowledgeDir = path.resolve(process.cwd(), "knowledge", user.id);
        const resolved = path.resolve(source);
        if (!resolved.startsWith(userKnowledgeDir + path.sep)) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
        if (!fs.existsSync(resolved)) {
            return NextResponse.json({ error: "File not found" }, { status: 400 });
        }

        await deleteDocumentsBySource(source, user.id);
        const buffer = fs.readFileSync(source);
        const filename = path.basename(source);
        const { chunks } = await ingestOneFile(buffer, filename, { sourceLabel: source, userId: user.id });
        await upsertManifest(source, computeFileHash(buffer), user.id);

        return NextResponse.json({ ok: true, filename, chunks });
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Reindex failed" }, { status: 500 });
    }
}
