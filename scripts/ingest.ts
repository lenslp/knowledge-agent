import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { Document } from "@langchain/core/documents";
import {
    parseFilePathToDocument,
    getTextSplitter,
    addDocumentsToVectorStore,
    deleteDocumentsBySource,
    computeFileHash,
} from "../lib/knowledge";
import { getManifestHash, upsertManifest } from "../lib/knowledge-db";

dotenv.config({ path: path.join(process.cwd(), ".env") });

async function run() {
    try {
        const knowledgeDir = path.join(process.cwd(), "knowledge");
        if (!fs.existsSync(knowledgeDir)) {
            fs.mkdirSync(knowledgeDir, { recursive: true });
            console.log("Created knowledge/ directory. Add files and run again.");
            return;
        }

        const files = fs.readdirSync(knowledgeDir);
        const textSplitter = getTextSplitter();
        let processed = 0;
        let skipped = 0;

        for (const file of files) {
            const filePath = path.join(knowledgeDir, file);
            if (!fs.statSync(filePath).isFile()) continue;

            const buffer = fs.readFileSync(filePath);
            const fileHash = computeFileHash(buffer);
            const existingHash = await getManifestHash(filePath);
            if (existingHash === fileHash) {
                console.log(`  ⏭️  [skip] ${file} (未变更)`);
                skipped++;
                continue;
            }

            const doc = await parseFilePathToDocument(filePath);
            if (!doc) continue;

            await deleteDocumentsBySource(filePath);
            const docs = await textSplitter.splitDocuments([doc]);
            await addDocumentsToVectorStore(docs);
            await upsertManifest(filePath, fileHash);
            console.log(`  📄 ${file} (${docs.length} chunks)`);
            processed++;
        }

        if (processed === 0 && skipped === 0) {
            console.log("No supported documents found in knowledge/ folder.");
            return;
        }
        console.log(`\n✅ 增量入库完成：处理 ${processed} 个文件，跳过 ${skipped} 个未变更。`);
    } catch (error) {
        console.error("❌ Failed to ingest data:", error);
    }
}

run();
