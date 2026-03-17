import { saveMessage } from "./chat-helpers";

interface VisionRequestParams {
    multimodalContent: any[];
    chatId: string;
}

/** 处理包含图片的 Vision 请求，返回流式 Response */
export async function handleVisionRequest({ multimodalContent, chatId }: VisionRequestParams): Promise<Response> {
    const visionModel = process.env.VISION_MODEL_NAME || process.env.MODEL_NAME || "gpt-4o-mini";
    const visionBaseUrl = process.env.VISION_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const visionApiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY;

    if (!process.env.VISION_MODEL_NAME) {
        return new Response(
            JSON.stringify({ error: "图片理解需要配置支持 vision 的模型。请在 .env 中设置 VISION_MODEL_NAME（如 gpt-4o-mini）、VISION_BASE_URL 和 VISION_API_KEY。" }),
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
                    for (const line of chunk.split("\n")) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === "data: [DONE]") continue;
                        if (trimmed.startsWith("data: ")) {
                            try {
                                const json = JSON.parse(trimmed.slice(6));
                                const delta = json.choices?.[0]?.delta?.content;
                                if (delta) {
                                    fullText += delta;
                                    controller.enqueue(encoder.encode(`0:${JSON.stringify(delta)}\n`));
                                }
                            } catch { /* skip malformed */ }
                        }
                    }
                }
                controller.enqueue(encoder.encode(`d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`));
                await saveMessage(chatId, "assistant", fullText);
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
            "X-Chat-Id": chatId,
        }
    });
}
