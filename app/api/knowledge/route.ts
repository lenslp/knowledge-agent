import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/supabase-server";
import { listKnowledgeSources, deleteDocumentsBySource, deleteManifestBySource } from "../../../lib/knowledge-db";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const items = await listKnowledgeSources(user.id);
        return NextResponse.json(items);
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const source = typeof body?.source === "string" ? body.source : null;
        if (!source) return NextResponse.json({ error: "Missing body.source" }, { status: 400 });

        const deleted = await deleteDocumentsBySource(source, user.id);
        await deleteManifestBySource(source, user.id);
        return NextResponse.json({ deleted });
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
