import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), '.env') });
const prisma = new PrismaClient();

const VECTOR_DIM = 1024; // 千问 text-embedding-v3 支持的维度

async function run() {
    try {
        // 1. 重建 embedding 列为正确维度（清空旧数据）
        console.log(`🔧 重建 documents.embedding 列为 vector(${VECTOR_DIM})...`);
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE documents`);
        await prisma.$executeRawUnsafe(`ALTER TABLE documents DROP COLUMN IF EXISTS embedding`);
        await prisma.$executeRawUnsafe(`ALTER TABLE documents ADD COLUMN embedding vector(${VECTOR_DIM})`);
        console.log(`✅ embedding 列已重建为 vector(${VECTOR_DIM})`);

        // 2. 重建 match_documents 函数
        console.log(`🔧 重建 match_documents 函数...`);
        await prisma.$executeRawUnsafe(`
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(${VECTOR_DIM}),
  match_count int DEFAULT NULL,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE metadata @> filter
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
        `);
        console.log("✅ match_documents 函数已更新");
        console.log("\n🎉 数据库初始化完成，请重新运行 npx tsx scripts/ingest.ts 入库文档。");
    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
