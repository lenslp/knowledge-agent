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
    if (chatId) return chatId;
    const newChat = await prisma.chat.create({
        data: { title: title.slice(0, 30) || "图片对话", user_id: userId }
    });
    return newChat.id;
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
