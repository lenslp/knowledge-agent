import { LangChainAdapter, StreamData } from "ai";

import { createAgentExecutor } from "../../../lib/agent";
import { handleVisionRequest } from "../../../lib/vision";
import { parseMessageContent, ensureChatExists, saveMessage } from "../../../lib/chat-helpers";
import { getCurrentUser } from "../../../lib/supabase-server";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return new Response("Unauthorized", { status: 401 });

        const { messages, chatId, imageContent } = await req.json();

        if (!process.env.OPENAI_API_KEY || !process.env.TAVILY_API_KEY) {
            return new Response("Missing API Keys in .env", { status: 500 });
        }

        // 解析消息内容
        const { multimodalContent, hasImages, currentMessageText, previousMessages } =
            parseMessageContent(messages, imageContent);

        // 确保 Chat 存在
        const activeChatId = await ensureChatExists(chatId, user.id, currentMessageText);

        // 存储用户消息
        await saveMessage(activeChatId, "user", currentMessageText, {
            tool_invocations: hasImages
                ? { images: (multimodalContent as any[]).filter((p: any) => p.type === "image_url").map((p: any) => p.image_url.url) }
                : undefined,
        });

        // 图片消息走 Vision 分支
        if (hasImages) {
            return handleVisionRequest({ multimodalContent: multimodalContent!, chatId: activeChatId });
        }

        // 文本消息走 Agent 分支
        const agentExecutor = createAgentExecutor(user.id);

        const stream = await agentExecutor.streamEvents(
            { input: currentMessageText, chat_history: previousMessages },
            { version: "v2" }
        );

        const data = new StreamData();

        function interceptStream() {
            const iterator = stream[Symbol.asyncIterator]();
            let dataClosed = false;
            const closeData = () => {
                if (dataClosed) return Promise.resolve();
                dataClosed = true;
                return data.close();
            };
            return new ReadableStream({
                async pull(controller) {
                    try {
                        const { value: event, done } = await iterator.next();
                        if (done) {
                            await closeData();
                            controller.close();
                            return;
                        }
                        if (event.event === "on_tool_start") {
                            data.appendMessageAnnotation({
                                type: "tool_call",
                                toolName: event.name,
                                status: "running",
                                toolInput: event.data?.input,
                                id: event.run_id
                            });
                        }
                        if (event.event === "on_tool_end") {
                            data.appendMessageAnnotation({
                                type: "tool_call",
                                toolName: event.name,
                                status: "complete",
                                toolOutput: typeof event.data?.output === "string"
                                    ? event.data.output.substring(0, 200) + "..."
                                    : "Tool completed",
                                id: event.run_id
                            });
                        }
                        controller.enqueue(event);
                    } catch (error) {
                        controller.error(error);
                    }
                },
                cancel() {
                    closeData().catch(() => {});
                }
            });
        }

        return LangChainAdapter.toDataStreamResponse(interceptStream(), {
            data,
            init: { headers: { "X-Chat-Id": activeChatId } },
            callbacks: {
                async onFinal(completion) {
                    await saveMessage(activeChatId, "assistant", completion);
                }
            }
        });

    } catch (e: any) {
        return new Response(e.message, { status: 500 });
    }
}
