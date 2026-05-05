import * as http from "http";
import { getWeaviateClient } from "./weaviateClient";

const PORT = 3001;
const COLLECTION_NAME = "BookChunk";

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weaviate Data Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 10px; color: #00d9ff; }
    .subtitle { color: #888; margin-bottom: 30px; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #16213e;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #0f3460;
    }
    .stat-card h3 { color: #888; font-size: 0.9rem; margin-bottom: 5px; }
    .stat-card .value { font-size: 2rem; color: #00d9ff; font-weight: bold; }

    .search-section {
      background: #16213e;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 1px solid #0f3460;
    }
    .search-row { display: flex; gap: 15px; flex-wrap: wrap; align-items: center; }
    input, select {
      padding: 12px 16px;
      border: 1px solid #0f3460;
      border-radius: 8px;
      background: #1a1a2e;
      color: #eee;
      font-size: 1rem;
    }
    input:focus, select:focus { outline: none; border-color: #00d9ff; }
    input[type="text"] { flex: 1; min-width: 200px; }
    .btn {
      padding: 12px 24px;
      background: #00d9ff;
      color: #1a1a2e;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn:hover { background: #00b8d4; }
    .btn:disabled { background: #555; cursor: not-allowed; }

    .results-section { margin-top: 20px; }
    .chunk-card {
      background: #16213e;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 15px;
      border: 1px solid #0f3460;
      transition: border-color 0.2s;
    }
    .chunk-card:hover { border-color: #00d9ff; }
    .chunk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .chunk-seq {
      background: #00d9ff;
      color: #1a1a2e;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 0.85rem;
    }
    .chunk-meta { color: #888; font-size: 0.85rem; }
    .chunk-text {
      line-height: 1.6;
      color: #ccc;
      white-space: pre-wrap;
    }
    .score { color: #00d9ff; font-size: 0.85rem; }

    .pagination {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 20px;
    }
    .pagination button {
      padding: 8px 16px;
      background: #0f3460;
      color: #eee;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .pagination button:hover { background: #00d9ff; color: #1a1a2e; }
    .pagination button:disabled { background: #333; color: #666; cursor: not-allowed; }

    .loading { text-align: center; padding: 40px; color: #00d9ff; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab {
      padding: 10px 20px;
      background: #0f3460;
      border: none;
      border-radius: 8px;
      color: #888;
      cursor: pointer;
      font-weight: 600;
    }
    .tab.active { background: #00d9ff; color: #1a1a2e; }

    .chart-container {
      background: #16213e;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 1px solid #0f3460;
    }
    .bar-chart { display: flex; align-items: flex-end; height: 200px; gap: 4px; }
    .bar {
      flex: 1;
      background: linear-gradient(to top, #00d9ff, #0f3460);
      border-radius: 4px 4px 0 0;
      min-width: 20px;
      position: relative;
    }
    .bar:hover { background: linear-gradient(to top, #00ffff, #00d9ff); }
    .bar-label {
      position: absolute;
      bottom: -25px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.7rem;
      color: #888;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Weaviate Data Viewer</h1>
    <p class="subtitle">Explore chunks from Man's Eternal Quest</p>

    <div class="stats-grid" id="stats">
      <div class="stat-card"><h3>Loading...</h3><div class="value">-</div></div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="browse">Browse</button>
      <button class="tab" data-tab="search">Semantic Search</button>
      <button class="tab" data-tab="analytics">Analytics</button>
    </div>

    <div id="browseTab" class="tab-content active">
      <div class="search-section">
        <div class="search-row">
          <input type="number" id="seqFrom" placeholder="From seq" min="1" style="width: 120px" />
          <input type="number" id="seqTo" placeholder="To seq" min="1" style="width: 120px" />
          <select id="sortOrder">
            <option value="asc">Oldest first</option>
            <option value="desc">Newest first</option>
          </select>
          <button class="btn" id="browseBtn">Browse</button>
        </div>
      </div>
      <div id="browseResults" class="results-section"></div>
    </div>

    <div id="searchTab" class="tab-content" style="display: none;">
      <div class="search-section">
        <div class="search-row">
          <input type="text" id="searchQuery" placeholder="Search by meaning (e.g., meditation, consciousness, karma)" />
          <select id="searchLimit">
            <option value="5">5 results</option>
            <option value="10" selected>10 results</option>
            <option value="20">20 results</option>
          </select>
          <button class="btn" id="searchBtn">Search</button>
        </div>
      </div>
      <div id="searchResults" class="results-section"></div>
    </div>

    <div id="analyticsTab" class="tab-content" style="display: none;">
      <div class="chart-container">
        <h3 style="margin-bottom: 15px; color: #00d9ff;">Chunk Length Distribution</h3>
        <div id="lengthChart" class="bar-chart"></div>
      </div>
      <div class="chart-container">
        <h3 style="margin-bottom: 15px; color: #00d9ff;">Last Used Distribution</h3>
        <div id="usageStats"></div>
      </div>
    </div>
  </div>

  <script>
    let currentPage = 0;
    const pageSize = 10;

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + 'Tab').style.display = 'block';
        if (tab.dataset.tab === 'analytics') loadAnalytics();
      });
    });

    // Load stats
    async function loadStats() {
      const res = await fetch('/api/stats');
      const data = await res.json();
      document.getElementById('stats').innerHTML = \`
        <div class="stat-card"><h3>Total Chunks</h3><div class="value">\${data.totalChunks}</div></div>
        <div class="stat-card"><h3>Sequence Range</h3><div class="value">\${data.minSeq} - \${data.maxSeq}</div></div>
        <div class="stat-card"><h3>Used Chunks</h3><div class="value">\${data.usedChunks}</div></div>
        <div class="stat-card"><h3>Unused Chunks</h3><div class="value">\${data.totalChunks - data.usedChunks}</div></div>
      \`;
    }
    loadStats();

    // Browse
    document.getElementById('browseBtn').addEventListener('click', () => {
      currentPage = 0;
      loadBrowse();
    });

    async function loadBrowse() {
      const from = document.getElementById('seqFrom').value || 1;
      const to = document.getElementById('seqTo').value || 99999;
      const order = document.getElementById('sortOrder').value;

      const res = await fetch(\`/api/browse?from=\${from}&to=\${to}&order=\${order}&offset=\${currentPage * pageSize}&limit=\${pageSize}\`);
      const data = await res.json();

      const resultsDiv = document.getElementById('browseResults');
      if (data.chunks.length === 0) {
        resultsDiv.innerHTML = '<p style="text-align: center; color: #888;">No chunks found</p>';
        return;
      }

      resultsDiv.innerHTML = data.chunks.map(c => \`
        <div class="chunk-card">
          <div class="chunk-header">
            <span class="chunk-seq">#\${c.sequence}</span>
            <span class="chunk-meta">\${c.lastUsed ? 'Used: ' + new Date(c.lastUsed).toLocaleDateString() : 'Never used'}</span>
          </div>
          <div class="chunk-text">\${c.textContent}</div>
        </div>
      \`).join('') + \`
        <div class="pagination">
          <button onclick="prevPage()" \${currentPage === 0 ? 'disabled' : ''}>Previous</button>
          <span style="padding: 8px;">Page \${currentPage + 1}</span>
          <button onclick="nextPage()" \${data.chunks.length < pageSize ? 'disabled' : ''}>Next</button>
        </div>
      \`;
    }

    function prevPage() { if (currentPage > 0) { currentPage--; loadBrowse(); } }
    function nextPage() { currentPage++; loadBrowse(); }

    // Initial browse
    loadBrowse();

    // Semantic search
    document.getElementById('searchBtn').addEventListener('click', loadSearch);
    document.getElementById('searchQuery').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadSearch();
    });

    async function loadSearch() {
      const query = document.getElementById('searchQuery').value;
      if (!query) return;

      const limit = document.getElementById('searchLimit').value;
      const resultsDiv = document.getElementById('searchResults');
      resultsDiv.innerHTML = '<div class="loading">Searching...</div>';

      const res = await fetch(\`/api/search?q=\${encodeURIComponent(query)}&limit=\${limit}\`);
      const data = await res.json();

      if (data.chunks.length === 0) {
        resultsDiv.innerHTML = '<p style="text-align: center; color: #888;">No results found</p>';
        return;
      }

      resultsDiv.innerHTML = data.chunks.map(c => \`
        <div class="chunk-card">
          <div class="chunk-header">
            <span class="chunk-seq">#\${c.sequence}</span>
            <span class="score">Score: \${(c.score * 100).toFixed(1)}%</span>
          </div>
          <div class="chunk-text">\${c.textContent}</div>
        </div>
      \`).join('');
    }

    // Analytics
    async function loadAnalytics() {
      const res = await fetch('/api/analytics');
      const data = await res.json();

      // Length distribution chart
      const maxCount = Math.max(...data.lengthDistribution.map(d => d.count));
      document.getElementById('lengthChart').innerHTML = data.lengthDistribution.map(d => \`
        <div class="bar" style="height: \${(d.count / maxCount) * 100}%">
          <span class="bar-label">\${d.range}</span>
        </div>
      \`).join('');

      // Usage stats
      document.getElementById('usageStats').innerHTML = \`
        <p style="color: #ccc;">
          <strong style="color: #00d9ff;">\${data.usedCount}</strong> chunks have been used for tweet generation<br>
          <strong style="color: #00d9ff;">\${data.unusedCount}</strong> chunks are still unused
        </p>
      \`;
    }
  </script>
</body>
</html>
`;

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const client = getWeaviateClient();

  // Serve HTML
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(htmlTemplate);
    return;
  }

  // Stats API
  if (req.method === "GET" && url.pathname === "/api/stats") {
    try {
      const countResult = await client.graphql
        .aggregate()
        .withClassName(COLLECTION_NAME)
        .withFields("meta { count } sequence { minimum maximum }")
        .do();

      const aggData = countResult?.data?.Aggregate?.[COLLECTION_NAME]?.[0];
      const totalChunks = aggData?.meta?.count || 0;
      const minSeq = aggData?.sequence?.minimum || 0;
      const maxSeq = aggData?.sequence?.maximum || 0;

      // Count used chunks (where lastUsed is not null)
      const usedResult = await client.graphql
        .aggregate()
        .withClassName(COLLECTION_NAME)
        .withWhere({
          path: ["lastUsed"],
          operator: "IsNotNull" as any,
        })
        .withFields("meta { count }")
        .do();

      const usedChunks = usedResult?.data?.Aggregate?.[COLLECTION_NAME]?.[0]?.meta?.count || 0;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ totalChunks, minSeq, maxSeq, usedChunks }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Browse API
  if (req.method === "GET" && url.pathname === "/api/browse") {
    try {
      const from = parseInt(url.searchParams.get("from") || "1");
      const to = parseInt(url.searchParams.get("to") || "99999");
      const order = url.searchParams.get("order") || "asc";
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "10");

      const result = await client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("sequence textContent lastUsed")
        .withWhere({
          operator: "And",
          operands: [
            { path: ["sequence"], operator: "GreaterThanEqual", valueInt: from },
            { path: ["sequence"], operator: "LessThanEqual", valueInt: to },
          ],
        })
        .withSort([{ path: ["sequence"], order: order === "desc" ? "desc" : "asc" }])
        .withOffset(offset)
        .withLimit(limit)
        .do();

      const chunks = result?.data?.Get?.[COLLECTION_NAME] || [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ chunks }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Search API
  if (req.method === "GET" && url.pathname === "/api/search") {
    try {
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit") || "10");

      const result = await client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("sequence textContent lastUsed _additional { certainty }")
        .withNearText({ concepts: [query] })
        .withLimit(limit)
        .do();

      const chunks = (result?.data?.Get?.[COLLECTION_NAME] || []).map((c: any) => ({
        sequence: c.sequence,
        textContent: c.textContent,
        lastUsed: c.lastUsed,
        score: c._additional?.certainty || 0,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ chunks }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Analytics API
  if (req.method === "GET" && url.pathname === "/api/analytics") {
    try {
      // Get all chunks for analysis
      const allChunks = await client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("sequence textContent lastUsed")
        .withLimit(10000)
        .do();

      const chunks = allChunks?.data?.Get?.[COLLECTION_NAME] || [];

      // Length distribution
      const ranges = [
        { range: "0-200", min: 0, max: 200, count: 0 },
        { range: "201-400", min: 201, max: 400, count: 0 },
        { range: "401-600", min: 401, max: 600, count: 0 },
        { range: "601-800", min: 601, max: 800, count: 0 },
        { range: "801-1000", min: 801, max: 1000, count: 0 },
        { range: "1000+", min: 1001, max: Infinity, count: 0 },
      ];

      let usedCount = 0;
      let unusedCount = 0;

      chunks.forEach((c: any) => {
        const len = c.textContent?.length || 0;
        const range = ranges.find((r) => len >= r.min && len <= r.max);
        if (range) range.count++;

        if (c.lastUsed) usedCount++;
        else unusedCount++;
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          lengthDistribution: ranges.map((r) => ({ range: r.range, count: r.count })),
          usedCount,
          unusedCount,
        })
      );
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`\nWeaviate Data Viewer running at http://localhost:${PORT}\n`);
});
