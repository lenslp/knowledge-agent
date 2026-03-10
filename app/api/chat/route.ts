import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { createToolCallingAgent, AgentExecutor } from "@langchain/classic/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { LangChainAdapter } from "ai";

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
        const tools = [searchTool];

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
如果有任何关于实时性要求高的问题，请务必使用工具进行联网检索解答，确保信息是最新的。`],
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

        // 7. 使用 Vercel 提供的 LangChainAdapter，并在 onFinal 回调中保存 AI 回复
        return LangChainAdapter.toDataStreamResponse(stream, {
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
