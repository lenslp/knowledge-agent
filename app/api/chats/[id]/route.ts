import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id: chatId } = await params;
        // 验证该 chat 属于当前用户
        const chat = await prisma.chat.findFirst({ where: { id: chatId, user_id: user.id } });
        if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const data = await prisma.message.findMany({
            where: { chat_id: chatId },
            select: { id: true, role: true, content: true, tool_invocations: true, created_at: true },
            orderBy: { created_at: "asc" }
        });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to fetch" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { id: chatId } = await params;
        // 只能删除自己的 chat
        const chat = await prisma.chat.findFirst({ where: { id: chatId, user_id: user.id } });
        if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

        await prisma.chat.delete({ where: { id: chatId } });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to delete" },
            { status: 500 }
        );
    }
}
