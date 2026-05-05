#!/bin/bash

set -e  # Exit on error

# Parse arguments
FORCE_INGEST=false
for arg in "$@"; do
    case $arg in
        --force|-f)
            FORCE_INGEST=true
            shift
            ;;
    esac
done

echo "Starting Self-Realization Tweet Bot Setup..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "${YELLOW}WARNING: No .env file found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo "${GREEN}Created .env file${NC}"
fi

# Step 1: Install dependencies
echo "${BLUE}Step 1/6: Installing npm dependencies...${NC}"
npm install
echo "${GREEN}Dependencies installed${NC}"
echo ""

# Step 2: Start Docker services
echo "${BLUE}Step 2/6: Starting Docker services (Weaviate + Ollama)...${NC}"
docker compose up -d
echo "${GREEN}Docker services started${NC}"
echo ""

# Step 3: Wait for services to be ready
echo "${BLUE}Step 3/6: Waiting for services to be ready...${NC}"
sleep 5

# Check Weaviate health
echo "   Checking Weaviate..."
for i in {1..30}; do
    if curl -s http://localhost:8080/v1/meta > /dev/null 2>&1; then
        echo "${GREEN}   Weaviate is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "   ERROR: Weaviate failed to start. Check logs: docker-compose logs weaviate"
        exit 1
    fi
    sleep 2
done

# Check Ollama health
echo "   Checking Ollama..."
for i in {1..30}; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "${GREEN}   Ollama is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "   ERROR: Ollama failed to start. Check logs: docker-compose logs ollama"
        exit 1
    fi
    sleep 2
done
echo ""

# Step 4: Pull Llama model
echo "${BLUE}Step 4/6: Pulling Llama 3.2 model (this may take a few minutes on first run)...${NC}"
OLLAMA_CONTAINER=$(docker ps -q -f name=ollama)

if [ -z "$OLLAMA_CONTAINER" ]; then
    echo "ERROR: Ollama container not found"
    exit 1
fi

# Check if model already exists
if docker exec $OLLAMA_CONTAINER ollama list | grep -q "llama3.2"; then
    echo "${GREEN}Llama 3.2 model already downloaded${NC}"
else
    echo "   Downloading Llama 3.2 (~2GB)..."
    docker exec $OLLAMA_CONTAINER ollama pull llama3.2
    echo "${GREEN}Llama 3.2 model downloaded${NC}"
fi
echo ""

# Step 5: Set up Weaviate schema
echo "${BLUE}Step 5/6: Setting up Weaviate schema...${NC}"
npx tsx setupWeaviateSchema.ts
echo "${GREEN}Schema created${NC}"
echo ""

# Step 6: Parse and load book content (if text files exist)
echo "${BLUE}Step 6/6: Checking data ingestion...${NC}"

# Check if data already exists in Weaviate
CHUNK_COUNT=$(curl -s "http://localhost:8080/v1/graphql" \
    -H "Content-Type: application/json" \
    -d '{"query": "{ Aggregate { BookChunk { meta { count } } } }"}' \
    2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")

if [ "$CHUNK_COUNT" -gt "0" ] && [ "$FORCE_INGEST" = false ]; then
    echo "${GREEN}   Data already ingested ($CHUNK_COUNT chunks found)${NC}"
    echo "   Use ${YELLOW}./start.sh --force${NC} to re-ingest"
elif [ -d "text_parts" ] && [ "$(ls -A text_parts/*.txt 2>/dev/null)" ]; then
    if [ "$FORCE_INGEST" = true ]; then
        echo "   Force flag detected. Re-ingesting content..."
    else
        echo "   No existing data found. Ingesting content..."
    fi
    npx tsx parseAndChunkWeaviate.ts
    echo "${GREEN}Content loaded${NC}"
else
    echo "${YELLOW}WARNING: No text files found in ./text_parts/ directory${NC}"
    echo "   Add your .txt book files to ./text_parts/ and run: npm run parse"
fi
echo ""

# All done!
echo "${GREEN}================================================${NC}"
echo "${GREEN}Setup Complete!${NC}"
echo "${GREEN}================================================${NC}"
echo ""
echo "Starting Web UI..."
echo "Open: ${YELLOW}http://localhost:3000${NC}"
echo ""
echo "The UI includes:"
echo "  - Generate Tweet tab"
echo "  - Schedule tab"
echo "  - Queue tab"
echo "  - ${BLUE}Data Viewer tab${NC} (browse, search, analytics)"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Start the Web UI
npm run ui
