import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../lib/supabase-server";
import { getKnowledgeSourceDetail } from "../../../../lib/knowledge-db";

export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const source = searchParams.get("source");

        if (!source) {
            return NextResponse.json({ error: "Missing query param: source" }, { status: 400 });
        }

        const detail = await getKnowledgeSourceDetail(source, user.id);
        if (!detail) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json(detail);
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load knowledge detail" },
            { status: 500 }
        );
    }
}
