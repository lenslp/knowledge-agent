import { prisma } from "./prisma";

/** 解析前端传入的 messages + imageContent，提取结构化信息 */
export function parseMessageContent(
    messages: any[],
    imageContent?: any[] | null
) {
    const lastMessage = messages[messages.length - 1];

    // 检测是否有图片：优先用 imageContent（前端显式传入），其次检测 message content 数组
    const multimodalContent = imageContent || (
        Array.isArray(lastMessage?.content) &&
        lastMessage.content.some((p: any) => p.type === "image_url" || p.type === "image")
            ? lastMessage.content
            : null
    );
    const hasImages = !!multimodalContent;

    // 提取纯文本内容（用于存库和 title）
    const currentMessageText = imageContent
        ? (imageContent as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ") || "（图片）"
        : Array.isArray(lastMessage?.content)
            ? lastMessage.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ")
            : (lastMessage?.content ?? "");

    // 历史消息格式化为 LangChain 识别的 [role, content] 元组
    const previousMessages = messages
        .slice(0, -1)
        .map((m: any) => [
            m.role === "user" ? "user" : "ai",
            Array.isArray(m.content)
                ? m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ")
                : m.content
        ]);

    return { multimodalContent, hasImages, currentMessageText, previousMessages };
}

/** 确保 chatId 存在，不存在则创建新 Chat */
export async function ensureChatExists(
    chatId: string | null,
    userId: string,
    title: string
): Promise<string> {
    if (chatId) {
        const existingChat = await prisma.chat.findFirst({
            where: { id: chatId, user_id: userId },
            select: { id: true },
        });

        if (!existingChat) {
            throw new Error("Chat not found");
        }

        return existingChat.id;
    }

    const newChat = await prisma.chat.create({
        data: { title: title.slice(0, 30) || "图片对话", user_id: userId }
    });
    return newChat.id;
}

/** 删除某条消息及其之后的所有消息，用于重新生成或编辑重发 */
export async function replaceChatMessagesFromId(
    chatId: string,
    userId: string,
    fromMessageId: string
) {
    const chat = await prisma.chat.findFirst({
        where: { id: chatId, user_id: userId },
        select: { id: true },
    });

    if (!chat) {
        throw new Error("Chat not found");
    }

    const messages = await prisma.message.findMany({
        where: { chat_id: chatId },
        select: { id: true },
        orderBy: { created_at: "asc" },
    });

    const startIndex = messages.findIndex((message) => message.id === fromMessageId);
    if (startIndex === -1) {
        throw new Error("Message not found");
    }

    const messageIdsToDelete = messages.slice(startIndex).map((message) => message.id);
    if (messageIdsToDelete.length === 0) {
        return { removedFirstMessage: startIndex === 0 };
    }

    await prisma.message.deleteMany({
        where: {
            chat_id: chatId,
            id: { in: messageIdsToDelete },
        },
    });

    return { removedFirstMessage: startIndex === 0 };
}

/** 更新会话标题，常用于编辑首条消息后同步侧边栏标题 */
export async function updateChatTitle(chatId: string, userId: string, title: string) {
    await prisma.chat.updateMany({
        where: { id: chatId, user_id: userId },
        data: { title: title.slice(0, 30) || "图片对话" },
    });
}

/** 统一的消息存库 */
export async function saveMessage(
    chatId: string,
    role: string,
    content: string,
    extras?: { tool_invocations?: any }
) {
    await prisma.message.create({
        data: {
            chat_id: chatId,
            role,
            content,
            tool_invocations: extras?.tool_invocations,
        }
    });
}
