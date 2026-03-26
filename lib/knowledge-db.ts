import * as path from "path";
import { prisma } from "./prisma";

/** 按 source + user_id 删除向量表中该文件的所有 chunk */
export async function deleteDocumentsBySource(source: string, userId: string): Promise<number> {
    const result = await prisma.$executeRawUnsafe(
        `DELETE FROM documents WHERE metadata->>'source' = $1 AND metadata->>'user_id' = $2`,
        source,
        userId
    );
    return result as number;
}

/** 获取已记录的文件哈希 */
export async function getManifestHash(source: string, userId: string): Promise<string | null> {
    const row = await prisma.documentManifest.findFirst({
        where: { source, user_id: userId },
        select: { file_hash: true },
    });
    return row?.file_hash ?? null;
}

/** 写入/更新 manifest */
export async function upsertManifest(source: string, fileHash: string, userId: string): Promise<void> {
    await prisma.documentManifest.upsert({
        where: { user_id_source: { user_id: userId, source } },
        create: { source, file_hash: fileHash, user_id: userId },
        update: { file_hash: fileHash, updated_at: new Date() },
    });
}

/** 删除 manifest 记录 */
export async function deleteManifestBySource(source: string, userId: string): Promise<void> {
    await prisma.documentManifest.deleteMany({ where: { source, user_id: userId } });
}

/** 列出当前用户知识库中的文档 */
export async function listKnowledgeSources(userId: string): Promise<
    { source: string; filename: string; chunkCount: number }[]
> {
    const rows = await prisma.$queryRawUnsafe<
        { source: string; chunk_count: string }[]
    >(
        `SELECT metadata->>'source' AS source, COUNT(*)::text AS chunk_count FROM documents WHERE metadata->>'user_id' = $1 GROUP BY metadata->>'source' ORDER BY source`,
        userId
    );
    return rows.map((r) => ({
        source: r.source,
        filename: path.basename(r.source),
        chunkCount: parseInt(r.chunk_count, 10) || 0,
    }));
}

export async function getKnowledgeSourceDetail(
    source: string,
    userId: string
): Promise<{
    source: string;
    filename: string;
    chunks: { content: string }[];
} | null> {
    const rows = await prisma.$queryRawUnsafe<
        { content: string }[]
    >(
        `SELECT content FROM documents
         WHERE metadata->>'source' = $1 AND metadata->>'user_id' = $2`,
        source,
        userId
    );

    if (rows.length === 0) return null;

    return {
        source,
        filename: path.basename(source),
        chunks: rows,
    };
}
