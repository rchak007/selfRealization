import weaviate, { WeaviateClient } from "weaviate-ts-client";
import * as dotenv from "dotenv";

dotenv.config();

let client: WeaviateClient | null = null;

export function getWeaviateClient(): WeaviateClient {
  if (client) {
    return client;
  }

  const weaviateUrl = process.env.WEAVIATE_URL;
  const weaviateApiKey = process.env.WEAVIATE_API_KEY;

  if (!weaviateUrl) {
    throw new Error("WEAVIATE_URL environment variable is required");
  }

  // Build client configuration
  const clientConfig: any = {
    scheme: weaviateUrl.startsWith("https") ? "https" : "http",
    host: weaviateUrl.replace(/^https?:\/\//, ""),
  };

  // Add API key if provided (required for Weaviate Cloud)
  if (weaviateApiKey) {
    clientConfig.apiKey = new weaviate.ApiKey(weaviateApiKey);
  }

  client = weaviate.client(clientConfig);

  return client;
}

export async function closeWeaviateClient(): Promise<void> {
  client = null;
}
