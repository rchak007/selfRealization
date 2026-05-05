import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { OpenAI } from "openai";
import { getWeaviateClient } from "./weaviateClient";

dotenv.config();

const USE_OLLAMA = process.env.USE_OLLAMA === "true";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const openai = !USE_OLLAMA && process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const TEXT_DIR = "./text_parts";
const PROJECT_NAME = "SELF";
const SUB_TOPIC = "ETERNAL-QUEST";
const COLLECTION_NAME = "BookChunk";

async function cleanupDuplicates(): Promise<number> {
  const client = getWeaviateClient();
  console.log("Checking for duplicates to clean up...\n");

  // Get all chunks
  const result = await client.graphql
    .get()
    .withClassName(COLLECTION_NAME)
    .withFields("sequence textContent _additional { id }")
    .withLimit(10000)
    .do();

  const chunks = result?.data?.Get?.[COLLECTION_NAME] || [];
  console.log(`Found ${chunks.length} total chunks`);

  // Group by sequence to find duplicates
  const sequenceMap = new Map<number, Array<{ id: string; text: string }>>();
  chunks.forEach((chunk: any) => {
    const seq = chunk.sequence;
    if (seq == null) return;
    const existing = sequenceMap.get(seq) || [];
    existing.push({ id: chunk._additional.id, text: chunk.textContent || "" });
    sequenceMap.set(seq, existing);
  });

  // Find and remove duplicates (keep first, remove rest)
  const toRemove: string[] = [];
  sequenceMap.forEach((records, seq) => {
    if (records.length > 1) {
      // Keep the first one, mark others for removal
      records.slice(1).forEach((r) => toRemove.push(r.id));
      console.log(`Sequence #${seq}: ${records.length} copies, removing ${records.length - 1}`);
    }
  });

  // Also find content duplicates (same text, different sequence)
  const contentMap = new Map<string, Array<{ id: string; seq: number }>>();
  chunks.forEach((chunk: any) => {
    const text = (chunk.textContent || "").substring(0, 100);
    if (!text) return;
    const existing = contentMap.get(text) || [];
    existing.push({ id: chunk._additional.id, seq: chunk.sequence });
    contentMap.set(text, existing);
  });

  contentMap.forEach((records) => {
    if (records.length > 1) {
      // Keep the one with lowest sequence, remove others
      records.sort((a, b) => a.seq - b.seq);
      records.slice(1).forEach((r) => {
        if (!toRemove.includes(r.id)) {
          toRemove.push(r.id);
          console.log(`Content duplicate at seq #${r.seq}, removing`);
        }
      });
    }
  });

  if (toRemove.length === 0) {
    console.log("No duplicates found.\n");
    return 0;
  }

  console.log(`\nRemoving ${toRemove.length} duplicates...`);

  let removed = 0;
  for (const id of toRemove) {
    try {
      await client.data.deleter().withClassName(COLLECTION_NAME).withId(id).do();
      removed++;
    } catch (error: any) {
      console.error(`Failed to remove ${id}: ${error.message}`);
    }
  }

  console.log(`Removed ${removed} duplicate chunks.\n`);
  return removed;
}

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

function extractJSON(text: string): string[] {
  // Try to find JSON array in the text
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // JSON parsing failed
    }
  }

  // If no valid JSON found, treat the whole text as a single chunk
  console.log("Could not parse JSON, using text as single chunk");
  return [text.trim()];
}

async function chunkTextWithAI(chunkGroup: string): Promise<string[]> {
  const systemPrompt = `You are a text chunking assistant. Split the given passage into 1-3 meaningful chunks.

CRITICAL: Respond with ONLY a valid JSON array. No explanation, no markdown, no extra text.
Format: ["chunk1", "chunk2", "chunk3"]`;

  if (USE_OLLAMA) {
    // Use Ollama
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Split this text into 1-3 chunks. Return ONLY a JSON array:\n\n${chunkGroup}`
          },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.message.content;

    try {
      // Try direct parse first
      return JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from text
      return extractJSON(content);
    }
  } else {
    // Use OpenAI
    if (!openai) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Split this text into chunks:\n\n${chunkGroup}` },
      ],
      temperature: 0.3,
    });

    const raw = response.choices[0].message.content || "";

    try {
      return JSON.parse(raw);
    } catch (e) {
      return extractJSON(raw);
    }
  }
}

async function isDuplicate(textContent: string): Promise<boolean> {
  const client = getWeaviateClient();

  // Use first 200 chars for matching to avoid token limits
  const searchText = textContent.substring(0, 200);

  try {
    const result = await client.graphql
      .get()
      .withClassName(COLLECTION_NAME)
      .withFields("textContent _additional { certainty }")
      .withNearText({ concepts: [searchText] })
      .withLimit(1)
      .do();

    const match = result?.data?.Get?.[COLLECTION_NAME]?.[0];
    const certainty = match?._additional?.certainty || 0;

    // If certainty > 0.85, consider it a duplicate
    if (certainty > 0.85) {
      return true;
    }

    return false;
  } catch (error) {
    // If search fails, assume not duplicate
    return false;
  }
}

async function insertChunk(sequence: number, textContent: string): Promise<boolean> {
  const client = getWeaviateClient();

  // Check for duplicate first
  if (await isDuplicate(textContent)) {
    console.log(`Skipping sequence #${sequence} (duplicate content)`);
    return false;
  }

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

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldCleanup = args.includes("--cleanup");
  const cleanupOnly = args.includes("--cleanup-only");

  // Run cleanup if requested
  if (shouldCleanup || cleanupOnly) {
    await cleanupDuplicates();
    if (cleanupOnly) {
      console.log("Cleanup complete. Exiting.");
      return;
    }
  }

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
  let totalInserted = 0;
  let totalSkipped = 0;

  console.log(`Resuming from sequence #${sequence}`);
  console.log(`Duplicate detection enabled (>85% similarity = skip)\n`);

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const content = fs.readFileSync(path.join(TEXT_DIR, file), "utf-8");
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    let fileInserted = 0;
    let fileSkipped = 0;

    for (let i = 0; i < paragraphs.length; i += 5) {
      const chunkGroup = paragraphs.slice(i, i + 5).join("\n\n");

      let chunks: string[] = [];

      try {
        chunks = await chunkTextWithAI(chunkGroup);
      } catch (err) {
        console.error("Error chunking text:", err);
        continue;
      }

      for (const textChunk of chunks) {
        // Skip if it looks like raw JSON (bad Ollama output)
        if (textChunk.startsWith("[") || textChunk.startsWith("{")) {
          console.log(`Skipping JSON-like chunk at sequence #${sequence}`);
          fileSkipped++;
          sequence++;
          continue;
        }

        const inserted = await insertChunk(sequence, textChunk);
        if (inserted) {
          console.log(`Inserted sequence #${sequence}`);
          fileInserted++;
        } else {
          fileSkipped++;
        }
        sequence++;
      }
    }

    console.log(`   ${file}: ${fileInserted} inserted, ${fileSkipped} skipped`);
    totalInserted += fileInserted;
    totalSkipped += fileSkipped;
  }

  console.log("\n" + "=".repeat(50));
  console.log("INGESTION COMPLETE");
  console.log("=".repeat(50));
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total skipped (duplicates): ${totalSkipped}`);
}

main().catch((err) => {
  console.error("Error in main:", err);
  process.exit(1);
});
