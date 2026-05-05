import * as http from "http";
import * as cron from "node-cron";
import { generateTweet, postToTwitter, isTwitterConfigured } from "./tweetBot";
import { getWeaviateClient } from "./weaviateClient";

const COLLECTION_NAME = "BookChunk";

const PORT = 3000;

// Scheduled tweets queue
interface ScheduledTweet {
  id: string;
  tweet: string;
  scheduledTime: Date;
  sourceChunkSequence: number;
  status: "pending" | "posted" | "failed";
  postedUrl?: string;
  error?: string;
}

const scheduledTweets: ScheduledTweet[] = [];
let scheduleEnabled = false;
let scheduleInterval = "0 */6 * * *";
let cronJob: cron.ScheduledTask | null = null;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function startScheduler() {
  if (cronJob) {
    cronJob.stop();
  }

  if (scheduleEnabled && cron.validate(scheduleInterval)) {
    cronJob = cron.schedule(scheduleInterval, async () => {
      console.log("Auto-posting scheduled tweet...");
      const pendingTweet = scheduledTweets.find((t) => t.status === "pending");
      if (pendingTweet) {
        try {
          const result = await postToTwitter(pendingTweet.tweet);
          pendingTweet.status = "posted";
          pendingTweet.postedUrl = result.url;
          console.log(`Posted tweet: ${result.url}`);
        } catch (error: any) {
          pendingTweet.status = "failed";
          pendingTweet.error = error.message;
          console.error("Failed to post tweet:", error.message);
        }
      }
    });
    console.log(`Scheduler started with interval: ${scheduleInterval}`);
  }
}

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tweet Bot - Self Realization</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 { color: #333; margin-bottom: 10px; font-size: 2.5rem; }
    h2 { color: #333; margin: 30px 0 20px; font-size: 1.5rem; border-top: 2px solid #eee; padding-top: 30px; }
    h3 { margin-bottom: 15px; }
    .subtitle { color: #666; margin-bottom: 30px; font-size: 1.1rem; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; color: #333; font-weight: 600; }
    input[type="text"], select, textarea {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.3s;
      font-family: inherit;
    }
    input[type="text"]:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .checkbox-group { display: flex; align-items: center; gap: 10px; }
    input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
    .slider-group { display: flex; align-items: center; gap: 15px; }
    input[type="range"] { flex: 1; height: 6px; border-radius: 5px; background: #e0e0e0; }
    .slider-value { min-width: 50px; text-align: center; font-weight: 600; color: #667eea; }
    .btn {
      padding: 16px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4); }
    .btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
    .btn-full { width: 100%; }
    .btn-twitter { background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%); }
    .btn-twitter:hover { box-shadow: 0 10px 20px rgba(29, 161, 242, 0.4); }
    .btn-success { background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); }
    .btn-danger { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); }
    .btn-secondary { background: #6c757d; }
    .btn-group { display: flex; gap: 10px; margin-top: 20px; }
    .btn-group .btn { flex: 1; }
    #result { margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 12px; display: none; }
    #result.show { display: block; animation: fadeIn 0.3s; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    .tweet-box {
      background: white;
      padding: 20px;
      border-radius: 12px;
      border: 2px solid #1da1f2;
      margin-bottom: 15px;
      white-space: pre-wrap;
      font-size: 1.1rem;
      line-height: 1.6;
    }
    .tweet-editor {
      width: 100%;
      min-height: 120px;
      padding: 20px;
      border-radius: 12px;
      border: 2px solid #1da1f2;
      margin-bottom: 15px;
      font-size: 1.1rem;
      line-height: 1.6;
      resize: vertical;
      font-family: inherit;
    }
    .char-count { text-align: right; color: #666; font-size: 0.9rem; margin-bottom: 15px; }
    .char-count.over { color: #dc3545; font-weight: bold; }
    .source-info { color: #666; font-size: 0.9rem; padding: 10px; background: #fff; border-radius: 8px; }
    .error { background: #fee; border: 2px solid #f00; color: #c00; padding: 15px; border-radius: 8px; }
    .success { background: #d4edda; border: 2px solid #28a745; color: #155724; padding: 15px; border-radius: 8px; }
    .loading { text-align: center; padding: 20px; color: #667eea; font-weight: 600; }
    .hint { font-size: 0.9rem; color: #999; margin-top: 5px; }
    .twitter-status { padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .twitter-status.configured { background: #d4edda; color: #155724; }
    .twitter-status.not-configured { background: #fff3cd; color: #856404; }
    .schedule-section { background: #f8f9fa; padding: 20px; border-radius: 12px; margin-top: 20px; }
    .schedule-controls { display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
    .schedule-controls select { flex: 1; min-width: 200px; }
    .queue-item {
      background: white;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid #667eea;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 15px;
    }
    .queue-item.posted { border-left-color: #28a745; }
    .queue-item.failed { border-left-color: #dc3545; }
    .queue-item .tweet-preview { flex: 1; font-size: 0.95rem; }
    .queue-item .tweet-meta { font-size: 0.8rem; color: #666; margin-top: 5px; }
    .queue-item .queue-actions { display: flex; gap: 5px; }
    .queue-item .queue-actions button { padding: 8px 12px; font-size: 0.85rem; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab {
      padding: 10px 20px;
      background: #e0e0e0;
      border: none;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      font-weight: 600;
      color: #666;
    }
    .tab.active { background: #667eea; color: white; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Data Viewer Styles */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: center; }
    .stat-card h4 { color: #666; font-size: 0.85rem; margin-bottom: 5px; }
    .stat-value { font-size: 1.8rem; color: #667eea; font-weight: bold; }
    .data-tabs { display: flex; gap: 8px; margin-bottom: 15px; }
    .data-tab { padding: 8px 16px; background: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; color: #666; font-size: 0.9rem; }
    .data-tab.active { background: #667eea; color: white; }
    .data-panel { display: none; }
    .data-panel.active { display: block; }
    .filter-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; align-items: center; }
    .chunk-card { background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 4px solid #667eea; }
    .chunk-card:hover { background: #f0f0f5; }
    .chunk-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .chunk-seq { background: #667eea; color: white; padding: 3px 10px; border-radius: 15px; font-weight: bold; font-size: 0.8rem; }
    .chunk-meta { color: #888; font-size: 0.8rem; }
    .chunk-text { line-height: 1.5; color: #444; white-space: pre-wrap; font-size: 0.95rem; }
    .score-badge { color: #667eea; font-size: 0.85rem; font-weight: 600; }
    .pagination { display: flex; justify-content: center; gap: 10px; margin-top: 15px; }
    .pagination button { padding: 8px 16px; background: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; }
    .pagination button:hover:not(:disabled) { background: #667eea; color: white; }
    .pagination button:disabled { background: #ccc; color: #888; cursor: not-allowed; }
    .chart-section { background: #f8f9fa; padding: 20px; border-radius: 10px; }
    .chart-section h4 { color: #667eea; margin-bottom: 15px; }
    .bar-chart { display: flex; align-items: flex-end; height: 150px; gap: 6px; padding-bottom: 25px; }
    .bar { flex: 1; background: linear-gradient(to top, #667eea, #764ba2); border-radius: 4px 4px 0 0; min-width: 30px; position: relative; transition: opacity 0.2s; }
    .bar:hover { opacity: 0.8; }
    .bar-label { position: absolute; bottom: -22px; left: 50%; transform: translateX(-50%); font-size: 0.7rem; color: #666; white-space: nowrap; }
    .bar-count { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 0.75rem; color: #667eea; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Tweet Bot</h1>
    <p class="subtitle">Generate and post inspired tweets from spiritual texts</p>
    <div id="twitterStatus" class="twitter-status"></div>
    <div class="tabs">
      <button class="tab active" data-tab="generate">Generate Tweet</button>
      <button class="tab" data-tab="schedule">Schedule</button>
      <button class="tab" data-tab="queue">Queue (<span id="queueCount">0</span>)</button>
      <button class="tab" data-tab="data">Data Viewer</button>
    </div>

    <div id="generateTab" class="tab-content active">
      <form id="tweetForm">
        <div class="form-group">
          <label>Search Mode</label>
          <select id="searchMode" name="searchMode">
            <option value="random">Random Chunk</option>
            <option value="topic">Search by Topic/Theme</option>
            <option value="reference">Search by Book Reference/Quote</option>
          </select>
        </div>
        <div class="form-group" id="topicGroup" style="display: none;">
          <label for="searchQuery">Topic or Theme <span class="hint">(e.g., meditation, consciousness)</span></label>
          <input type="text" id="searchQuery" name="searchQuery" placeholder="Enter topic..." />
        </div>
        <div class="form-group" id="referenceGroup" style="display: none;">
          <label for="referenceText">Book Reference <span class="hint">(Paste a quote from the book)</span></label>
          <textarea id="referenceText" name="referenceText" rows="4" placeholder="Paste text..."></textarea>
        </div>
        <div class="form-group">
          <label for="tweetStyle">Tweet Style</label>
          <select id="tweetStyle" name="tweetStyle">
            <option value="inspirational and thought-provoking">Inspirational</option>
            <option value="wise and contemplative">Contemplative</option>
            <option value="motivational and uplifting">Motivational</option>
            <option value="philosophical and deep">Philosophical</option>
            <option value="simple and relatable">Simple</option>
          </select>
        </div>
        <div class="form-group">
          <div class="checkbox-group">
            <input type="checkbox" id="useHybridSearch" name="useHybridSearch" checked />
            <label for="useHybridSearch" style="margin: 0;">Use Hybrid Search</label>
          </div>
        </div>
        <div class="form-group" id="alphaGroup">
          <label for="hybridAlpha">Search Balance</label>
          <div class="slider-group">
            <span>Keywords</span>
            <input type="range" id="hybridAlpha" name="hybridAlpha" min="0" max="1" step="0.1" value="0.7" />
            <span>Meaning</span>
            <span class="slider-value" id="alphaValue">0.7</span>
          </div>
        </div>
        <button type="submit" class="btn btn-full" id="generateBtn">Generate Tweet</button>
      </form>
      <div id="result"></div>
    </div>

    <div id="scheduleTab" class="tab-content">
      <div class="schedule-section">
        <h3>Auto-Post Settings</h3>
        <div class="schedule-controls">
          <div class="checkbox-group">
            <input type="checkbox" id="scheduleEnabled" />
            <label for="scheduleEnabled" style="margin: 0;">Enable Auto-Posting</label>
          </div>
          <select id="scheduleInterval">
            <option value="*/30 * * * *">Every 30 minutes</option>
            <option value="0 * * * *">Every hour</option>
            <option value="0 */3 * * *">Every 3 hours</option>
            <option value="0 */6 * * *" selected>Every 6 hours</option>
            <option value="0 */12 * * *">Every 12 hours</option>
            <option value="0 9 * * *">Daily at 9 AM</option>
          </select>
          <button class="btn" id="saveScheduleBtn">Save</button>
        </div>
        <p class="hint" style="margin-top: 15px;">Auto-posts pending tweets from queue at the selected interval.</p>
      </div>
      <div class="schedule-section" style="margin-top: 20px;">
        <h3>Generate Batch for Queue</h3>
        <div style="display: flex; gap: 15px; align-items: center;">
          <select id="batchCount" style="width: 150px;">
            <option value="1">1 tweet</option>
            <option value="3">3 tweets</option>
            <option value="5" selected>5 tweets</option>
            <option value="10">10 tweets</option>
          </select>
          <button class="btn" id="generateBatchBtn">Generate Batch</button>
        </div>
      </div>
    </div>

    <div id="queueTab" class="tab-content">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3>Tweet Queue</h3>
        <button class="btn btn-secondary" id="refreshQueueBtn" style="padding: 8px 16px;">Refresh</button>
      </div>
      <div id="queueList"><p class="hint">No tweets in queue.</p></div>
    </div>

    <div id="dataTab" class="tab-content">
      <div class="stats-grid" id="dataStats">
        <div class="stat-card"><h4>Loading...</h4><div class="stat-value">-</div></div>
      </div>

      <div class="data-tabs">
        <button class="data-tab active" data-dtab="browse">Browse</button>
        <button class="data-tab" data-dtab="search">Semantic Search</button>
        <button class="data-tab" data-dtab="analytics">Analytics</button>
      </div>

      <div id="browsePanel" class="data-panel active">
        <div class="filter-row">
          <input type="number" id="seqFrom" placeholder="From seq" min="1" style="width: 100px" />
          <input type="number" id="seqTo" placeholder="To seq" min="1" style="width: 100px" />
          <select id="sortOrder">
            <option value="asc">Oldest first</option>
            <option value="desc">Newest first</option>
          </select>
          <button class="btn" id="browseBtn">Browse</button>
        </div>
        <div id="browseResults"></div>
      </div>

      <div id="searchPanel" class="data-panel">
        <div class="filter-row">
          <input type="text" id="semanticQuery" placeholder="Search by meaning (e.g., meditation, consciousness)" style="flex: 1" />
          <select id="searchLimit">
            <option value="5">5 results</option>
            <option value="10" selected>10 results</option>
            <option value="20">20 results</option>
          </select>
          <button class="btn" id="semanticSearchBtn">Search</button>
        </div>
        <div id="searchResults"></div>
      </div>

      <div id="analyticsPanel" class="data-panel">
        <div class="chart-section">
          <h4>Chunk Length Distribution</h4>
          <div id="lengthChart" class="bar-chart"></div>
        </div>
        <div class="chart-section" style="margin-top: 20px;">
          <h4>Usage Statistics</h4>
          <div id="usageStats"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentTweet = null;
    let currentSourceChunk = null;
    let twitterConfigured = false;

    const form = document.getElementById('tweetForm');
    const resultDiv = document.getElementById('result');
    const alphaSlider = document.getElementById('hybridAlpha');
    const alphaValue = document.getElementById('alphaValue');
    const hybridCheckbox = document.getElementById('useHybridSearch');
    const alphaGroup = document.getElementById('alphaGroup');
    const generateBtn = document.getElementById('generateBtn');
    const searchMode = document.getElementById('searchMode');
    const topicGroup = document.getElementById('topicGroup');
    const referenceGroup = document.getElementById('referenceGroup');

    async function checkTwitterStatus() {
      try {
        const res = await fetch('/api/twitter-status');
        const data = await res.json();
        twitterConfigured = data.configured;
        const el = document.getElementById('twitterStatus');
        el.className = 'twitter-status ' + (data.configured ? 'configured' : 'not-configured');
        el.innerHTML = data.configured ? 'Twitter/X connected' : 'Twitter not configured. Add API credentials to .env';
      } catch (e) {}
    }
    checkTwitterStatus();

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
        if (tab.dataset.tab === 'queue') refreshQueue();
      });
    });

    alphaSlider.addEventListener('input', (e) => alphaValue.textContent = e.target.value);
    hybridCheckbox.addEventListener('change', (e) => alphaGroup.style.display = e.target.checked ? 'block' : 'none');

    searchMode.addEventListener('change', (e) => {
      topicGroup.style.display = e.target.value === 'topic' ? 'block' : 'none';
      referenceGroup.style.display = e.target.value === 'reference' ? 'block' : 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const mode = formData.get('searchMode');
      const data = {
        searchQuery: mode === 'topic' ? formData.get('searchQuery') : null,
        referenceText: mode === 'reference' ? formData.get('referenceText') : null,
        tweetStyle: formData.get('tweetStyle'),
        useHybridSearch: formData.get('useHybridSearch') === 'on',
        hybridAlpha: parseFloat(formData.get('hybridAlpha'))
      };
      resultDiv.className = 'show';
      resultDiv.innerHTML = '<div class="loading">Generating...</div>';
      generateBtn.disabled = true;
      try {
        const response = await fetch('/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        currentTweet = result.tweet;
        currentSourceChunk = result.sourceChunk;
        showConfirmation(result.tweet, result.sourceChunk);
      } catch (error) {
        resultDiv.innerHTML = '<div class="error">' + error.message + '</div>';
      } finally {
        generateBtn.disabled = false;
      }
    });

    function showConfirmation(tweet, sourceChunk) {
      resultDiv.innerHTML = \`
        <h3 style="margin-bottom: 15px;">Review & Confirm Tweet</h3>
        <textarea class="tweet-editor" id="tweetEditor">\${tweet}</textarea>
        <div class="char-count" id="charCount">\${tweet.length}/280</div>
        <div class="source-info">
          <strong>Source:</strong> Chunk #\${sourceChunk.sequence}
        </div>
        <details style="margin-top: 15px;">
          <summary style="cursor: pointer; font-weight: 600; color: #667eea; padding: 10px; background: #f0f0f0; border-radius: 8px;">View Original Text</summary>
          <div style="margin-top: 10px; padding: 15px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; white-space: pre-wrap; font-size: 0.95rem; max-height: 300px; overflow-y: auto;">\${sourceChunk.textContent}</div>
        </details>
        <div class="btn-group">
          <button class="btn btn-secondary" id="regenerateBtn">Regenerate</button>
          <button class="btn" id="addToQueueBtn">Add to Queue</button>
          <button class="btn btn-twitter" id="postNowBtn" \${twitterConfigured ? '' : 'disabled'}>Post Now</button>
        </div>
      \`;

      const editor = document.getElementById('tweetEditor');
      const counter = document.getElementById('charCount');
      editor.addEventListener('input', () => {
        counter.textContent = editor.value.length + '/280';
        counter.className = 'char-count' + (editor.value.length > 280 ? ' over' : '');
        currentTweet = editor.value;
      });

      document.getElementById('regenerateBtn').addEventListener('click', () => form.dispatchEvent(new Event('submit')));

      document.getElementById('addToQueueBtn').addEventListener('click', async () => {
        try {
          const res = await fetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tweet: editor.value, sourceChunkSequence: currentSourceChunk.sequence })
          });
          if (!res.ok) throw new Error('Failed to add');
          resultDiv.innerHTML = '<div class="success">Added to queue!</div>';
          refreshQueueCount();
        } catch (e) { alert(e.message); }
      });

      document.getElementById('postNowBtn').addEventListener('click', async () => {
        if (editor.value.length > 280) return alert('Too long!');
        if (!confirm('Post this tweet now?')) return;
        const btn = document.getElementById('postNowBtn');
        btn.disabled = true;
        btn.textContent = 'Posting...';
        try {
          const res = await fetch('/api/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tweet: editor.value })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          resultDiv.innerHTML = '<div class="success">Posted! <a href="' + data.url + '" target="_blank">View</a></div>';
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
          btn.textContent = 'Post Now';
        }
      });
    }

    async function refreshQueue() {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        document.getElementById('queueCount').textContent = data.queue.filter(t => t.status === 'pending').length;
        const list = document.getElementById('queueList');
        if (data.queue.length === 0) {
          list.innerHTML = '<p class="hint">No tweets in queue.</p>';
          return;
        }
        list.innerHTML = data.queue.map(item => \`
          <div class="queue-item \${item.status}">
            <div class="tweet-preview">
              <div>\${item.tweet}</div>
              <div class="tweet-meta">
                Chunk #\${item.sourceChunkSequence} | \${item.status}
                \${item.postedUrl ? ' | <a href="' + item.postedUrl + '" target="_blank">View</a>' : ''}
                \${item.error ? ' | ' + item.error : ''}
              </div>
            </div>
            <div class="queue-actions">
              \${item.status === 'pending' ? '<button class="btn btn-twitter" onclick="postFromQueue(\\'' + item.id + '\\')" style="padding:8px 12px">Post</button><button class="btn btn-danger" onclick="removeFromQueue(\\'' + item.id + '\\')" style="padding:8px 12px">Remove</button>' : ''}
            </div>
          </div>
        \`).join('');
      } catch (e) {}
    }

    async function refreshQueueCount() {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        document.getElementById('queueCount').textContent = data.queue.filter(t => t.status === 'pending').length;
      } catch (e) {}
    }

    async function postFromQueue(id) {
      if (!confirm('Post this tweet?')) return;
      try {
        const res = await fetch('/api/queue/' + id + '/post', { method: 'POST' });
        if (!res.ok) throw new Error('Failed');
        alert('Posted!');
        refreshQueue();
      } catch (e) { alert(e.message); }
    }

    async function removeFromQueue(id) {
      if (!confirm('Remove?')) return;
      await fetch('/api/queue/' + id, { method: 'DELETE' });
      refreshQueue();
    }

    document.getElementById('refreshQueueBtn').addEventListener('click', refreshQueue);

    document.getElementById('saveScheduleBtn').addEventListener('click', async () => {
      const enabled = document.getElementById('scheduleEnabled').checked;
      const interval = document.getElementById('scheduleInterval').value;
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, interval })
        });
        if (!res.ok) throw new Error('Failed');
        alert('Saved!');
      } catch (e) { alert(e.message); }
    });

    document.getElementById('generateBatchBtn').addEventListener('click', async () => {
      const count = parseInt(document.getElementById('batchCount').value);
      const btn = document.getElementById('generateBatchBtn');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      try {
        const res = await fetch('/api/generate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert(data.generated + ' tweets added!');
        refreshQueueCount();
        document.querySelector('[data-tab="queue"]').click();
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Generate Batch'; }
    });

    async function loadSchedule() {
      try {
        const res = await fetch('/api/schedule');
        const data = await res.json();
        document.getElementById('scheduleEnabled').checked = data.enabled;
        document.getElementById('scheduleInterval').value = data.interval;
      } catch (e) {}
    }
    loadSchedule();
    refreshQueueCount();

    // Data Viewer functionality
    let dataCurrentPage = 0;
    const dataPageSize = 10;

    // Data tab switching
    document.querySelectorAll('.data-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.data-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.data-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.dtab + 'Panel').classList.add('active');
        if (tab.dataset.dtab === 'analytics') loadDataAnalytics();
      });
    });

    // Load data stats when Data tab is shown
    document.querySelector('[data-tab="data"]').addEventListener('click', () => {
      loadDataStats();
      loadDataBrowse();
    });

    async function loadDataStats() {
      try {
        const res = await fetch('/api/data/stats');
        const data = await res.json();
        document.getElementById('dataStats').innerHTML = \`
          <div class="stat-card"><h4>Total Chunks</h4><div class="stat-value">\${data.totalChunks}</div></div>
          <div class="stat-card"><h4>Sequence Range</h4><div class="stat-value">\${data.minSeq}-\${data.maxSeq}</div></div>
          <div class="stat-card"><h4>Used</h4><div class="stat-value">\${data.usedChunks}</div></div>
          <div class="stat-card"><h4>Unused</h4><div class="stat-value">\${data.totalChunks - data.usedChunks}</div></div>
        \`;
      } catch (e) {
        document.getElementById('dataStats').innerHTML = '<div class="stat-card"><h4>Error loading stats</h4></div>';
      }
    }

    document.getElementById('browseBtn').addEventListener('click', () => {
      dataCurrentPage = 0;
      loadDataBrowse();
    });

    async function loadDataBrowse() {
      const from = document.getElementById('seqFrom').value || 1;
      const to = document.getElementById('seqTo').value || 99999;
      const order = document.getElementById('sortOrder').value;

      try {
        const res = await fetch(\`/api/data/browse?from=\${from}&to=\${to}&order=\${order}&offset=\${dataCurrentPage * dataPageSize}&limit=\${dataPageSize}\`);
        const data = await res.json();
        const resultsDiv = document.getElementById('browseResults');

        if (!data.chunks || data.chunks.length === 0) {
          resultsDiv.innerHTML = '<p class="hint" style="text-align: center;">No chunks found</p>';
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
            <button onclick="dataPrevPage()" \${dataCurrentPage === 0 ? 'disabled' : ''}>Previous</button>
            <span style="padding: 8px;">Page \${dataCurrentPage + 1}</span>
            <button onclick="dataNextPage()" \${data.chunks.length < dataPageSize ? 'disabled' : ''}>Next</button>
          </div>
        \`;
      } catch (e) {
        document.getElementById('browseResults').innerHTML = '<p class="hint" style="text-align: center; color: #c00;">Error loading data</p>';
      }
    }

    function dataPrevPage() { if (dataCurrentPage > 0) { dataCurrentPage--; loadDataBrowse(); } }
    function dataNextPage() { dataCurrentPage++; loadDataBrowse(); }

    // Semantic search
    document.getElementById('semanticSearchBtn').addEventListener('click', loadSemanticSearch);
    document.getElementById('semanticQuery').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadSemanticSearch();
    });

    async function loadSemanticSearch() {
      const query = document.getElementById('semanticQuery').value;
      if (!query) return;

      const limit = document.getElementById('searchLimit').value;
      const resultsDiv = document.getElementById('searchResults');
      resultsDiv.innerHTML = '<div class="loading">Searching...</div>';

      try {
        const res = await fetch(\`/api/data/search?q=\${encodeURIComponent(query)}&limit=\${limit}\`);
        const data = await res.json();

        if (!data.chunks || data.chunks.length === 0) {
          resultsDiv.innerHTML = '<p class="hint" style="text-align: center;">No results found</p>';
          return;
        }

        resultsDiv.innerHTML = data.chunks.map(c => \`
          <div class="chunk-card">
            <div class="chunk-header">
              <span class="chunk-seq">#\${c.sequence}</span>
              <span class="score-badge">Score: \${(c.score * 100).toFixed(1)}%</span>
            </div>
            <div class="chunk-text">\${c.textContent}</div>
          </div>
        \`).join('');
      } catch (e) {
        resultsDiv.innerHTML = '<p class="hint" style="text-align: center; color: #c00;">Search failed</p>';
      }
    }

    // Analytics
    async function loadDataAnalytics() {
      try {
        const res = await fetch('/api/data/analytics');
        const data = await res.json();

        const maxCount = Math.max(...data.lengthDistribution.map(d => d.count));
        document.getElementById('lengthChart').innerHTML = data.lengthDistribution.map(d => \`
          <div class="bar" style="height: \${maxCount > 0 ? (d.count / maxCount) * 100 : 0}%">
            <span class="bar-count">\${d.count}</span>
            <span class="bar-label">\${d.range}</span>
          </div>
        \`).join('');

        document.getElementById('usageStats').innerHTML = \`
          <p><strong style="color: #667eea;">\${data.usedCount}</strong> chunks have been used for tweet generation</p>
          <p><strong style="color: #667eea;">\${data.unusedCount}</strong> chunks are still unused</p>
        \`;
      } catch (e) {
        document.getElementById('usageStats').innerHTML = '<p class="hint" style="color: #c00;">Failed to load analytics</p>';
      }
    }
  </script>
</body>
</html>
`;

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url || "";

  // Serve HTML
  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(htmlTemplate);
    return;
  }

  // Twitter status
  if (req.method === "GET" && url === "/api/twitter-status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ configured: isTwitterConfigured() }));
    return;
  }

  // Generate tweet
  if (req.method === "POST" && url === "/generate") {
    try {
      const body = await parseBody(req);
      const data = JSON.parse(body);
      const result = await generateTweet({
        searchQuery: data.searchQuery || undefined,
        referenceText: data.referenceText || undefined,
        tweetStyle: data.tweetStyle || undefined,
        useHybridSearch: data.useHybridSearch,
        hybridAlpha: data.hybridAlpha,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Post to Twitter immediately
  if (req.method === "POST" && url === "/api/post") {
    try {
      const body = await parseBody(req);
      const { tweet } = JSON.parse(body);
      const result = await postToTwitter(tweet);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Get queue
  if (req.method === "GET" && url === "/api/queue") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ queue: scheduledTweets }));
    return;
  }

  // Add to queue
  if (req.method === "POST" && url === "/api/queue") {
    try {
      const body = await parseBody(req);
      const { tweet, sourceChunkSequence } = JSON.parse(body);
      scheduledTweets.push({
        id: generateId(),
        tweet,
        scheduledTime: new Date(),
        sourceChunkSequence,
        status: "pending",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Post from queue
  const postMatch = url.match(/^\/api\/queue\/([^/]+)\/post$/);
  if (req.method === "POST" && postMatch) {
    const id = postMatch[1];
    const tweet = scheduledTweets.find((t) => t.id === id);
    if (!tweet) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    try {
      const result = await postToTwitter(tweet.tweet);
      tweet.status = "posted";
      tweet.postedUrl = result.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error: any) {
      tweet.status = "failed";
      tweet.error = error.message;
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Delete from queue
  const deleteMatch = url.match(/^\/api\/queue\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const id = deleteMatch[1];
    const idx = scheduledTweets.findIndex((t) => t.id === id);
    if (idx !== -1) scheduledTweets.splice(idx, 1);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Get schedule settings
  if (req.method === "GET" && url === "/api/schedule") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ enabled: scheduleEnabled, interval: scheduleInterval }));
    return;
  }

  // Save schedule settings
  if (req.method === "POST" && url === "/api/schedule") {
    try {
      const body = await parseBody(req);
      const { enabled, interval } = JSON.parse(body);
      scheduleEnabled = enabled;
      scheduleInterval = interval;
      startScheduler();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Generate batch
  if (req.method === "POST" && url === "/api/generate-batch") {
    try {
      const body = await parseBody(req);
      const { count } = JSON.parse(body);
      let generated = 0;
      for (let i = 0; i < count; i++) {
        try {
          const result = await generateTweet({});
          scheduledTweets.push({
            id: generateId(),
            tweet: result.tweet,
            scheduledTime: new Date(),
            sourceChunkSequence: result.sourceChunk.sequence,
            status: "pending",
          });
          generated++;
        } catch (e) {
          console.error("Batch generation error:", e);
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ generated }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Data Viewer APIs
  if (req.method === "GET" && url === "/api/data/stats") {
    try {
      const client = getWeaviateClient();
      const countResult = await client.graphql
        .aggregate()
        .withClassName(COLLECTION_NAME)
        .withFields("meta { count } sequence { minimum maximum }")
        .do();

      const aggData = countResult?.data?.Aggregate?.[COLLECTION_NAME]?.[0];
      const totalChunks = aggData?.meta?.count || 0;
      const minSeq = aggData?.sequence?.minimum || 0;
      const maxSeq = aggData?.sequence?.maximum || 0;

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

  if (req.method === "GET" && url.startsWith("/api/data/browse")) {
    try {
      const client = getWeaviateClient();
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const from = parseInt(urlObj.searchParams.get("from") || "1");
      const to = parseInt(urlObj.searchParams.get("to") || "99999");
      const order = urlObj.searchParams.get("order") || "asc";
      const offset = parseInt(urlObj.searchParams.get("offset") || "0");
      const limit = parseInt(urlObj.searchParams.get("limit") || "10");

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

  if (req.method === "GET" && url.startsWith("/api/data/search")) {
    try {
      const client = getWeaviateClient();
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const query = urlObj.searchParams.get("q") || "";
      const limit = parseInt(urlObj.searchParams.get("limit") || "10");

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

  if (req.method === "GET" && url === "/api/data/analytics") {
    try {
      const client = getWeaviateClient();
      const allChunks = await client.graphql
        .get()
        .withClassName(COLLECTION_NAME)
        .withFields("sequence textContent lastUsed")
        .withLimit(10000)
        .do();

      const chunks = allChunks?.data?.Get?.[COLLECTION_NAME] || [];

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
  console.log(`\nTweet Bot UI running at http://localhost:${PORT}`);
  console.log(`Twitter configured: ${isTwitterConfigured()}\n`);
});
