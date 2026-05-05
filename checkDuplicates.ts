import { getWeaviateClient } from "./weaviateClient";

const COLLECTION_NAME = "BookChunk";

interface ChunkRecord {
  id: string;
  sequence: number;
  textContent: string;
}

async function checkDuplicates() {
  const client = getWeaviateClient();
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix");

  console.log("Checking for duplicates in Weaviate...\n");

  // Get all chunks
  const result = await client.graphql
    .get()
    .withClassName(COLLECTION_NAME)
    .withFields("sequence textContent _additional { id }")
    .withLimit(10000)
    .do();

  const chunks: ChunkRecord[] = (result?.data?.Get?.[COLLECTION_NAME] || []).map(
    (c: any) => ({
      id: c._additional.id,
      sequence: c.sequence,
      textContent: c.textContent,
    })
  );

  console.log(`Total chunks found: ${chunks.length}`);

  // Group by sequence
  const sequenceMap = new Map<number, ChunkRecord[]>();
  chunks.forEach((chunk) => {
    const existing = sequenceMap.get(chunk.sequence) || [];
    existing.push(chunk);
    sequenceMap.set(chunk.sequence, existing);
  });

  // Find duplicates (same sequence number)
  const duplicateSequences: number[] = [];
  const duplicatesToRemove: string[] = [];

  sequenceMap.forEach((records, seq) => {
    if (records.length > 1) {
      duplicateSequences.push(seq);
      // Keep the first one, mark others for removal
      records.slice(1).forEach((r) => duplicatesToRemove.push(r.id));
    }
  });

  // Also check for content duplicates (different sequence, same text)
  const contentMap = new Map<string, ChunkRecord[]>();
  chunks.forEach((chunk) => {
    if (!chunk.textContent) return;
    const key = chunk.textContent.trim().substring(0, 200); // Use first 200 chars as key
    const existing = contentMap.get(key) || [];
    existing.push(chunk);
    contentMap.set(key, existing);
  });

  const contentDuplicates: { text: string; records: ChunkRecord[] }[] = [];
  contentMap.forEach((records, text) => {
    if (records.length > 1) {
      contentDuplicates.push({ text, records });
    }
  });

  console.log(`\nUnique sequences: ${sequenceMap.size}`);
  console.log(`Duplicate sequences (same seq#): ${duplicateSequences.length}`);
  console.log(`Content duplicates (same text): ${contentDuplicates.length}`);

  if (duplicateSequences.length > 0) {
    console.log("\n--- Sequence Duplicates ---");
    duplicateSequences.slice(0, 10).forEach((seq) => {
      const records = sequenceMap.get(seq)!;
      console.log(`\nSequence #${seq}: ${records.length} copies`);
      records.forEach((r, i) => {
        console.log(`  [${i + 1}] ID: ${r.id}`);
        console.log(`      Text: ${(r.textContent || "").substring(0, 80)}...`);
      });
    });
    if (duplicateSequences.length > 10) {
      console.log(`\n... and ${duplicateSequences.length - 10} more duplicate sequences`);
    }
  }

  if (contentDuplicates.length > 0) {
    console.log("\n--- Content Duplicates (different seq#, same text) ---");
    contentDuplicates.slice(0, 5).forEach((dup) => {
      console.log(`\nText: "${(dup.text || "").substring(0, 60)}..."`);
      dup.records.forEach((r) => {
        console.log(`  - Seq #${r.sequence}, ID: ${r.id}`);
      });
    });
    if (contentDuplicates.length > 5) {
      console.log(`  ... and ${contentDuplicates.length - 5} more`);
    }
  }

  // Check for null sequences
  const nullSeqRecords = chunks.filter((c) => c.sequence === null || c.sequence === undefined);
  if (nullSeqRecords.length > 0) {
    console.log(`\n--- Records with NULL sequence: ${nullSeqRecords.length} ---`);
    nullSeqRecords.forEach((r) => {
      duplicatesToRemove.push(r.id);
      console.log(`  ID: ${r.id}`);
    });
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Unique sequences: ${sequenceMap.size}`);
  console.log(`Sequence duplicates to remove: ${duplicatesToRemove.length}`);

  if (shouldFix && duplicatesToRemove.length > 0) {
    console.log("\n--- Removing duplicates ---");
    let removed = 0;
    for (const id of duplicatesToRemove) {
      try {
        await client.data.deleter().withClassName(COLLECTION_NAME).withId(id).do();
        removed++;
        console.log(`Removed: ${id}`);
      } catch (error: any) {
        console.error(`Failed to remove ${id}: ${error.message}`);
      }
    }
    console.log(`\nRemoved ${removed} duplicate chunks`);
  } else if (duplicatesToRemove.length > 0) {
    console.log("\nRun with --fix to remove sequence duplicates");
  }
}

checkDuplicates()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
