import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { Client } from "pg";
import { OpenAI } from "openai";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = new Client({ connectionString: process.env.DATABASE_URL });

const TEXT_DIR = "./text_parts"; // Put your 9 .txt files here
const PROJECT_NAME = "SELF";
const SUB_TOPIC = "ETERNAL-QUEST";

async function main() {
  await db.connect();

//   const files = fs.readdirSync(TEXT_DIR).filter(f => f.endsWith(".txt")).sort();
  const files = fs.readdirSync(TEXT_DIR)
  .filter(f => f.endsWith(".txt"))
  .sort((a, b) => {
    const partA = a.match(/Part(\d+)([A-Z_]*)/) || [];
    const partB = b.match(/Part(\d+)([A-Z_]*)/) || [];
    const numA = parseInt(partA[1] || "0", 10);
    const numB = parseInt(partB[1] || "0", 10);
    const subA = partA[2] || "";
    const subB = partB[2] || "";
    return numA - numB || subA.localeCompare(subB);
  });

//   let sequence = 1;?
  const { rows } = await db.query(`SELECT MAX(sequence) AS max FROM eternal_quest_chunks`);
  let sequence = (rows[0].max || 0) + 1;
  console.log(`⏩ Resuming from sequence #${sequence}`);


  for (const file of files) {
    const content = fs.readFileSync(path.join(TEXT_DIR, file), "utf-8");
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    for (let i = 0; i < paragraphs.length; i += 5) {
      const chunkGroup = paragraphs.slice(i, i + 5).join("\n\n");

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You're an editor organizing spiritual teachings. Given a long spiritual passage (3–6 paragraphs), split it into 1–3 meaningful sequential chunks. Each chunk should make sense independently. Return as a numbered JSON array like: [\"chunk1\", \"chunk2\"]"
          },
          {
            role: "user",
            content: chunkGroup,
          },
        ],
        temperature: 0.5,
      });

      let chunks: string[] = [];

      try {
        const raw = response.choices[0].message.content || "";
        chunks = JSON.parse(raw);
      } catch (err) {
        console.error("❌ Error parsing OpenAI response:", err);
        continue;
      }

      for (const textChunk of chunks) {
        await db.query(
          `INSERT INTO eternal_quest_chunks (project_name, sub_topic, sequence, text_content, last_used)
           VALUES ($1, $2, $3, $4, NULL)`,
          [PROJECT_NAME, SUB_TOPIC, sequence, textChunk]
        );
        console.log(`✅ Inserted sequence #${sequence}`);
        sequence++;
      }
    }
  }

  await db.end();
  console.log("🌟 Done processing all chunks.");
}

main().catch((err) => {
  console.error("💥 Error in main:", err);
  db.end();
});
