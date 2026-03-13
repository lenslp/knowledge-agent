import { prisma } from "../../../../lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: chatId } = await params;
        if (!chatId) {
            return NextResponse.json({ error: "No chat ID provided" }, { status: 400 });
        }

        // Fetch messages for this specific chat, ordered by creation time
        const data = await prisma.message.findMany({
            where: { chat_id: chatId },
            select: { id: true, role: true, content: true, created_at: true },
            orderBy: { created_at: "asc" }
        });

        return NextResponse.json(data);
    } catch (err: unknown) {
        console.error("Error fetching messages:", err);
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
    try {
        const { id: chatId } = await params;
        if (!chatId) {
            return NextResponse.json({ error: "No chat ID provided" }, { status: 400 });
        }
        await prisma.chat.delete({
            where: { id: chatId },
        });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        console.error("Error deleting chat:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to delete" },
            { status: 500 }
        );
    }
}
