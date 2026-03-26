import * as path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { createToolCallingAgent, AgentExecutor } from "@langchain/classic/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CustomMiniMaxEmbeddings } from "./knowledge";
import { mergeKnowledgeSources, type KnowledgeSourceSnippet } from "./knowledge-sources";

/** 创建 LLM 实例 */
function createLLM() {
    return new ChatOpenAI({
        modelName: process.env.MODEL_NAME || "gpt-4o-mini",
        temperature: 0,
        openAIApiKey: process.env.OPENAI_API_KEY,
        configuration: {
            baseURL: process.env.OPENAI_BASE_URL,
        },
        streaming: true,
    });
}

/** 创建联网搜索工具 */
function createSearchTool() {
    const rawSearchTool = new TavilySearch({ maxResults: 3 });
    return new DynamicStructuredTool({
        name: rawSearchTool.name,
        description: rawSearchTool.description,
        schema: rawSearchTool.schema,
        func: async (input) => {
            const result = await rawSearchTool.invoke(input);
            return JSON.stringify(result);
        }
    });
}

/** 创建知识库 RAG 检索工具 */
function createKnowledgeSearchTool(userId: string) {
    return new DynamicStructuredTool({
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

            const SIMILARITY_THRESHOLD = 0.7;
            const candidates = await vectorStore.similaritySearchWithScore(query, 10, { user_id: userId });
            const relevantDocs = candidates
                .filter(([, score]) => score >= SIMILARITY_THRESHOLD)
                .map(([doc]) => doc)
                .slice(0, 5);

            if (relevantDocs.length === 0) {
                return "知识库中未找到相关信息，请直接告知用户或尝试换个关键词搜索。";
            }

            const sources = mergeKnowledgeSources(
                relevantDocs.map((doc) => ({
                    source: doc.metadata?.source ?? "未知来源",
                    filename: doc.metadata?.source
                        ? path.basename(doc.metadata.source)
                        : "未知来源",
                    snippet: doc.pageContent.trim(),
                } satisfies KnowledgeSourceSnippet))
            );

            const context = relevantDocs.map((doc, idx) => {
                const source = doc.metadata?.source
                    ? path.basename(doc.metadata.source)
                    : "未知来源";
                return `片段 ${idx + 1}（来源：${source}）:\n${doc.pageContent}`;
            }).join("\n\n---\n\n");

            return JSON.stringify(
                {
                    context,
                    sources,
                },
                null,
                2
            );
        }
    });
}

/** 构建系统 Prompt */
function buildPrompt() {
    const currentDate = new Date().toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
    });

    return ChatPromptTemplate.fromMessages([
        ["system", `你是一个强大且乐于助人的AI助手。
当前时间是：${currentDate}。
【重要】优先使用 knowledge_search 检索知识库：用户问的产品教程、软件用法、文档说明等，若知识库中可能包含，必须先查知识库。只有知识库无结果或问题明显需要最新实时信息时，才使用联网搜索。
当你使用 knowledge_search 工具时，工具返回的是 JSON，其中包含：
- context：可直接用于回答的知识库片段
- sources：来源文件与原文片段
请优先基于 context 回答，不要原样输出整段 JSON，也不要额外生成固定格式的“📄 来源”尾注；前端会自动展示可点击的来源片段。
当需要绘制流程图、架构图、时序图等图表时，请始终使用 Mermaid 语法，格式如下：
\`\`\`mermaid
图表内容
\`\`\`
不要使用 ASCII 字符、竖线或文本来绘制图表。`],
        ["placeholder", "{chat_history}"],
        ["user", "{input}"],
        ["placeholder", "{agent_scratchpad}"],
    ]);
}

/** 创建完整的 AgentExecutor 实例 */
export function createAgentExecutor(userId: string) {
    const llm = createLLM();
    const tools = [createKnowledgeSearchTool(userId), createSearchTool()];
    const prompt = buildPrompt();

    const agent = createToolCallingAgent({ llm, tools, prompt });

    return new AgentExecutor({
        agent,
        tools,
        maxIterations: 5,
    });
}
