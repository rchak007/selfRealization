# Self-Realization Tweet Bot

A content creation bot that generates tweets inspired by spiritual book texts using Weaviate (vector database) and Llama (via Ollama).

## Architecture

- **Weaviate**: Vector database for storing and semantically searching text chunks
- **Ollama**: Local LLM (Llama) for intelligent chunking and tweet generation
- **Docker Compose**: Containerized environment for all services

## Features

- Parse books into intelligent chunks using AI
- Store chunks with embeddings in Weaviate
- **Hybrid search** combining semantic (vector) + keyword (BM25) search
- **Reference-based search** - paste quotes from the book to find and generate tweets from specific passages
- Generate tweets using Llama (completely free and local)
- Track which chunks have been used to avoid repetition
- Beautiful web UI for easy testing and experimentation
- Configurable search balance (keywords vs. semantic meaning)
- One-command setup with `start.sh`

## Setup

### Quick Setup (Recommended)

```bash
./start.sh
```

This automated script will:
1. Install npm dependencies
2. Start Docker services (Weaviate + Ollama)
3. Wait for services to be ready
4. Pull Llama 3.2 model (~2GB, first time only)
5. Set up Weaviate schema
6. Parse and load book content from `./text_parts/`

### Manual Setup

<details>
<summary>Click to expand manual setup steps</summary>

#### 1. Start Docker Services

```bash
docker-compose up -d
docker exec -it $(docker ps -q -f name=ollama) ollama pull llama3.2
```

#### 2. Configure Environment

```bash
cp .env.example .env
```

#### 3. Install Dependencies

```bash
npm install
```

#### 4. Set Up Weaviate Schema

```bash
npx tsx setupWeaviateSchema.ts
```

#### 5. Parse and Load Book Content

```bash
npx tsx parseAndChunkWeaviate.ts
```

</details>

## Usage

### Web UI (Recommended)

Launch the web interface for easy testing:

```bash
npm run ui
```

Then open http://localhost:3000 in your browser. The UI lets you:
- Generate random tweets
- Search by topic/theme (e.g., "meditation", "karma")
- **Search by book reference** - paste actual quotes from the book
- Choose tweet style
- Toggle between hybrid and semantic search
- Adjust search balance (keyword vs. vector)
- See the source chunk and metadata

### CLI Usage

#### Generate a Random Tweet

```bash
npx tsx tweetBot.ts
```

#### Generate a Tweet About a Specific Topic

```bash
npx tsx tweetBot.ts "meditation"
npx tsx tweetBot.ts "karma and rebirth"
npx tsx tweetBot.ts "the nature of consciousness"
```

## Project Structure

```
.
├── docker-compose.yml           # Weaviate + Ollama services
├── weaviateClient.ts           # Weaviate connection setup
├── setupWeaviateSchema.ts      # Create BookChunk collection
├── parseAndChunkWeaviate.ts    # Parse books and load to Weaviate
├── tweetBot.ts                 # Generate tweets from chunks
├── text_parts/                 # Put your .txt book files here
└── .env                        # Environment configuration
```

## How It Works

### 1. Chunking Pipeline

```
Book Text (.txt)
  → Split into paragraphs
  → Group 5 paragraphs at a time
  → AI splits into 1-3 meaningful chunks
  → Store in Weaviate with embeddings
```

### 2. Tweet Generation

```
Search Query (optional)
  → Hybrid search in Weaviate (vector + BM25)
  → Retrieve relevant chunk
  → Llama generates tweet inspired by chunk
  → Update lastUsed timestamp
```

**Hybrid Search Explained:**
- **Alpha = 0.0**: Pure keyword search (BM25) - exact word matches
- **Alpha = 0.5**: Balanced - equal weight to keywords and meaning
- **Alpha = 0.7**: Favor semantic - prioritize meaning over exact words (default)
- **Alpha = 1.0**: Pure vector search - only semantic similarity

## Configuration Options

### Environment Variables

- `USE_OLLAMA`: Set to `"true"` to use Ollama (recommended, free)
- `OLLAMA_URL`: Ollama API endpoint (default: `http://localhost:11434`)
- `OLLAMA_MODEL`: Llama model to use (default: `llama3.2`)
- `WEAVIATE_URL`: Weaviate endpoint (default: `http://localhost:8080`)
- `OPENAI_API_KEY`: Only needed if `USE_OLLAMA=false`

### Switching Models

To use a different Llama model:

```bash
# Pull the model
docker exec -it $(docker ps -q -f name=ollama) ollama pull llama3.1

# Update .env
OLLAMA_MODEL=llama3.1
```

## API Reference

### `tweetBot.ts`

```typescript
import { generateTweet } from "./tweetBot";

// Generate random tweet
const result = await generateTweet({});

// Generate tweet about specific topic
const result = await generateTweet({
  searchQuery: "meditation and mindfulness",
  tweetStyle: "inspirational and thought-provoking"
});

console.log(result.tweet);
console.log(result.sourceChunk.sequence);
```

## Monitoring

```bash
# View logs
docker-compose logs -f

# Check Weaviate health
curl http://localhost:8080/v1/meta

# Check Ollama health
curl http://localhost:11434/api/tags
```

## Troubleshooting

### Weaviate not starting
- Check if port 8080 is available
- View logs: `docker-compose logs weaviate`

### Ollama model not found
- Pull the model: `docker exec -it $(docker ps -q -f name=ollama) ollama pull llama3.2`
- Check available models: `docker exec -it $(docker ps -q -f name=ollama) ollama list`

### No chunks found
- Run `npx tsx setupWeaviateSchema.ts` to create schema
- Run `npx tsx parseAndChunkWeaviate.ts` to load data

## Cost

Completely free! Everything runs locally:
- Ollama (Llama): Free and open source
- Weaviate: Free self-hosted version
- Embeddings: Free local transformers model

## License

MIT
