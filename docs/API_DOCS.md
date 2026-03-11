# 项目 API 使用解析：LangChain & Vercel AI SDK

本文档梳理了当前 Agent 项目（基于 Next.js）中使用的所有核心大模型相关库的具体 API 及其在项目中的实际作用。

---

## 1. Vercel AI SDK (`ai` 包)

Vercel AI SDK 是负责连接后端大模型输出与前端 React UI 的桥梁。本项目使用的是 `v3.4.33` 版本。

### 1.1 前端 API
- **`useChat`** (来自 `ai/react`)
  - **路径**: `app/page.tsx`
  - **功能**: React Hook，提供一整套现成的流式问答状态管理。
  - **作用**: 自动管理 `messages`（聊天记录列表）、`input`（当前输入框状态）、`isLoading`（加载状态）。在调用后端（例如 `/api/chat`）时，它能自动解析后端传来的 HTTP 流式数据，并触发 React 组件的实时逐字渲染。此外，我们利用了它的 `onResponse` 回调拦截 HTTP Headers（获取 `X-Chat-Id` 表明最新生成的聊天轮次），以及通过返回值里的 `data` 对象（会被解析到 `m.annotations` 里）渲染工具调用气泡。

### 1.2 后端 API
- **`StreamData`** (来自 `ai`)
  - **路径**: `app/api/chat/route.ts`
  - **功能**: 用于在流式响应中注入额外自定义数据（Data Annotations）的辅助类。
  - **作用**: 我们用它在文字流之外，单独向前端发送“工具正在运行 (`running`)”或“工具已完成 (`complete`)”的事件。通过调用 `data.appendMessageAnnotation(...)`，这些信息会被悄悄夹带在数据流中，最终被前端 `useChat` 解析为 `message.annotations`。

- **`LangChainAdapter.toDataStreamResponse`** (来自 `ai`)
  - **路径**: `app/api/chat/route.ts`
  - **功能**: 适配器函数。将各种格式的流（本项目中为手工包装后的 `ReadableStream`）转换为兼容 Vercel AI SDK 格式的 HTTP `Response`。
  - **作用**: 这是后端的最后一步出口。它能接收并流式传出大模型的文字、加上我们 `StreamData` 附带的注释信息，还可以设置 HTTP `headers` (如 `X-Chat-Id`)，并在最终完成时调用 `callbacks.onFinal` 钩子闭环（例如将完整聊天记录写入 Prisma 数据库）。

---

## 2. LangChain 生态 (`@langchain/*`)

LangChain 负责后端的“思考”逻辑，包括调度大模型、挂载工具、检索向量库和执行复杂的 Agent 步骤。

### 2.1 核心大模型组件
- **`ChatOpenAI`** (来自 `@langchain/openai`)
  - **路径**: `app/api/chat/route.ts`
  - **功能**: LangChain 针对 OpenAI 兼容 API 封装的聊天模型客户端。
  - **作用**: 初始化核心思考大脑（在本项目中实际接入的是兼容 OpenAI 格式的 MiniMax 模型）。负责接收系统提示词和历史消息，产出对应的聊天回复或决定要调用的工具。

### 2.2 提示词模板
- **`ChatPromptTemplate`** (来自 `@langchain/core/prompts`)
  - **路径**: `app/api/chat/route.ts`
  - **功能**: 用于结构化生成系统提示词和消息历史的工厂类。
  - **作用**: 我们使用 `ChatPromptTemplate.fromMessages()` 构造了 Agent 的初始角色设定（System Prompt，规定其身份、工作流格式和思维方式（`<think>` 标签）），并利用 `MessagesPlaceholder` 为之前的对话历史和暂存的工具执行步骤留出空间。

### 2.3 工具系统 (Tools)
- **`TavilySearch`** (来自 `@langchain/tavily`)
  - **功能**: 现成的 Tavily 搜索引擎工具，专为 LLM 设计。
  - **作用**: 我们提供给 Agent 执行“联网搜索最新问题”的能力。

- **`DynamicStructuredTool`** (来自 `@langchain/core/tools` 与 `zod`)
  - **功能**: 允许开发者使用 TypeScript/Zod 定义强类型输入的自定义工具。
  - **作用**: 我们自己编写了 `knowledge_search` 工具。使用 `zod` 限制了输入参数只能为 `query`（字符串）。Agent 想搜本地知识库时，就会受到这个定义的引导。

### 2.4 Agent 与执行器
- **`createToolCallingAgent`** (来自 `@langchain/classic/agents`)
  - **功能**: 创建一个具备“Tool Calling（工具调用）”范式的 Agent 策略。
  - **作用**: 将模型 (`llm`)、可用工具 (`tools`) 和提示词模板 (`prompt`) 绑定在一起，告诉大模型：“当遇到不懂的问题时，请返回特定格式的指令来调用这些工具”。

- **`AgentExecutor`** (来自 `@langchain/classic/agents`)
  - **功能**: 实际运行 Agent 策略的循环执行引擎。
  - **作用**: 大脑（Agent）思考出要用什么工具后，执行器（Executor）负责去真实调用该工具（比如发网路请求），拿到结果后，**自动再丢回给大模型**让它继续思考总结，直到不需要工具为止。
  - **关键方法**: 调用的 `agentExecutor.streamEvents(...)` 是整个流式应用的核心，它能吐出细粒度的执行进度日志（如 `on_chat_model_stream`, `on_tool_start`, `on_tool_end`），供我们拦截和包装。

### 2.5 检索增强生成 (RAG) 组件
- **`Embeddings`** (来自 `@langchain/core/embeddings` - 本项目通过自定义类实现兼容)
  - **功能**: 定义文本向量化转换逻辑的基类/接口。
  - **作用**: 我们自己实现了一个兼容 OpenAI `/v1/embeddings` API 的 `MiniMaxEmbeddings` 类，用于把用户的自然语言查询转化为数学高维向量。

- **`SupabaseVectorStore`** (来自 `@langchain/community/vectorstores/supabase`)
  - **功能**: 连接 Supabase `pgvector` 扩展的向量数据库封装。
  - **作用**: 配合 `createClient` 初始化，通过 `similaritySearch` 方法，将生成的查询向量去数据库中进行最近邻（Cosine 等）计算，找回相关的本地知识库片段给 Agent 作为参考材料。
