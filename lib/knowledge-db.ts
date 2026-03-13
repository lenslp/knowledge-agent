import * as path from "path";
import { prisma } from "./prisma";

/** 按 source 删除向量表中该文件的所有 chunk（metadata.source 精确匹配） */
export async function deleteDocumentsBySource(source: string): Promise<number> {
    const result = await prisma.$executeRawUnsafe(
        `DELETE FROM documents WHERE metadata->>'source' = $1`,
        source
    );
    return result as number;
}

/** 获取已记录的文件哈希（用于增量：未变更则跳过） */
export async function getManifestHash(source: string): Promise<string | null> {
    const row = await prisma.documentManifest.findUnique({
        where: { source },
        select: { file_hash: true },
    });
    return row?.file_hash ?? null;
}

/** 写入/更新 manifest（入库成功后调用） */
export async function upsertManifest(source: string, fileHash: string): Promise<void> {
    await prisma.documentManifest.upsert({
        where: { source },
        create: { source, file_hash: fileHash },
        update: { file_hash: fileHash, updated_at: new Date() },
    });
}

/** 删除 manifest 记录（删除文档或向量后调用，便于下次重新入库） */
export async function deleteManifestBySource(source: string): Promise<void> {
    await prisma.documentManifest.deleteMany({ where: { source } });
}

/** 列出知识库中按 source 聚合的文档（每条为同一 source 的 chunk 数） */
export async function listKnowledgeSources(): Promise<
    { source: string; filename: string; chunkCount: number }[]
> {
    const rows = await prisma.$queryRawUnsafe<
        { source: string; chunk_count: string }[]
    >(
        `SELECT metadata->>'source' AS source, COUNT(*)::text AS chunk_count FROM documents GROUP BY metadata->>'source' ORDER BY source`
    );
    return rows.map((r) => ({
        source: r.source,
        filename: path.basename(r.source),
        chunkCount: parseInt(r.chunk_count, 10) || 0,
    }));
}
