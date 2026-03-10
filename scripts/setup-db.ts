import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), '.env') });
const prisma = new PrismaClient();

async function run() {
    console.log("Creating `match_documents` function in Supabase via Prisma raw execution...");
    try {
        await prisma.$executeRawUnsafe(`
create or replace function match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
        `);
        console.log("✅ Successfully created `match_documents` Postgres function!");
    } catch (error) {
        console.error("❌ Error creating function:", error);
    } finally {
        await prisma.$disconnect();
    }
}
run();
