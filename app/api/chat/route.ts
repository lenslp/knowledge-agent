import * as path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { createToolCallingAgent, AgentExecutor } from "@langchain/classic/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { Embeddings } from "@langchain/core/embeddings";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { LangChainAdapter, StreamData } from "ai";
import { z } from "zod";

import { prisma } from "../../../lib/prisma";

// 允许最长 60 秒的请求，因为搜索可能较慢
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const { messages, chatId } = await req.json();

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

        // 2.5 构建 RAG 知识库专用检索工具
        const knowledgeSearchTool = new DynamicStructuredTool({
            name: "knowledge_search",
            description: "用于在内部知识库、私有机密文件和公司介绍中搜索信息。当你被问到公司报销政策、WiFi密码、内部规章等私人/内部信息时，必须使用此工具。",
            schema: z.object({
                query: z.string().describe("要在知识库中检索的关键词或短语，应当尽量精准并贴合原文可能出现的用词"),
            }),
            func: async ({ query }) => {
                const supabaseClient = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );

                class CustomMiniMaxEmbeddings extends Embeddings {
                    async embedDocuments(texts: string[]): Promise<number[][]> {
                        const results: number[][] = [];
                        for (const text of texts) {
                            const res = await this.embedQuery(text);
                            results.push(res);
                        }
                        return results;
                    }
                    async embedQuery(text: string): Promise<number[]> {
                        const response = await fetch("https://api.minimaxi.com/v1/embeddings", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                model: "embo-01",
                                texts: [text],
                                type: "db"
                            })
                        });
                        const data = await response.json();
                        if (!data.vectors || !data.vectors[0]) {
                            throw new Error(`MiniMax API error: ${JSON.stringify(data)}`);
                        }
                        return data.vectors[0];
                    }
                }
                const vectorStore = new SupabaseVectorStore(
                    new CustomMiniMaxEmbeddings({}),
                    {
                        client: supabaseClient,
                        tableName: "documents",
                        queryName: "match_documents",
                    }
                );

                // 检索最相关的 3 个文档块
                const relevantDocs = await vectorStore.similaritySearch(query, 3);
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

        const tools = [searchTool, knowledgeSearchTool];

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
如果有任何关于实时性要求高的问题，请务必使用工具进行联网检索解答，确保信息是最新的。
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
        });

        // 5. 将前端传入的 Vercel AI Messages 格式化为 LangChain 识别的历史消息
        const previousMessages = messages
            .slice(0, -1)
            .map((m: any) => [m.role === 'user' ? 'user' : 'ai', m.content]);

        const currentMessageContent = messages[messages.length - 1].content;

        let activeChatId = chatId;

        // 如果没有 chatId (新建对话)，先创建一条 chat 记录
        if (!activeChatId) {
            const newChat = await prisma.chat.create({
                data: { title: currentMessageContent.slice(0, 30) }
            });
            activeChatId = newChat.id;
        }

        // 存储用户的消息到数据库
        await prisma.message.create({
            data: {
                chat_id: activeChatId,
                role: 'user',
                content: currentMessageContent
            }
        });

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
