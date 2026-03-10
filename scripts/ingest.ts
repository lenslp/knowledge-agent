import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { Embeddings } from "@langchain/core/embeddings";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";

// Load environment variables from .env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;

// 递归提取 JSON 对象中所有字符串值
function extractJsonText(obj: any): string {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map(extractJsonText).filter(Boolean).join("\n");
    if (typeof obj === "object" && obj !== null) {
        return Object.values(obj).map(extractJsonText).filter(Boolean).join("\n");
    }
    return "";
}

async function run() {
    try {
        console.log("Initializing Supabase Client...");
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        console.log("Loading documents from ./knowledge directory...");
        const knowledgeDir = path.join(process.cwd(), "knowledge");
        const files = fs.readdirSync(knowledgeDir);
        const rawDocs: Document[] = [];

        for (const file of files) {
            const filePath = path.join(knowledgeDir, file);
            const ext = path.extname(file).toLowerCase();

            if (ext === ".txt" || ext === ".md") {
                const text = fs.readFileSync(filePath, "utf-8");
                rawDocs.push(new Document({ pageContent: text, metadata: { source: filePath } }));
                console.log(`  📄 [TXT/MD] ${file}`);
            } else if (ext === ".pdf") {
                const buffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(buffer);
                rawDocs.push(new Document({ pageContent: pdfData.text, metadata: { source: filePath } }));
                console.log(`  📕 [PDF] ${file} (${pdfData.numpages} pages)`);
            } else if (ext === ".docx") {
                const buffer = fs.readFileSync(filePath);
                const result = await mammoth.extractRawText({ buffer });
                rawDocs.push(new Document({ pageContent: result.value, metadata: { source: filePath } }));
                console.log(`  📘 [DOCX] ${file}`);
            } else if (ext === ".json") {
                const raw = fs.readFileSync(filePath, "utf-8");
                const json = JSON.parse(raw);
                const text = extractJsonText(json);
                rawDocs.push(new Document({ pageContent: text, metadata: { source: filePath } }));
                console.log(`  📗 [JSON] ${file}`);
            }
        }

        if (rawDocs.length === 0) {
            console.log("No documents found in knowledge/ folder.");
            return;
        }
        console.log(`Loaded ${rawDocs.length} original documents.`);

        console.log("Splitting documents into chunks...");
        // Split text into manageable chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await textSplitter.splitDocuments(rawDocs);
        console.log(`Created ${docs.length} chunks from the documents.`);

        console.log("Initializing Custom Embeddings Model (embo-01 via MiniMax API)...");
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
                        "Authorization": `Bearer ${OPENAI_API_KEY}`,
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

        const embeddings = new CustomMiniMaxEmbeddings({});

        console.log("Uploading vectors to Supabase...");
        await SupabaseVectorStore.fromDocuments(
            docs,
            embeddings,
            {
                client,
                tableName: "documents",
                queryName: "match_documents",
            }
        );

        console.log("✅ Ingestion complete! Knowledge successfully uploaded.");
    } catch (error) {
        console.error("❌ Failed to ingest data:", error);
    }
}

run();
