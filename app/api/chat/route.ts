import * as path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { createToolCallingAgent, AgentExecutor } from "@langchain/classic/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { LangChainAdapter, StreamData } from "ai";
import { z } from "zod";

import { CustomMiniMaxEmbeddings } from "../../../lib/knowledge";
import { prisma } from "../../../lib/prisma";

// 允许最长 60 秒的请求，因为搜索可能较慢
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const { messages, chatId, imageContent } = await req.json();

        if (!process.env.OPENAI_API_KEY || !process.env.TAVILY_API_KEY) {
            return new Response("Missing API Keys in .env", { status: 500 });
        }

        // 1. 初始化大语言模型
        const llm = new ChatOpenAI({
            modelName: process.env.MODEL_NAME || "gpt-4o-mini",
            temperature: 0,
            openAIApiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: process.env.OPENAI_BASE_URL,
            },
            // 必须带 streaming 选项以便底层支持流式输出
            streaming: true,
        });

        // 2. 初始化工具
        const rawSearchTool = new TavilySearch({
            maxResults: 3,
        });
        const searchTool = new DynamicStructuredTool({
            name: rawSearchTool.name,
            description: rawSearchTool.description,
            schema: rawSearchTool.schema,
            func: async (input) => {
                const result = await rawSearchTool.invoke(input);
                return JSON.stringify(result);
            }
        });

        // 2.5 构建 RAG 知识库专用检索工具（优先于联网搜索）
        const knowledgeSearchTool = new DynamicStructuredTool({
            name: "knowledge_search",
            description: "在本地知识库中搜索用户上传的文档内容。适用于：产品教程、软件用法、文档说明、公司内部规章、报销政策等。当用户问的是知识库中可能存在的主题（如某产品的玩法/教程/介绍）时，必须优先使用此工具。若知识库无结果，再考虑联网搜索。",
            schema: z.object({
                query: z.string().describe("要在知识库中检索的关键词或短语，应当尽量精准并贴合原文可能出现的用词"),
            }),
            func: async ({ query }) => {
                const supabaseClient = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );

                const vectorStore = new SupabaseVectorStore(
                    new CustomMiniMaxEmbeddings(),
                    {
                        client: supabaseClient,
                        tableName: "documents",
                        queryName: "match_documents",
                    }
                );

                // 检索候选文档（多取一些以便按阈值过滤）
                const SIMILARITY_THRESHOLD = 0.7; // 相似度阈值，低于此值的视为不相关
                const candidates = await vectorStore.similaritySearchWithScore(query, 10);
                const relevantDocs = candidates
                    .filter(([, score]) => score >= SIMILARITY_THRESHOLD)
                    .map(([doc]) => doc)
                    .slice(0, 5); // 过滤后最多保留 5 条
                if (relevantDocs.length === 0) {
                    return "知识库中未找到相关信息，请直接告知用户或尝试换个关键词搜索。";
                }
                return relevantDocs.map((doc, idx) => {
                    const source = doc.metadata?.source
                        ? path.basename(doc.metadata.source)
                        : "未知来源";
                    return `片段 ${idx + 1}（来源：${source}）:\n${doc.pageContent}`;
                }).join("\n\n---\n\n") + "\n\n⚠️ 请你在回答的最后，务必原样附上以下引用来源行：\n> 📄 来源：" + [...new Set(relevantDocs.map(doc => doc.metadata?.source ? path.basename(doc.metadata.source) : "未知来源"))].join(", ");
            }
        });

        const tools = [knowledgeSearchTool, searchTool]; // 知识库优先

        // 3. 动态时间并构建 Prompt
        const currentDate = new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        });

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `你是一个强大且乐于助人的AI助手。
当前时间是：${currentDate}。
【重要】优先使用 knowledge_search 检索知识库：用户问的产品教程、软件用法、文档说明等，若知识库中可能包含，必须先查知识库。只有知识库无结果或问题明显需要最新实时信息时，才使用联网搜索。
当你使用 knowledge_search 工具获取到知识库信息时，请在回答末尾附上引用来源，格式如下：
> 📄 来源：文件名1, 文件名2
请务必保留此引用格式，帮助用户追溯信息出处。
当需要绘制流程图、架构图、时序图等图表时，请始终使用 Mermaid 语法，格式如下：
\`\`\`mermaid
图表内容
\`\`\`
不要使用 ASCII 字符、竖线或文本来绘制图表。`],
            // 使用数组直接映射 messages 到 LangChain 的对应 message
            ["placeholder", "{chat_history}"],
            ["user", "{input}"],
            ["placeholder", "{agent_scratchpad}"],
        ]);

        // 4. 创建 Agent
        const agent = createToolCallingAgent({
            llm,
            tools,
            prompt,
        });

        const agentExecutor = new AgentExecutor({
            agent,
            tools,
            maxIterations: 5, // 限制工具调用轮数，避免反复调用同一工具
        });

        // 5. 将前端传入的 Vercel AI Messages 格式化为 LangChain 识别的历史消息
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
        // 若有 imageContent（前端传入的 multimodal array），从中提取文本
        const currentMessageText = imageContent
            ? (imageContent as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ") || "（图片）"
            : Array.isArray(lastMessage?.content)
                ? lastMessage.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ")
                : (lastMessage?.content ?? "");

        const previousMessages = messages
            .slice(0, -1)
            .map((m: any) => [m.role === 'user' ? 'user' : 'ai',
                Array.isArray(m.content)
                    ? m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ")
                    : m.content
            ]);

        let activeChatId = chatId;

        // 如果没有 chatId (新建对话)，先创建一条 chat 记录
        if (!activeChatId) {
            const newChat = await prisma.chat.create({
                data: { title: currentMessageText.slice(0, 30) || "图片对话" }
            });
            activeChatId = newChat.id;
        }

        // 存储用户的消息到数据库（只存文本部分，图片 base64 存入 tool_invocations）
        await prisma.message.create({
            data: {
                chat_id: activeChatId,
                role: 'user',
                content: currentMessageText,
                tool_invocations: hasImages
                    ? { images: (multimodalContent as any[]).filter((p: any) => p.type === "image_url").map((p: any) => p.image_url.url) }
                    : undefined,
            }
        });

        // 如果消息包含图片，直接用原生 fetch 调 OpenAI 兼容接口（精确控制 vision 格式）
        if (hasImages) {
            // 视觉模型可单独配置，默认 fallback 到主模型
            const visionModel = process.env.VISION_MODEL_NAME || process.env.MODEL_NAME || "gpt-4o-mini";
            const visionBaseUrl = process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
            const visionApiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY;

            // 如果没有单独配置视觉模型，提示用户
            if (!process.env.VISION_MODEL_NAME) {
                return new Response(
                    JSON.stringify({ error: "图片理解需要配置支持 vision 的模型。请在 .env 中设置 VISION_MODEL_NAME（如 gpt-4o-mini）、VISION_BASE_URL 和 VISION_API_KEY。MiniMax M2.5 不支持图片输入。" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }

            const visionMessages = [
                {
                    role: "system",
                    content: "你是一个强大且乐于助人的AI助手，擅长图片理解、OCR文字识别、图表分析等视觉任务。"
                },
                {
                    role: "user",
                    content: (multimodalContent as any[]).map((p: any) => {
                        if (p.type === "text") return { type: "text", text: p.text };
                        if (p.type === "image_url") return { type: "image_url", image_url: { url: p.image_url.url, detail: "auto" } };
                        return p;
                    })
                }
            ];

            const visionResp = await fetch(`${visionBaseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${visionApiKey}`,
                },
                body: JSON.stringify({
                    model: visionModel,
                    messages: visionMessages,
                    stream: true,
                    max_tokens: 2048,
                }),
            });

            if (!visionResp.ok) {
                const errText = await visionResp.text();
                return new Response(`Vision API error: ${errText}`, { status: 500 });
            }

            // 透传 SSE 流，同时存库
            const reader = visionResp.body!.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            const readable = new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder();
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            const chunk = decoder.decode(value, { stream: true });
                            // 解析 SSE 提取文本，同时透传给前端
                            for (const line of chunk.split("\n")) {
                                const trimmed = line.trim();
                                if (!trimmed || trimmed === "data: [DONE]") continue;
                                if (trimmed.startsWith("data: ")) {
                                    try {
                                        const json = JSON.parse(trimmed.slice(6));
                                        const delta = json.choices?.[0]?.delta?.content;
                                        if (delta) {
                                            fullText += delta;
                                            // 转为 Vercel AI SDK data stream 格式
                                            controller.enqueue(encoder.encode(`0:${JSON.stringify(delta)}\n`));
                                        }
                                    } catch { /* skip malformed */ }
                                }
                            }
                        }
                        controller.enqueue(encoder.encode(`d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`));
                        await prisma.message.create({
                            data: { chat_id: activeChatId, role: "assistant", content: fullText }
                        });
                    } catch (err) {
                        controller.error(err);
                    } finally {
                        controller.close();
                    }
                }
            });

            return new Response(readable, {
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Vercel-AI-Data-Stream": "v1",
                    "X-Chat-Id": activeChatId,
                }
            });
        }

        const currentMessageContent = currentMessageText;

        // 6. 执行流式事件响应，这是在生产环境中将 Agent 执行步骤抛给前端最健壮的方法
        const stream = await agentExecutor.streamEvents(
            {
                input: currentMessageContent,
                chat_history: previousMessages,
            },
            { version: "v2" }
        );

        // 创建自定义的 StreamData 对象，用于在流中注入事件
        const data = new StreamData();

        // 创建一个拦截器函数处理 streamEvents 并注入工具状态
        // LangChainAdapter.toDataStreamResponse 期望一个 ReadableStream
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

                        // 如果是工具调用开始
                        if (event.event === "on_tool_start") {
                            data.appendMessageAnnotation({
                                type: "tool_call",
                                toolName: event.name,
                                status: "running",
                                toolInput: event.data?.input,
                                id: event.run_id
                            });
                        }
                        
                        // 如果是工具调用结束
                        if (event.event === "on_tool_end") {
                            data.appendMessageAnnotation({
                                type: "tool_call",
                                toolName: event.name,
                                status: "complete",
                                toolOutput: typeof event.data?.output === 'string' 
                                    ? event.data.output.substring(0, 200) + '...' // 截断过长的输出
                                    : 'Tool completed',
                                id: event.run_id
                            });
                        }

                        // 继续产生原有的事件让 LangChainAdapter 处理
                        controller.enqueue(event);
                    } catch (error) {
                        controller.error(error);
                    }
                },
                cancel() {
                    // .catch() 必须用在 Promise 上，thread-safe guard 避免重复关闭
                    closeData().catch(() => {});
                }
            });
        }

        // 7. 使用 Vercel 提供的 LangChainAdapter，并在 onFinal 回调中保存 AI 回复
        return LangChainAdapter.toDataStreamResponse(interceptStream(), {
            data,
            init: {
                headers: {
                    "X-Chat-Id": activeChatId
                }
            },
            callbacks: {
                async onFinal(completion) {
                    // 当流完全结束后，将 AI 回复（或者工具调用的总结结果）存储到数据库中
                    await prisma.message.create({
                        data: {
                            chat_id: activeChatId,
                            role: 'assistant',
                            content: completion
                        }
                    });
                }
            }
        });

    } catch (e: any) {
        return new Response(e.message, { status: 500 });
    }
}
