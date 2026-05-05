import * as dotenv from "dotenv";
import { TwitterApi } from "twitter-api-v2";
import { getWeaviateClient } from "./weaviateClient";

dotenv.config();

// Twitter client (lazy initialized)
let twitterClient: TwitterApi | null = null;

function getTwitterClient(): TwitterApi {
  if (!twitterClient) {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      throw new Error(
        "Twitter API credentials not configured. Please set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET in your .env file."
      );
    }

    twitterClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessTokenSecret,
    });
  }
  return twitterClient;
}

export async function postToTwitter(tweetText: string): Promise<{ id: string; url: string }> {
  const client = getTwitterClient();
  const rwClient = client.readWrite;

  const result = await rwClient.v2.tweet(tweetText);

  return {
    id: result.data.id,
    url: `https://twitter.com/i/status/${result.data.id}`,
  };
}

export function isTwitterConfigured(): boolean {
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_TOKEN_SECRET
  );
}

const COLLECTION_NAME = "BookChunk";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

interface ChunkResult {
  id: string;
  textContent: string;
  sequence: number;
  lastUsed?: string;
}

async function callOllamaAPI(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: false,
      options: {
        temperature: 0.8,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.message.content;
}

async function getChunksBySemanticSearch(query: string, limit: number = 3): Promise<ChunkResult[]> {
  const client = getWeaviateClient();

  const result = await client.graphql
    .get()
    .withClassName(COLLECTION_NAME)
    .withFields("textContent sequence lastUsed _additional { id }")
    .withNearText({
      concepts: [query],
    })
    .withLimit(limit)
    .do();

  const chunks = result?.data?.Get?.[COLLECTION_NAME] || [];

  return chunks.map((chunk: any) => ({
    id: chunk._additional.id,
    textContent: chunk.textContent,
    sequence: chunk.sequence,
    lastUsed: chunk.lastUsed,
  }));
}

async function getChunksByHybridSearch(query: string, limit: number = 3, alpha: number = 0.5): Promise<ChunkResult[]> {
  const client = getWeaviateClient();

  // alpha: 0 = pure keyword (BM25), 1 = pure vector, 0.5 = balanced hybrid
  const result = await client.graphql
    .get()
    .withClassName(COLLECTION_NAME)
    .withFields("textContent sequence lastUsed _additional { id score }")
    .withHybrid({
      query,
      alpha,
    })
    .withLimit(limit)
    .do();

  const chunks = result?.data?.Get?.[COLLECTION_NAME] || [];

  return chunks.map((chunk: any) => ({
    id: chunk._additional.id,
    textContent: chunk.textContent,
    sequence: chunk.sequence,
    lastUsed: chunk.lastUsed,
  }));
}

async function getChunksByReference(referenceText: string, limit: number = 5): Promise<ChunkResult[]> {
  const client = getWeaviateClient();

  // Use hybrid search with very low alpha to prioritize exact text matches
  const result = await client.graphql
    .get()
    .withClassName(COLLECTION_NAME)
    .withFields("textContent sequence lastUsed _additional { id score }")
    .withHybrid({
      query: referenceText,
      alpha: 0.2, // Heavily favor keyword matching for exact references
    })
    .withLimit(limit)
    .do();

  const chunks = result?.data?.Get?.[COLLECTION_NAME] || [];

  return chunks.map((chunk: any) => ({
    id: chunk._additional.id,
    textContent: chunk.textContent,
    sequence: chunk.sequence,
    lastUsed: chunk.lastUsed,
  }));
}

async function getRandomChunk(): Promise<ChunkResult | null> {
  const client = getWeaviateClient();

  // Get total count first
  const aggregateResult = await client.graphql
    .aggregate()
    .withClassName(COLLECTION_NAME)
    .withFields("meta { count }")
    .do();

  const totalCount = aggregateResult?.data?.Aggregate?.[COLLECTION_NAME]?.[0]?.meta?.count || 0;

  if (totalCount === 0) {
    return null;
  }

  // Get random offset
  const randomOffset = Math.floor(Math.random() * totalCount);

  const result = await client.graphql
    .get()
    .withClassName(COLLECTION_NAME)
    .withFields("textContent sequence lastUsed _additional { id }")
    .withLimit(1)
    .withOffset(randomOffset)
    .do();

  const chunks = result?.data?.Get?.[COLLECTION_NAME] || [];

  if (chunks.length === 0) {
    return null;
  }

  const chunk = chunks[0];
  return {
    id: chunk._additional.id,
    textContent: chunk.textContent,
    sequence: chunk.sequence,
    lastUsed: chunk.lastUsed,
  };
}

async function updateLastUsed(chunkId: string): Promise<void> {
  const client = getWeaviateClient();

  await client.data
    .updater()
    .withId(chunkId)
    .withClassName(COLLECTION_NAME)
    .withProperties({
      lastUsed: new Date().toISOString(),
    })
    .do();
}

export async function generateTweet(options: {
  searchQuery?: string;
  referenceText?: string;
  tweetStyle?: string;
  useHybridSearch?: boolean;
  hybridAlpha?: number;
}): Promise<{ tweet: string; sourceChunk: ChunkResult }> {
  const {
    searchQuery,
    referenceText,
    tweetStyle = "inspirational and thought-provoking",
    useHybridSearch = true,
    hybridAlpha = 0.7 // Favor vector search slightly
  } = options;

  // Retrieve chunk(s)
  let chunk: ChunkResult | null;

  if (referenceText) {
    // User provided a specific text reference/quote from the book
    console.log(`Finding chunks matching reference text...`);
    const chunks = await getChunksByReference(referenceText, 1);
    chunk = chunks[0] || null;
    if (chunk) {
      console.log(`Found matching chunk #${chunk.sequence}`);
    }
  } else if (searchQuery) {
    if (useHybridSearch) {
      console.log(`Hybrid searching for chunks about: "${searchQuery}" (alpha=${hybridAlpha})`);
      const chunks = await getChunksByHybridSearch(searchQuery, 1, hybridAlpha);
      chunk = chunks[0] || null;
    } else {
      console.log(`Semantic searching for chunks about: "${searchQuery}"`);
      const chunks = await getChunksBySemanticSearch(searchQuery, 1);
      chunk = chunks[0] || null;
    }
  } else {
    console.log("Getting random chunk...");
    chunk = await getRandomChunk();
  }

  if (!chunk) {
    throw new Error("No chunks found in Weaviate database");
  }

  console.log(`Using chunk #${chunk.sequence}`);

  // Generate tweet with Ollama (Llama)
  const systemPrompt = `You are a social media content creator specializing in spiritual and philosophical content.
Your task is to create engaging tweets inspired by spiritual teachings.

Style guidelines:
- ${tweetStyle}
- Keep it under 280 characters
- Make it shareable and relatable
- Distill the essence of the teaching into modern language
- Use line breaks for emphasis when appropriate
- No hashtags unless specifically requested`;

  const userPrompt = `Create a tweet inspired by this spiritual teaching:\n\n${chunk.textContent}`;

  const tweet = await callOllamaAPI(userPrompt, systemPrompt);

  // Update last used timestamp
  await updateLastUsed(chunk.id);

  return {
    tweet: tweet.trim(),
    sourceChunk: chunk,
  };
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const searchQuery = args[0]; // Optional search query

  generateTweet({ searchQuery })
    .then(({ tweet, sourceChunk }) => {
      console.log("\n" + "=".repeat(60));
      console.log("GENERATED TWEET:");
      console.log("=".repeat(60));
      console.log(tweet);
      console.log("=".repeat(60));
      console.log(`Source: Chunk #${sourceChunk.sequence}`);
      console.log("=".repeat(60) + "\n");
    })
    .catch((err) => {
      console.error("Error generating tweet:", err);
      process.exit(1);
    });
}
