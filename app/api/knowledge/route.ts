import { NextResponse } from "next/server";
import { listKnowledgeSources, deleteDocumentsBySource, deleteManifestBySource } from "../../../lib/knowledge-db";

export async function GET() {
    try {
        const items = await listKnowledgeSources();
        return NextResponse.json(items);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to list knowledge";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const source = typeof body?.source === "string" ? body.source : null;
        if (!source) {
            return NextResponse.json(
                { error: "Missing body.source (string)" },
                { status: 400 }
            );
        }
        const deleted = await deleteDocumentsBySource(source);
        await deleteManifestBySource(source);
        return NextResponse.json({ deleted });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
