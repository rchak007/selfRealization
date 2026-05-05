import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { getWeaviateClient } from "./weaviateClient";

dotenv.config();

const TEXT_DIR = "./text_parts";
const PROJECT_NAME = "SELF";
const SUB_TOPIC = "ETERNAL-QUEST";
const COLLECTION_NAME = "BookChunk";

async function getMaxSequence(): Promise<number> {
  const client = getWeaviateClient();

  try {
    const result = await client.graphql
      .aggregate()
      .withClassName(COLLECTION_NAME)
      .withFields("sequence { maximum }")
      .withWhere({
        path: ["projectName"],
        operator: "Equal",
        valueText: PROJECT_NAME,
      })
      .do();

    const maxSeq = result?.data?.Aggregate?.[COLLECTION_NAME]?.[0]?.sequence?.maximum || 0;
    return maxSeq;
  } catch (error) {
    console.log("No existing chunks found, starting from sequence 1");
    return 0;
  }
}

async function insertChunk(sequence: number, textContent: string) {
  const client = getWeaviateClient();

  await client.data
    .creator()
    .withClassName(COLLECTION_NAME)
    .withProperties({
      projectName: PROJECT_NAME,
      subTopic: SUB_TOPIC,
      sequence,
      textContent,
      lastUsed: null,
    })
    .do();
}

async function main() {
  const files = fs
    .readdirSync(TEXT_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort((a, b) => {
      const partA = a.match(/Part(\d+)([A-Z_]*)/) || [];
      const partB = b.match(/Part(\d+)([A-Z_]*)/) || [];
      const numA = parseInt(partA[1] || "0", 10);
      const numB = parseInt(partB[1] || "0", 10);
      const subA = partA[2] || "";
      const subB = partB[2] || "";
      return numA - numB || subA.localeCompare(subB);
    });

  let sequence = (await getMaxSequence()) + 1;
  console.log(`Resuming from sequence #${sequence}`);

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const content = fs.readFileSync(path.join(TEXT_DIR, file), "utf-8");

    // Simple chunking: split by double newlines, filter empty
    const chunks = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 50); // Skip very short paragraphs

    console.log(`   Found ${chunks.length} chunks`);

    for (const chunk of chunks) {
      await insertChunk(sequence, chunk);
      if (sequence % 10 === 0) {
        console.log(`Inserted sequence #${sequence}`);
      }
      sequence++;
    }

    console.log(`Completed ${file} - up to sequence #${sequence - 1}`);
  }

  console.log("\nDone processing all chunks.");
  console.log(`Total chunks inserted: ${sequence - 1}`);
}

main().catch((err) => {
  console.error("Error in main:", err);
  process.exit(1);
});
