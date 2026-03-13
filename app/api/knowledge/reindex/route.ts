import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import {
    deleteDocumentsBySource,
    ingestOneFile,
    computeFileHash,
} from "../../../../lib/knowledge";
import { upsertManifest } from "../../../../lib/knowledge-db";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const source = typeof body?.source === "string" ? body.source : null;
        if (!source) {
            return NextResponse.json(
                { error: "Missing body.source (string)" },
                { status: 400 }
            );
        }
        const knowledgeDir = path.resolve(process.cwd(), "knowledge");
        const resolved = path.resolve(source);
        if (!resolved.startsWith(knowledgeDir + path.sep)) {
            return NextResponse.json(
                { error: "Source must be within knowledge/ directory" },
                { status: 403 }
            );
        }
        if (!fs.existsSync(resolved)) {
            return NextResponse.json(
                { error: "File not found on server" },
                { status: 400 }
            );
        }
        await deleteDocumentsBySource(source);
        const buffer = fs.readFileSync(source);
        const filename = path.basename(source);
        const { chunks } = await ingestOneFile(buffer, filename, {
            sourceLabel: source,
        });
        const fileHash = computeFileHash(buffer);
        await upsertManifest(source, fileHash);
        return NextResponse.json({ ok: true, filename, chunks });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Reindex failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
