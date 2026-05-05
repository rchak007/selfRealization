import { getWeaviateClient } from "./weaviateClient";

const COLLECTION_NAME = "BookChunk";

export async function setupSchema() {
  const client = getWeaviateClient();

  try {
    // Check if collection already exists
    const exists = await client.schema
      .exists(COLLECTION_NAME)
      .catch(() => false);

    if (exists) {
      console.log(`Collection '${COLLECTION_NAME}' already exists`);
      return;
    }

    // Create the collection schema
    const classObj = {
      class: COLLECTION_NAME,
      description: "Text chunks from spiritual books for content generation",
      vectorizer: "text2vec-transformers", // Free local embeddings
      moduleConfig: {
        "text2vec-transformers": {
          poolingStrategy: "masked_mean",
        },
      },
      properties: [
        {
          name: "projectName",
          dataType: ["text"],
          description: "Project identifier (e.g., SELF)",
        },
        {
          name: "subTopic",
          dataType: ["text"],
          description: "Sub-topic or book name (e.g., ETERNAL-QUEST)",
        },
        {
          name: "sequence",
          dataType: ["int"],
          description: "Sequential order of the chunk",
        },
        {
          name: "textContent",
          dataType: ["text"],
          description: "The actual text content of the chunk",
        },
        {
          name: "lastUsed",
          dataType: ["date"],
          description: "Timestamp when this chunk was last used for content generation",
        },
      ],
    };

    await client.schema.classCreator().withClass(classObj).do();

    console.log(`Created collection '${COLLECTION_NAME}' successfully`);
  } catch (error) {
    console.error("Error setting up schema:", error);
    throw error;
  }
}

// Run this script directly to set up the schema
if (require.main === module) {
  setupSchema()
    .then(() => {
      console.log("Schema setup complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Schema setup failed:", err);
      process.exit(1);
    });
}
