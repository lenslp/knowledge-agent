import { prisma } from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const data = await prisma.chat.findMany({
            where: { user_id: user.id },
            select: { id: true, title: true, created_at: true },
            orderBy: { created_at: "desc" }
        });
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
