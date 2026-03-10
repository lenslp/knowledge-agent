import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        // Fetch chats, ordered by newest first
        const data = await prisma.chat.findMany({
            select: { id: true, title: true, created_at: true },
            orderBy: { created_at: "desc" }
        });

        return NextResponse.json(data);
    } catch (err: any) {
        console.error("Error fetching chats:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
