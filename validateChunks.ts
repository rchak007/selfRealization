import { getWeaviateClient } from "./weaviateClient";

async function validate() {
  const client = getWeaviateClient();

  const result = await client.graphql
    .get()
    .withClassName("BookChunk")
    .withFields("sequence textContent")
    .withLimit(10000)
    .do();

  const chunks = result?.data?.Get?.BookChunk || [];

  console.log("=== CHUNK VALIDATION REPORT ===\n");
  console.log("Total chunks:", chunks.length);

  // Find chunks that look like JSON arrays (bad)
  const jsonChunks = chunks.filter((c: any) => {
    const t = c.textContent || "";
    return t.startsWith("[") || t.startsWith("{");
  });

  console.log("JSON-like chunks (problematic):", jsonChunks.length);
  if (jsonChunks.length > 0) {
    console.log("\nSample JSON chunks:");
    jsonChunks.slice(0, 3).forEach((c: any) => {
      console.log(`  Seq #${c.sequence}: ${c.textContent?.substring(0, 80)}...`);
    });
  }

  // Valid text chunks
  const validChunks = chunks.filter((c: any) => {
    const t = c.textContent || "";
    return t.length > 0 && t.charAt(0) !== "[" && t.charAt(0) !== "{";
  });

  console.log("\nValid text chunks:", validChunks.length);

  // Sequence analysis
  const sequences = chunks.map((c: any) => c.sequence).filter((s: any) => s != null);
  const maxSeq = Math.max(...sequences);
  const minSeq = Math.min(...sequences);
  console.log("Sequence range:", minSeq, "to", maxSeq);

  // Find chunks from Part 2+ (assuming Part 1 ends around seq 320)
  const laterChunks = validChunks.filter((c: any) => c.sequence > 320);
  console.log("Chunks after seq 320:", laterChunks.length);

  // Sample chunks from different ranges
  console.log("\n=== SAMPLE CHUNKS ===");
  const sampleSeqs = [1, 100, 200, 300, 350, 400, 450];
  for (const targetSeq of sampleSeqs) {
    const chunk = chunks.find((c: any) => c.sequence === targetSeq);
    if (chunk) {
      const text = (chunk.textContent || "")
        .substring(0, 100)
        .replace(/\n/g, " ")
        .trim();
      console.log(`\nSeq #${targetSeq}: ${text}...`);
    }
  }

  // Length statistics
  const lengths = validChunks.map((c: any) => (c.textContent || "").length);
  const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const shortCount = lengths.filter((l) => l < 50).length;

  console.log("\n=== STATISTICS ===");
  console.log("Average chunk length:", avgLen, "chars");
  console.log("Short chunks (<50 chars):", shortCount);
  console.log("Percentage valid:", ((validChunks.length / chunks.length) * 100).toFixed(1) + "%");
}

validate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
