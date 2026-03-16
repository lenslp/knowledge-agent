# 图片理解功能实现文档

## 概述

本项目支持用户在对话中上传图片，由视觉模型（Vision LLM）进行理解和分析。由于主对话模型（如千问 `qwen-plus`）不一定支持图片输入，图片消息走独立的处理分支，与普通文本对话完全解耦。

---

## 架构设计

```
用户上传图片
     │
     ▼
前端构造 multimodal content array（imageContent）
     │
     ▼
POST /api/chat  (body 中携带 imageContent)
     │
     ├─ hasImages = true
     │       │
     │       ▼
     │   直接 fetch 视觉模型 API（跳过 LangChain Agent）
     │       │
     │       ▼
     │   解析 OpenAI SSE 流 → 转为 Vercel AI SDK data stream 格式 → 前端实时渲染
     │
     └─ hasImages = false
             │
             ▼
         正常走 LangChain Agent（Tavily + RAG）
```

**为什么跳过 Agent？** 图片理解是单次感知任务，不需要工具调用循环。直接调模型更快，也避免 LangChain 对 multimodal content 格式的兼容问题。

---

## 前端实现

### 1. 图片选取（`app/page.tsx`）

支持三种方式添加图片：

| 方式 | 实现 |
|------|------|
| 点击按钮选文件 | `<input type="file" accept="image/*">` |
| 粘贴图片 | `onPaste` 事件监听 `clipboardData.files` |
| 拖拽到输入框 | `onDrop` 事件监听 `dataTransfer.files` |

最多同时附加 4 张图片，每张可单独删除。

### 2. 图片转 base64

```ts
const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
```

图片在本地转为 `data:image/xxx;base64,...` 格式，不经过任何中间服务器上传，直接随请求发送给后端。

### 3. 发送消息

有图片时使用 `useChat` 的 `append` 方法（而非 `handleSubmit`），将图片 URL 存入 `annotations` 用于消息气泡渲染，同时把 `imageContent`（multimodal content array）放进 `body` 传给后端：

```ts
append(
    {
        role: "user",
        content: input.trim() || "（图片）",
        annotations: pendingImages.map(img => ({ type: "image", url: img.dataUrl })),
    },
    {
        body: { chatId: activeChatId, imageContent },
    }
);
```

`imageContent` 的格式遵循 OpenAI vision 规范，同时包含文字和图片：

```json
[
  { "type": "text", "text": "这张图里有什么？" },
  { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
]
```

> 注意：图片 base64 同时存在于 `annotations`（用于前端渲染）和 `imageContent`（用于后端调用视觉模型），两者各有用途。

### 4. 消息气泡渲染

用户消息气泡中，从 `message.annotations` 读取图片 URL 并渲染缩略图：

```tsx
const imgs = (m.annotations as any[])?.filter((a: any) => a?.type === "image");
imgs.map((img, i) => <img key={i} src={img.url} ... />)
```

---

## 后端实现

### 1. 检测图片（`app/api/chat/route.ts`）

```ts
const { messages, chatId, imageContent } = await req.json();

const multimodalContent = imageContent || (
    Array.isArray(lastMessage?.content) &&
    lastMessage.content.some((p: any) => p.type === "image_url")
        ? lastMessage.content : null
);
const hasImages = !!multimodalContent;
```

优先使用前端显式传入的 `imageContent`，兼容 content 数组格式。

### 2. 视觉模型调用

绕过 LangChain，直接用原生 `fetch` 调 OpenAI 兼容接口，精确控制请求格式：

```ts
const visionResp = await fetch(`${visionBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${visionApiKey}`,
    },
    body: JSON.stringify({
        model: visionModel,
        messages: [
            { role: "system", content: "你是一个擅长图片理解、OCR、图表分析的AI助手。" },
            { role: "user", content: multimodalContent }
        ],
        stream: true,
        max_tokens: 2048,
    }),
});
```

### 3. SSE 流格式转换

视觉模型返回标准 **OpenAI SSE（Server-Sent Events）** 格式，后端解析后转为 **Vercel AI SDK data stream** 格式再发给前端。

**OpenAI SSE 原始格式**（每行一条事件）：
```
data: {"id":"...","choices":[{"delta":{"content":"你好"},"finish_reason":null}]}
data: {"id":"...","choices":[{"delta":{"content":"，"},"finish_reason":null}]}
data: [DONE]
```

**Vercel AI SDK data stream 格式**（前端 `useChat` 期望的格式）：
```
0:"你好"
0:"，"
d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}
```

转换逻辑：
- 每行 `data: {...}` 提取 `choices[0].delta.content`，编码为 `0:<JSON字符串>\n`（前缀 `0:` 表示文本 token）
- 流结束时发送 `d:{...}\n`（前缀 `d:` 表示 finish 元数据）
- `data: [DONE]` 行直接跳过

```ts
for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "data: [DONE]") continue;
    if (trimmed.startsWith("data: ")) {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
            fullText += delta;
            controller.enqueue(encoder.encode(`0:${JSON.stringify(delta)}\n`));
        }
    }
}
// 流结束
controller.enqueue(encoder.encode(`d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`));
```

Response Headers 中携带 `X-Chat-Id`，前端 `useChat` 的 `onResponse` 回调据此更新当前对话 ID。

### 4. 入库与图片持久化

流结束后将 AI 回复和用户消息存入数据库。图片 base64 存入用户消息的 `tool_invocations` 字段（JSON 格式），AI 回复只存文本：

```ts
// 用户消息入库（图片 base64 存入 tool_invocations）
await prisma.message.create({
    data: {
        chat_id: activeChatId,
        role: "user",
        content: currentMessageText,
        tool_invocations: hasImages
            ? { images: multimodalContent.filter(p => p.type === "image_url").map(p => p.image_url.url) }
            : undefined,
    }
});

// AI 回复入库（只存文本）
await prisma.message.create({
    data: { chat_id: activeChatId, role: "assistant", content: fullText }
});
```

加载历史对话时，前端从 `tool_invocations.images` 恢复图片到 `annotations`，气泡正常渲染原图：

```ts
// app/api/chats/[id]/route.ts 返回 tool_invocations 字段
// 前端 switchChat 时映射回 annotations
annotations: msg.tool_invocations?.images?.map((url: string) => ({ type: "image", url }))
```

---

## 环境变量配置

视觉模型通过独立的环境变量配置，与主模型完全解耦：

```bash
# 视觉模型（需支持 image_url 输入）
VISION_MODEL_NAME=qwen-vl-plus
VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VISION_API_KEY=sk-xxx

# 若视觉模型与主模型同一服务商，VISION_API_KEY 可与 OPENAI_API_KEY 相同
```

未配置 `VISION_MODEL_NAME` 时，后端返回 400 错误，前端显示红色提示条。

### 已验证可用的视觉模型

| 模型 | VISION_MODEL_NAME | VISION_BASE_URL |
|------|-------------------|-----------------|
| 通义千问 VL Plus | `qwen-vl-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 通义千问 VL Max | `qwen-vl-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenAI GPT-4o | `gpt-4o` | `https://api.openai.com/v1` |
| OpenAI GPT-4o mini | `gpt-4o-mini` | `https://api.openai.com/v1` |

---

## 注意事项

- 图片以 base64 形式随请求发送，单张图片建议不超过 5MB，避免请求体过大
- 图片 base64 持久化存储在 `messages.tool_invocations` 字段，刷新页面后历史对话仍可正常显示原图
- MiniMax M2.5 的 OpenAI/Anthropic 兼容接口均**不支持**图片输入（官方文档明确标注），需单独配置视觉模型
