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
    } catch (err: any) {
        console.error("Error fetching messages:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
