/**
 * Frontend logic — tabs, SSE-traced runs, animated workflow graph, result rendering,
 * persistent history (localStorage), per-example settings, markdown export.
 * Vanilla JS, no build step.
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─── Constants ───────────────────────────────────────────────────────────
const HISTORY_KEY = 'mastra-playground:history';
const SETTINGS_KEY = 'mastra-playground:settings';
const HISTORY_CAP_PER_EXAMPLE = 10;

// ─── Tab switching ────────────────────────────────────────────────────────
// Roving tabindex + keyboard navigation per the WAI-ARIA tabs pattern.
// https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
function activateTab(target) {
  const tabs = $$('.tab');
  const targetTab = tabs.find((t) => t.dataset.tab === target);
  if (!targetTab) return;
  tabs.forEach((t) => {
    const active = t === targetTab;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    // Roving tabindex: only the active tab is in the tab order
    t.setAttribute('tabindex', active ? '0' : '-1');
  });
  $$('.panel').forEach((p) => {
    const active = p.id === `panel-${target}`;
    p.classList.toggle('active', active);
    p.hidden = !active;
  });
  // Move focus to the newly-active tab (only when keyboard-driven, not click)
  // Click handling sets focus implicitly via the click target, so we don't move
  // it there. Keyboard handlers below call activateTabAndFocus.
}

$$('.tab').forEach((tab, i, tabs) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (i + 1) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (i - 1 + tabs.length) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'Home') {
      nextIdx = 0;
      e.preventDefault();
    } else if (e.key === 'End') {
      nextIdx = tabs.length - 1;
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Space/Enter on a tab already activates it (browsers do this for buttons),
      // but we add explicit handling so screen readers announce the change.
      activateTab(tab.dataset.tab);
      e.preventDefault();
    }
    if (nextIdx >= 0) {
      const nextTab = tabs[nextIdx];
      activateTab(nextTab.dataset.tab);
      nextTab.focus();
    }
  });
});

// ─── Sample-button autofill ───────────────────────────────────────────────
$$('.sample-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.fill;
    const value = btn.dataset.value;
    if (target) {
      const el = document.getElementById(target);
      if (el) {
        el.value = value ?? '';
        el.focus();
      }
    }
  });
});

// ─── Settings panel toggle + persistence ────────────────────────────────
const settingsStore = {
  load(example) {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      return all[example] || {};
    } catch {
      return {};
    }
  },
  save(example, settings) {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[example] = settings;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('settings save failed', e);
    }
  },
};

$$('.settings-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.toggleSettings;
    const panel = $(`.settings-panel[data-settings="${id}"]`);
    if (panel) panel.hidden = !panel.hidden;
  });
});

// Apply persisted settings on load + listen for changes
for (const example of ['support-triage', 'research', 'code-review', 'parallel-research']) {
  const stored = settingsStore.load(example);
  const modelSelect = $(`select[data-setting="model"][data-for="${example}"]`);
  if (modelSelect && stored.model) modelSelect.value = stored.model;
  const thresholdSlider = $(`input[data-setting="threshold"][data-for="${example}"]`);
  if (thresholdSlider && stored.threshold) thresholdSlider.value = stored.threshold;
  const display = $(`span.slider-value[data-display-for="${example}"]`);
  if (display) display.textContent = stored.threshold ?? '0.75';

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      const cur = settingsStore.load(example);
      settingsStore.save(example, { ...cur, model: modelSelect.value });
    });
  }
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', () => {
      const cur = settingsStore.load(example);
      settingsStore.save(example, { ...cur, threshold: thresholdSlider.value });
      if (display) display.textContent = thresholdSlider.value;
    });
  }
}

// ─── Workflow graph definitions ───────────────────────────────────────────
const GRAPHS = {
  'support-triage': {
    nodes: [
      { id: 'input', label: 'Customer message', kind: 'input', x: 60, y: 60 },
      { id: 'classify', label: 'Classify', kind: 'llm', x: 60, y: 160, label2: 'TriageSchema' },
      { id: 'branch.intent', label: 'branch.intent', kind: 'branch', x: 60, y: 260 },
      { id: 'respond', label: 'Bot responds', kind: 'passthrough', x: -60, y: 380 },
      { id: 'escalate', label: 'Escalate', kind: 'passthrough', x: 180, y: 380 },
    ],
    edges: [
      { from: 'input', to: 'classify' },
      { from: 'classify', to: 'branch.intent' },
      {
        from: 'branch.intent',
        to: 'respond',
        label: 'intent ∈ {how_to, billing}',
        predicate: 'intent how_to or billing',
      },
      { from: 'branch.intent', to: 'escalate', label: 'requires_human', predicate: 'requires_human' },
    ],
  },
  research: {
    nodes: [
      { id: 'input', label: 'Topic', kind: 'input', x: 60, y: 60 },
      { id: 'run-agent', label: 'Research (LLM)', kind: 'llm', x: 60, y: 160, label2: 'with tools' },
      { id: 'format', label: 'Format', kind: 'passthrough', x: 60, y: 260 },
    ],
    edges: [
      { from: 'input', to: 'run-agent' },
      { from: 'run-agent', to: 'format' },
    ],
  },
  'code-review': {
    nodes: [
      { id: 'input', label: 'Filename', kind: 'input', x: 60, y: 60 },
      { id: 'fetch-file', label: 'Read file', kind: 'tool', x: 60, y: 160 },
      { id: 'check-file', label: 'Run lint', kind: 'tool', x: 60, y: 260 },
      { id: 'branch.issues', label: 'branch.issues', kind: 'branch', x: 60, y: 360 },
      { id: 'approve', label: 'Approve (no LLM)', kind: 'passthrough', x: -80, y: 480 },
      { id: 'generate-review', label: 'Generate review', kind: 'llm', x: 200, y: 480, label2: 'LLM writes' },
    ],
    edges: [
      { from: 'input', to: 'fetch-file' },
      { from: 'fetch-file', to: 'check-file' },
      { from: 'check-file', to: 'branch.issues' },
      { from: 'branch.issues', to: 'approve', label: 'issues.length === 0', predicate: 'no issues' },
      { from: 'branch.issues', to: 'generate-review', label: 'issues.length > 0', predicate: 'has issues' },
    ],
  },
  'parallel-research': {
    nodes: [
      { id: 'input', label: 'Topic', kind: 'input', x: 60, y: 60 },
      { id: 'plan', label: 'Plan sub-questions', kind: 'llm', x: 60, y: 160, label2: 'LLM' },
      { id: 'fanout', label: 'Parallel fetch', kind: 'tool', x: 60, y: 260, label2: 'web + arxiv + wiki' },
      { id: 'synthesize', label: 'Synthesize', kind: 'llm', x: 60, y: 380, label2: 'LLM' },
    ],
    edges: [
      { from: 'input', to: 'plan' },
      { from: 'plan', to: 'fanout' },
      { from: 'fanout', to: 'synthesize' },
    ],
  },
  'multi-turn-chat': {
    nodes: [
      { id: 'input', label: 'User message', kind: 'input', x: 60, y: 60 },
      { id: 'chat', label: 'Chat (LLM)', kind: 'llm', x: 60, y: 160, label2: 'with memory' },
    ],
    edges: [{ from: 'input', to: 'chat' }],
  },
  'hitl-approval': {
    nodes: [
      { id: 'input', label: 'Proposed action', kind: 'input', x: 60, y: 60 },
      { id: 'classify', label: 'Classify (LLM)', kind: 'llm', x: 60, y: 160, label2: 'amount + urgency' },
      { id: 'gate', label: 'Gate', kind: 'branch', x: 60, y: 280, label2: 'suspend or auto' },
      { id: 'execute', label: 'Execute', kind: 'passthrough', x: 60, y: 420 },
    ],
    edges: [
      { from: 'input', to: 'classify' },
      { from: 'classify', to: 'gate' },
      { from: 'gate', to: 'execute', label: 'approved', when: { kind: 'auto-approved' } },
    ],
  },
  'streaming-chat': {
    nodes: [
      { id: 'input', label: 'Prompt', kind: 'input', x: 60, y: 60 },
      { id: 'stream', label: 'Stream (LLM)', kind: 'llm', x: 60, y: 180, label2: 'token-by-token' },
    ],
    edges: [{ from: 'input', to: 'stream' }],
  },
  'multi-agent-handoff': {
    nodes: [
      { id: 'input', label: 'Customer message', kind: 'input', x: 60, y: 60 },
      { id: 'primary', label: 'Triage agent', kind: 'llm', x: 60, y: 180, label2: 'routes' },
      { id: 'specialist', label: 'Billing specialist', kind: 'llm', x: 200, y: 320, label2: 'on delegate only' },
    ],
    edges: [
      { from: 'input', to: 'primary' },
      { from: 'primary', to: 'specialist', label: 'handoff', when: { kind: 'delegated' } },
    ],
  },
};

function renderGraph(containerId, def) {
  const el = $(`#${containerId}`);
  if (!el) return;
  const xs = def.nodes.map((n) => n.x);
  const ys = def.nodes.map((n) => n.y);
  const padding = 30;
  const w = Math.max(...xs) - Math.min(...xs) + 200;
  const h = Math.max(...ys) - Math.min(...ys) + 100;
  const minX = Math.min(...xs) - 100 + padding;
  const minY = Math.min(...ys) - 30 + padding;
  const NODE_W = 180;
  const NODE_H = 56;

  const nodeEls = {};
  const edgeEls = {};

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${w} ${h}`);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.maxHeight = '520px';
  svg.style.display = 'block';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow-${containerId}" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,-5L10,0L0,5" fill="var(--border)" />
    </marker>
    <marker id="arrow-active-${containerId}" viewBox="0 -5 10 10" refX="9" refY="0" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,-5L10,0L0,5" fill="var(--green)" />
    </marker>
  `;
  svg.appendChild(defs);

  for (const edge of def.edges) {
    const fromNode = def.nodes.find((n) => n.id === edge.from);
    const toNode = def.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) continue;
    const x1 = fromNode.x;
    const y1 = fromNode.y + NODE_H / 2;
    const x2 = toNode.x;
    const y2 = toNode.y - NODE_H / 2;
    const midY = (y1 + y2) / 2;
    const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('class', 'gn-edge');
    pathEl.setAttribute('data-from', edge.from);
    pathEl.setAttribute('data-to', edge.to);
    pathEl.setAttribute('marker-end', `url(#arrow-${containerId})`);
    svg.appendChild(pathEl);
    edgeEls[`${edge.from}->${edge.to}`] = pathEl;

    if (edge.label) {
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2;
      const labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelEl.setAttribute('x', labelX);
      labelEl.setAttribute('y', labelY);
      labelEl.setAttribute('text-anchor', 'middle');
      labelEl.setAttribute('class', 'gn-edge-label');
      labelEl.setAttribute('data-from', edge.from);
      labelEl.setAttribute('data-to', edge.to);
      labelEl.textContent = edge.label;
      svg.appendChild(labelEl);
      edgeEls[`${edge.from}->${edge.to}_label`] = labelEl;
    }
  }

  for (const node of def.nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `gn-node kind-${node.kind}`);
    g.setAttribute('data-node', node.id);
    g.setAttribute('transform', `translate(${node.x - NODE_W / 2}, ${node.y - NODE_H / 2})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', NODE_W);
    rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', 8);
    g.appendChild(rect);

    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelText.setAttribute('x', NODE_W / 2);
    labelText.setAttribute('y', 22);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.textContent = node.label;
    g.appendChild(labelText);

    if (node.label2) {
      const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      sub.setAttribute('x', NODE_W / 2);
      sub.setAttribute('y', 40);
      sub.setAttribute('text-anchor', 'middle');
      sub.setAttribute('class', 'gn-id');
      sub.textContent = node.label2;
      g.appendChild(sub);
    }

    const kindLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    kindLabel.setAttribute('x', NODE_W / 2);
    kindLabel.setAttribute('y', 50);
    kindLabel.setAttribute('text-anchor', 'middle');
    kindLabel.setAttribute('class', 'gn-kind gn-id');
    kindLabel.textContent = node.kind;
    g.appendChild(kindLabel);

    svg.appendChild(g);
    nodeEls[node.id] = g;
  }

  el.innerHTML = '';
  el.appendChild(svg);
  return { nodeEls, edgeEls };
}

const graphRefs = {};
for (const [name, def] of Object.entries(GRAPHS)) {
  graphRefs[name] = renderGraph(`graph-${name}`, def);
}

// ─── Thread state (multi-turn chat) ─────────────────────────────────────
const THREAD_KEY = 'mastra-playground:threadId';
const threadState = {
  get() {
    return localStorage.getItem(THREAD_KEY) || '';
  },
  set(threadId) {
    localStorage.setItem(THREAD_KEY, threadId);
  },
  clear() {
    localStorage.removeItem(THREAD_KEY);
  },
};

function generateThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateThreadDisplay() {
  const display = $('#thread-id-display');
  if (display) display.textContent = threadState.get() || '—';
}

$('#new-conversation-btn')?.addEventListener('click', async () => {
  // Generate a fresh client-side threadId and clear the display.
  // Threads are localStorage-only — the server has no per-thread state, so
  // there is nothing to call. (The audit flagged this as "fire-and-forget
  // POST" — that was a misread; the original code never made a request.)
  const newThreadId = generateThreadId();
  threadState.set(newThreadId);
  updateThreadDisplay();
  // Clear the chat display
  const outputEl = $(`.col-output[data-output="multi-turn-chat"]`);
  if (outputEl) {
    outputEl.innerHTML = `<div class="output-actions"><button class="copy-md-btn" disabled>Copy as Markdown</button></div>
      <div class="chat-thread" data-thread></div>`;
  }
});

$('#clear-thread-btn')?.addEventListener('click', async () => {
  const threadId = threadState.get();
  if (!threadId) return;
  await fetch('/api/run/multi-turn-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, resourceId: 'web-user', message: '', action: 'clear' }),
  });
  const outputEl = $(`.col-output[data-output="multi-turn-chat"]`);
  if (outputEl) {
    outputEl.innerHTML = `<div class="output-actions"><button class="copy-md-btn" disabled>Copy as Markdown</button></div>
      <div class="chat-thread" data-thread></div>`;
  }
  // Clear trace
  const eventsEl = $(`#events-multi-turn-chat`);
  if (eventsEl) eventsEl.innerHTML = '';
});

// Initialize thread display on load
updateThreadDisplay();

// ─── History store ───────────────────────────────────────────────────────
const historyStore = {
  loadAll() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },
  loadFor(example) {
    const all = this.loadAll();
    return all[example] || [];
  },
  saveEntry(example, entry) {
    const all = this.loadAll();
    const list = all[example] || [];
    list.unshift(entry);
    if (list.length > HISTORY_CAP_PER_EXAMPLE) list.length = HISTORY_CAP_PER_EXAMPLE;
    all[example] = list;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('history save failed', e);
    }
  },
  clearAll() {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
  },
  clearFor(example) {
    const all = this.loadAll();
    delete all[example];
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    } catch {}
  },
};

function renderRecentChips() {
  for (const example of ['support-triage', 'research', 'code-review', 'parallel-research']) {
    const container = $(`.recent-runs[data-recent="${example}"]`);
    if (!container) continue;
    const entries = historyStore.loadFor(example);
    container.innerHTML = '';
    if (entries.length === 0) continue;
    entries.slice(0, 3).forEach((entry) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'recent-chip';
      const summary = entry.resultSummary || JSON.stringify(entry.result).slice(0, 50);
      const inputPreview = String(Object.values(entry.input)[0] ?? '').slice(0, 30);
      chip.innerHTML = `<span>${escapeHtml(inputPreview)}</span><span class="chip-result">${escapeHtml(summary)}</span>`;
      chip.title = `${new Date(entry.ts).toLocaleString()} · click to replay`;
      chip.addEventListener('click', () => replayEntry(example, entry));
      container.appendChild(chip);
    });
    const viewAll = document.createElement('button');
    viewAll.type = 'button';
    viewAll.className = 'recent-view-all';
    viewAll.textContent = `View all (${entries.length})`;
    viewAll.addEventListener('click', () => openHistoryPanel(example));
    container.appendChild(viewAll);
  }
}

function replayEntry(example, entry) {
  // Fill the form input and submit
  const form = $(`form[data-form="${example}"]`);
  if (!form) return;
  const inputEl = form.querySelector('textarea, input[type="text"]');
  if (inputEl) {
    const val = Object.values(entry.input)[0];
    if (val !== undefined) inputEl.value = String(val);
  }
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

// ─── History panel ───────────────────────────────────────────────────────
// Track the element that had focus when the panel opened so we can restore it
// when the panel closes (a11y best practice for modal dialogs).
let lastFocusedBeforeHistory = null;
function trapFocusInDialog(panel, enable) {
  if (enable) {
    lastFocusedBeforeHistory = document.activeElement;
    // Find the first focusable element in the panel and focus it
    const focusable = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    if (first) first.focus();

    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const focusableNow = panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableNow.length === 0) return;
      const firstNow = focusableNow[0];
      const lastNow = focusableNow[focusableNow.length - 1];
      if (e.shiftKey && document.activeElement === firstNow) {
        e.preventDefault();
        lastNow.focus();
      } else if (!e.shiftKey && document.activeElement === lastNow) {
        e.preventDefault();
        firstNow.focus();
      }
    };
    panel.addEventListener('keydown', trap);
    panel._trapHandler = trap;
  } else {
    if (panel._trapHandler) {
      panel.removeEventListener('keydown', panel._trapHandler);
      delete panel._trapHandler;
    }
    if (lastFocusedBeforeHistory && lastFocusedBeforeHistory.focus) {
      lastFocusedBeforeHistory.focus();
    }
    lastFocusedBeforeHistory = null;
  }
}

function openHistoryPanel(example) {
  const panel = $('#history-panel');
  const list = $('#history-list');
  if (!panel || !list) return;
  list.innerHTML = '';

  // Show all examples, grouped
  const all = historyStore.loadAll();
  const allEntries = [];
  for (const ex of Object.keys(all)) {
    for (const e of all[ex]) allEntries.push({ ...e, example: ex });
  }
  allEntries.sort((a, b) => b.ts - a.ts);

  if (allEntries.length === 0) {
    list.innerHTML = '<div class="history-empty">No history yet. Run a few examples to see them here.</div>';
  } else {
    allEntries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const inputVal = String(Object.values(entry.input)[0] ?? '');
      const summary = entry.resultSummary || JSON.stringify(entry.result).slice(0, 80);
      item.innerHTML = `
        <div class="history-item-head">
          <span class="history-item-ts">${formatTs(entry.ts)} · ${entry.example}</span>
          <span class="history-item-duration">${(entry.totalMs / 1000).toFixed(2)}s</span>
        </div>
        <div class="history-item-input">${escapeHtml(inputVal)}</div>
        <div class="history-item-result">${escapeHtml(summary)}</div>
        <div class="history-item-actions">
          <button data-action="replay" data-example="${entry.example}">Replay</button>
          <button data-action="delete" data-example="${entry.example}" data-ts="${entry.ts}">Delete</button>
        </div>
      `;
      item.querySelector('[data-action="replay"]').addEventListener('click', () => {
        closeHistoryPanel();
        replayEntry(entry.example, entry);
      });
      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        deleteEntry(entry.example, entry.ts);
      });
      list.appendChild(item);
    });
  }

  panel.hidden = false;
  trapFocusInDialog(panel, true);
}

function closeHistoryPanel() {
  const panel = $('#history-panel');
  if (panel) {
    panel.hidden = true;
    trapFocusInDialog(panel, false);
  }
}

function deleteEntry(example, ts) {
  const all = historyStore.loadAll();
  if (all[example]) {
    all[example] = all[example].filter((e) => e.ts !== ts);
    if (all[example].length === 0) delete all[example];
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    } catch {}
  }
  renderRecentChips();
  openHistoryPanel(); // re-render
}

$('#history-close')?.addEventListener('click', closeHistoryPanel);
$('#history-overlay')?.addEventListener('click', closeHistoryPanel);
// Escape key closes the history panel (a11y: standard modal pattern)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const panel = $('#history-panel');
    if (panel && !panel.hidden) closeHistoryPanel();
  }
});
$('#history-clear')?.addEventListener('click', () => {
  historyStore.clearAll();
  renderRecentChips();
  closeHistoryPanel();
});

// Escape key closes the history panel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const panel = $('#history-panel');
    if (panel && !panel.hidden) closeHistoryPanel();
  }
});

function formatTs(ts) {
  return new Date(ts).toLocaleString('en-US', {
    hour12: false,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

renderRecentChips();

// ─── Form submission → SSE stream ────────────────────────────────────────
$$('form[data-form]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.dataset.form;
    const outputEl = $(`.col-output[data-output="${name}"]`);
    const eventsEl = $(`#events-${name}`);
    const submitBtn = form.querySelector('.run-btn');
    const data = Object.fromEntries(new FormData(form).entries());

    // Attach per-example settings to the request
    const settings = settingsStore.load(name);

    // Multi-turn chat: ensure a threadId exists
    let requestBody = { ...data, ...settings };
    if (name === 'multi-turn-chat') {
      let threadId = threadState.get();
      if (!threadId) {
        threadId = generateThreadId();
        threadState.set(threadId);
        updateThreadDisplay();
      }
      requestBody = { ...requestBody, threadId, resourceId: 'web-user' };
      // Show loading bubble in chat
      const thread =
        outputEl.querySelector('.chat-thread') ||
        (() => {
          outputEl.innerHTML = `<div class="output-actions"><button class="copy-md-btn" disabled>Copy as Markdown</button></div>
          <div class="chat-thread" data-thread></div>`;
          return outputEl.querySelector('.chat-thread');
        })();
      const loading = document.createElement('div');
      loading.className = 'chat-loading';
      loading.innerHTML = '<div class="spinner"></div> Thinking…';
      thread.appendChild(loading);
      thread.scrollTop = thread.scrollHeight;
    } else {
      outputEl.innerHTML = `<div class="output-actions"><button class="copy-md-btn" disabled>Copy as Markdown</button></div>
        <div class="output-loading"><div class="spinner"></div>Running workflow…</div>`;
    }

    resetGraph(name);
    if (eventsEl) eventsEl.innerHTML = '';

    if (submitBtn) submitBtn.disabled = true;

    const inputParam = encodeURIComponent(JSON.stringify(requestBody));
    const url = `/api/stream/${name}?input=${inputParam}`;

    const evtSource = new EventSource(url);
    const collectedEvents = [];
    let result = null;
    let doneReceived = false;

    evtSource.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      collectedEvents.push(event);
      handleTraceEvent(name, event, eventsEl, outputEl, (r) => {
        result = r;
      });
      if (event.type === 'done') {
        doneReceived = true;
        evtSource.close();
        if (submitBtn) submitBtn.disabled = false;
        // For chat: remove the loading bubble before renderChat
        if (name === 'multi-turn-chat') {
          const loading = outputEl.querySelector('.chat-loading');
          if (loading) loading.remove();
        }
        // Reconstruct the same shape the POST /api/run endpoint returns
        const runResult = {
          status: event.status,
          input: requestBody,
          output: result,
          error: event.status !== 'success' ? (result?.error ?? String(result ?? '')) : null,
          totalMs: event.totalMs,
        };
        if (event.status === 'success') {
          renderFinalResult(name, outputEl, { ok: true, result: runResult });
        } else {
          renderFinalResult(name, outputEl, { ok: false, error: runResult.error });
        }
        // Save to history + attach markdown export
        saveRunToHistory(name, requestBody, result, event.totalMs, collectedEvents);
        attachCopyAsMarkdownButton(name, outputEl, requestBody, result, event.totalMs, collectedEvents);
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      if (submitBtn) submitBtn.disabled = false;
      if (name === 'multi-turn-chat') {
        const loading = outputEl.querySelector('.chat-loading');
        if (loading) loading.remove();
      }
      // If we already received the `done` event, the server closing the
      // connection is normal — don't overwrite the rendered result with
      // an error message. EventSource fires `onerror` on a clean close too.
      if (doneReceived) return;
      // If events have streamed successfully, the workflow is still
      // running on the server. A transient disconnect (cloudflared
      // timeout, idle TCP keepalive) shouldn't be treated as a fatal
      // error — keep the loading state visible so the user can retry.
      if (collectedEvents.length > 0) {
        outputEl.innerHTML = `<div class="output-loading">
          <div class="spinner"></div>Reconnecting to workflow stream…
        </div>`;
        return;
      }
      outputEl.innerHTML = `<div class="output-section">
        <h3>Connection error</h3>
        <div class="output-error">SSE stream disconnected before the workflow started. Check the server logs.</div>
      </div>`;
    };
  });
});

function saveRunToHistory(example, input, result, totalMs, events) {
  const summary = summarizeResult(example, result);
  const stepsTaken = events.filter((e) => e.type === 'step:start').map((e) => e.stepId);
  historyStore.saveEntry(example, {
    ts: Date.now(),
    input,
    result,
    resultSummary: summary,
    totalMs,
    stepsTaken,
  });
  renderRecentChips();
}

function summarizeResult(example, result) {
  if (!result) return 'failed';
  if (example === 'support-triage' && result.triage) {
    return `${result.triage.intent} (${(result.triage.confidence * 100).toFixed(0)}%)`;
  }
  if (example === 'research' && result.formatted) {
    return (
      result.formatted
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .slice(0, 30) || 'ok'
    );
  }
  if (example === 'code-review') {
    return `${result.action} (${result.issueCount} issues)`;
  }
  if (example === 'parallel-research' && result.synthesis) {
    return result.synthesis.split('.')[0].slice(0, 40) + '...';
  }
  if (example === 'multi-turn-chat' && result.allMessages) {
    return `${result.allMessages.length} msg${result.escalated ? ' (escalated)' : ''}`;
  }
  if (example === 'hitl-approval' && result) {
    if (result.executed === true) return 'executed';
    if (result.executed === false) return 'blocked';
    return 'pending';
  }
  if (example === 'multi-agent-handoff' && result) {
    return result.delegated ? 'delegated' : 'answered directly';
  }
  return 'ok';
}

function attachCopyAsMarkdownButton(name, outputEl, input, result, totalMs, events) {
  const btn = outputEl.querySelector('.copy-md-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.addEventListener('click', () => {
    const md = buildMarkdown(name, input, result, totalMs, events);
    navigator.clipboard
      .writeText(md)
      .then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1500);
      })
      .catch((err) => {
        btn.textContent = 'Copy failed';
        console.error(err);
      });
  });
}

function buildMarkdown(name, input, result, totalMs, events) {
  const lines = [];
  const title = name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  lines.push(`# ${title} — ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`);
  lines.push('');
  if (name === 'multi-turn-chat' && result && result.allMessages) {
    lines.push(`**Thread:** \`${result.threadId || input.threadId || '?'}\``);
    if (result.escalated) lines.push(`**Escalated:** ${result.escalationReason || 'yes'}`);
    lines.push('');
    lines.push('## Conversation');
    lines.push('');
    result.allMessages.forEach((msg) => {
      const who = msg.role === 'user' ? '**User**' : '**Agent**';
      lines.push(`${who}: ${msg.content}`);
      lines.push('');
    });
    lines.push('---');
    lines.push('*Generated by Mastra Playground*');
    return lines.join('\n');
  }
  if (name === 'hitl-approval' && result) {
    if (result.classified) {
      const c = result.classified;
      lines.push(`**Action:** ${input.action ?? ''}`);
      lines.push(`**Action type:** ${input.actionType ?? ''}`);
      lines.push(`**Classification:** $${c.amount} ${c.urgency}`);
      lines.push(`**Reasoning:** ${c.reasoning}`);
      lines.push('');
      lines.push(`**Final decision:** ${result.decision} — ${result.message}`);
    } else {
      lines.push('**Pending human approval**');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(result, null, 2));
      lines.push('```');
    }
    lines.push('');
    lines.push(`**Duration:** ${totalMs}ms`);
    lines.push('');
    lines.push('---');
    lines.push('*Generated by Mastra Playground*');
    return lines.join('\n');
  }
  lines.push('**Input:**');
  lines.push('```json');
  lines.push(JSON.stringify(input, null, 2));
  lines.push('```');
  lines.push('');
  lines.push(`**Duration:** ${totalMs}ms`);
  lines.push('');
  const steps = events.filter((e) => e.type === 'step:start').map((e) => e.stepId);
  if (steps.length) {
    lines.push(`**Steps taken:** ${steps.join(' → ')}`);
    lines.push('');
  }
  lines.push('## Result');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('*Generated by Mastra Playground*');
  return lines.join('\n');
}

// ─── Trace event handling ─────────────────────────────────────────────────
function handleTraceEvent(exampleName, event, eventsEl, _outputEl, setResult) {
  const { nodeEls, edgeEls } = graphRefs[exampleName] || {};

  if (eventsEl) {
    const div = document.createElement('div');
    div.className = 'trace-event';
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    div.appendChild(ts);

    const kind = document.createElement('span');
    kind.className = 'kind';
    let kindLabel = '';
    let msg = '';

    switch (event.type) {
      case 'start':
        kindLabel = 'start';
        kind.classList.add('start');
        msg = `Workflow started: ${event.workflow} · input: ${JSON.stringify(event.input).slice(0, 80)}`;
        break;
      case 'step:start':
        kindLabel = 'step';
        kind.classList.add('step');
        msg = `▶ ${event.stepId} (input: ${JSON.stringify(event.input).slice(0, 60)})`;
        if (nodeEls && nodeEls[event.stepId]) nodeEls[event.stepId].classList.add('active');
        break;
      case 'step:end':
        kindLabel = 'step';
        kind.classList.add('step');
        msg = `✓ ${event.stepId} complete`;
        if (nodeEls && nodeEls[event.stepId]) {
          nodeEls[event.stepId].classList.remove('active');
          nodeEls[event.stepId].classList.add('done');
        }
        break;
      case 'branch:evaluate':
        kindLabel = 'branch';
        kind.classList.add('branch');
        div.classList.add('branch');
        msg = `branch: ${event.predicate ?? 'predicate'} → ${event.matched ? '✓ match' : '✗ no match'}`;
        const targetEdge = findEdgeForBranch(exampleName, event.stepId, event.matched);
        if (targetEdge && edgeEls[targetEdge]) {
          edgeEls[targetEdge].classList.add('active');
          const markerId =
            exampleName === 'support-triage'
              ? 'graph-support-triage'
              : exampleName === 'code-review'
                ? 'graph-code-review'
                : exampleName === 'parallel-research'
                  ? 'graph-parallel-research'
                  : 'graph-research';
          edgeEls[targetEdge].setAttribute('marker-end', `url(#arrow-active-${markerId})`);
        }
        dimOtherEdges(exampleName, event.stepId, targetEdge);
        markBranchSiblings(exampleName, event.stepId, targetEdge);
        break;
      case 'llm:structured':
        kindLabel = 'llm';
        kind.classList.add('llm');
        msg = `LLM returned ${event.schema}: ${JSON.stringify(event.data).slice(0, 80)}…`;
        break;
      case 'llm:start':
        kindLabel = 'llm';
        kind.classList.add('llm');
        msg = `LLM streaming${event.model ? ` (${event.model})` : ''}…`;
        break;
      case 'llm:delta': {
        kindLabel = 'llm';
        kind.classList.add('llm');
        msg = `delta #${event.index}: "${event.text}"`;
        // The outputEl parameter is intentionally underscored (unused) in this
        // function — look up the streaming output panel from the DOM instead.
        // (The HITL wrapper at the bottom of the file uses the same pattern.)
        const streamingOut = document.querySelector('.col-output[data-output="streaming-chat"]');
        if (streamingOut) {
          appendStreamingText(streamingOut, event.text);
        } else {
          // Visible fallback so we can diagnose a missing panel
          // without checking the console.
          console.warn('streaming: panel not found for', event);
        }
        break;
      }
      case 'llm:end': {
        kindLabel = 'llm';
        kind.classList.add('llm');
        msg = `LLM done: ${event.totalChars} chars in ${event.durationMs}ms`;
        const streamingOut = document.querySelector('.col-output[data-output="streaming-chat"]');
        if (streamingOut) finalizeStreamingText(streamingOut, event.totalChars, event.durationMs);
        break;
      }
      case 'tool:call':
        kindLabel = 'tool';
        kind.classList.add('tool');
        msg = `tool: ${event.tool} → ${JSON.stringify(event.output).slice(0, 60)}`;
        break;
      case 'done':
        kindLabel = event.status === 'success' ? 'done' : 'failed';
        kind.classList.add('step');
        if (event.status === 'success') {
          kind.classList.add('done');
        } else {
          kind.classList.add('done', 'failed');
        }
        msg = `Workflow ${event.status} in ${event.totalMs}ms`;
        setResult(event.output);
        break;
    }

    kind.textContent = kindLabel;
    div.appendChild(kind);
    const m = document.createElement('span');
    m.className = 'msg';
    m.textContent = msg;
    div.appendChild(m);
    eventsEl.appendChild(div);
    eventsEl.scrollTop = eventsEl.scrollHeight;
  }
}

function findEdgeForBranch(_exampleName, _branchId, _matched) {
  return null;
}
function dimOtherEdges(_exampleName, _branchId, _targetEdge) {}
function markBranchSiblings(_exampleName, _branchId, _targetEdge) {}

function resetGraph(name) {
  const ref = graphRefs[name];
  if (!ref) return;
  for (const id in ref.nodeEls) {
    ref.nodeEls[id].classList.remove('active', 'done', 'skipped');
  }
  for (const id in ref.edgeEls) {
    if (id.endsWith('_label')) {
      ref.edgeEls[id].classList.remove('matched', 'unmatched');
      continue;
    }
    ref.edgeEls[id].classList.remove('active', 'inactive');
  }
}

// ─── Final result rendering ──────────────────────────────────────────────
function renderFinalResult(name, el, json) {
  if (!json.ok) {
    el.innerHTML = `<div class="output-section">
      <h3>Error</h3>
      <div class="output-error">${escapeHtml(json.error ?? 'Unknown error')}</div>
    </div>`;
    return;
  }
  const r = json.result;
  if (name === 'support-triage') return renderTriage(el, r);
  if (name === 'research') return renderResearch(el, r);
  if (name === 'code-review') return renderCodeReview(el, r);
  if (name === 'parallel-research') return renderParallel(el, r);
  if (name === 'multi-turn-chat') return renderChat(el, r);
  if (name === 'hitl-approval') return renderHitl(el, r);
  if (name === 'multi-agent-handoff') return renderMultiAgentHandoff(el, r);
}

function renderTriage(el, r) {
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }
  if (!r.output.triage || !r.output.action) {
    // Output arrived but doesn't have the expected schema (e.g. workflow
    // failed after the LLM call but before the branch). Show what we got.
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status} (unexpected output shape)</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>`;
    return;
  }
  const t = r.output.triage;
  const action = r.output.action;
  el.innerHTML += `
    <div class="output-section">
      <h3>Structured Output (LLM)</h3>
      <div class="summary">
        <div class="summary-item intent-${t.intent}">
          <div class="label">Intent</div>
          <div class="value">${escapeHtml(t.intent)}</div>
        </div>
        <div class="summary-item">
          <div class="label">Urgency</div>
          <div class="value">${escapeHtml(t.urgency)}</div>
        </div>
        <div class="summary-item">
          <div class="label">Confidence</div>
          <div class="value">${Number(t.confidence).toFixed(2)}</div>
        </div>
        <div class="summary-item">
          <div class="label">Requires Human</div>
          <div class="value">${t.requires_human ? 'yes' : 'no'}</div>
        </div>
      </div>
      <div style="color: var(--text-dim); font-size: 13px; font-style: italic;">
        ${escapeHtml(t.summary)}
      </div>
    </div>
    <div class="output-section">
      <h3>Workflow Action</h3>
      <div class="summary">
        <div class="summary-item action-${action}">
          <div class="label">Action</div>
          <div class="value">${escapeHtml(action)}</div>
        </div>
      </div>
    </div>
    <div class="output-section">
      <h3>Response</h3>
      <div class="response-text ${action === 'escalated' ? 'escalated' : ''}">${
        t.response_text ? escapeHtml(t.response_text) : '(no bot response — escalated to human)'
      }</div>
    </div>
    <div class="output-section">
      <h3>Raw JSON</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>
  `;
}

function renderResearch(el, r) {
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }
  if (typeof r.output.formatted !== 'string') {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status} (unexpected output shape)</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>`;
    return;
  }
  el.innerHTML += `
    <div class="output-section">
      <h3>Topic</h3>
      <div class="summary-item" style="display: inline-flex; min-width: 200px;">
        <div class="label">Input</div>
        <div class="value">${escapeHtml(r.input.topic)}</div>
      </div>
    </div>
    <div class="output-section">
      <h3>Research Output (Markdown)</h3>
      <div class="review-text">${escapeHtml(r.output.formatted)}</div>
    </div>
    <div class="output-section">
      <h3>Raw JSON</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>
  `;
}

function renderCodeReview(el, r) {
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }
  if (!r.output.action || !r.output.path) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status} (unexpected output shape)</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>`;
    return;
  }
  const o = r.output;
  const lgtm = o.action === 'approved';
  el.innerHTML += `
    <div class="output-section">
      <h3>Review Decision</h3>
      <div class="summary">
        <div class="summary-item action-${o.action}">
          <div class="label">Action</div>
          <div class="value">${escapeHtml(o.action)}</div>
        </div>
        <div class="summary-item">
          <div class="label">Issues</div>
          <div class="value">${o.issueCount}</div>
        </div>
      </div>
    </div>
    <div class="output-section">
      <h3>${lgtm ? 'Auto-approved (no LLM call)' : 'LLM-Generated Review'}</h3>
      <div class="review-text ${lgtm ? 'lgtm' : ''}">${escapeHtml(o.review)}</div>
    </div>
    <div class="output-section">
      <h3>Raw JSON</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>
  `;
}

function renderParallel(el, r) {
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }
  if (typeof r.output.synthesis !== 'string') {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status} (unexpected output shape)</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>`;
    return;
  }
  el.innerHTML += `
    <div class="output-section">
      <h3>Synthesis</h3>
      <div class="review-text">${escapeHtml(r.output.synthesis)}</div>
    </div>
    <div class="output-section">
      <h3>Raw JSON</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>
  `;
}

function renderChat(el, r) {
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }
  // r.output is the workflow output: { threadId, escalated, newUserMessage, newAssistantMessage, allMessages }
  const o = r.output;
  const allMessages = o.allMessages || [];
  const escalated = o.escalated || false;

  // Find or create the chat-thread container
  let thread = el.querySelector('.chat-thread');
  if (!thread) {
    el.innerHTML = `<div class="chat-thread" data-thread></div>`;
    thread = el.querySelector('.chat-thread');
  }
  thread.innerHTML = '';

  if (allMessages.length === 0) {
    thread.innerHTML = '<div class="chat-empty">No messages yet. Send one above.</div>';
  } else {
    allMessages.forEach((msg) => {
      const div = document.createElement('div');
      div.className = `chat-msg ${msg.role}`;
      const ts = new Date(msg.ts).toLocaleTimeString('en-US', { hour12: false });
      div.innerHTML = `<div>${escapeHtml(msg.content)}</div><div class="chat-msg-meta">${ts}</div>`;
      thread.appendChild(div);
    });
    // Add escalation badge to the last assistant message if escalated
    if (escalated) {
      const lastAssistant = Array.from(thread.children)
        .reverse()
        .find((el) => el.classList.contains('assistant'));
      if (lastAssistant) {
        lastAssistant.classList.add('escalated');
        const badge = document.createElement('div');
        badge.className = 'escalation-badge';
        badge.textContent = `⚠ ESCALATED${o.escalationReason ? ': ' + o.escalationReason : ''}`;
        lastAssistant.appendChild(badge);
      }
    }
    // Auto-scroll to bottom
    thread.scrollTop = thread.scrollHeight;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────
// ─── Streaming helpers (example 07) ────────────────────────────────────
function ensureStreamingView(outputEl) {
  let view = outputEl.querySelector('.streaming-view');
  if (!view) {
    outputEl.innerHTML = `<div class="output-actions"><button class="copy-md-btn" disabled>Copy as Markdown</button></div>
      <div class="streaming-view">
        <div class="streaming-header">Streaming response</div>
        <div class="streaming-text" data-streaming-text></div>
        <div class="streaming-meta" data-streaming-meta aria-live="polite"></div>
      </div>`;
    view = outputEl.querySelector('.streaming-view');
  }
  return {
    textEl: view.querySelector('[data-streaming-text]'),
    metaEl: view.querySelector('[data-streaming-meta]'),
  };
}

function appendStreamingText(outputEl, chunk) {
  const { textEl } = ensureStreamingView(outputEl);
  textEl.textContent += chunk;
  textEl.scrollTop = textEl.scrollHeight;
}

function finalizeStreamingText(outputEl, totalChars, durationMs) {
  const { metaEl } = ensureStreamingView(outputEl);
  if (metaEl) {
    metaEl.textContent = `Done. ${totalChars} chars in ${durationMs}ms.`;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsonHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return escapeHtml(json)
    .replaceAll('&quot;([^&]+?)&quot;\\s*:', '<span class="json-key">&quot;$1&quot;</span>:')
    .replaceAll(': &quot;([^&]*?)&quot;', ': <span class="json-string">&quot;$1&quot;</span>')
    .replaceAll(': (true|false)', ': <span class="json-bool">$1</span>')
    .replaceAll(': (null)', ': <span class="json-null">$1</span>')
    .replaceAll(/: (-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>');
}

// ─── HITL render + click handlers (example 06) ───────────────────────────
function renderHitl(el, r) {
  // The workflow's final output: { classified, decision, executed, message }
  // OR an intermediate "pending approval" state where r.output = { token, classified }
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }

  const o = r.output;

  // Detect the suspended intermediate state: { token, classified }
  if (o.token && o.classified && o.decision === undefined) {
    renderHitlPending(el, o);
    return;
  }

  // Final result
  renderHitlFinal(el, o);
}

function renderHitlPending(el, o) {
  const c = o.classified || {};
  const token = o.token || '';
  el.innerHTML = `
    <div class="pending-approval" data-token="${escapeHtml(token)}">
      <div class="pending-approval-header">⏸ Pending approval</div>
      <div class="pending-approval-detail">
        <span class="pad-label">Amount</span><span class="pad-value">$${c.amount ?? 0}</span>
        <span class="pad-label">Urgency</span><span class="pad-value">${escapeHtml(String(c.urgency ?? '?'))}</span>
        <span class="pad-label">Reasoning</span><span class="pad-value">${escapeHtml(c.reasoning ?? '')}</span>
      </div>
      <div class="pending-approval-actions">
        <button class="btn-approve" data-decision="approved" aria-label="Approve the proposed action">✅ Approve</button>
        <button class="btn-reject" data-decision="rejected" aria-label="Reject the proposed action">❌ Reject</button>
      </div>
      <div class="pending-approval-token">Token: ${escapeHtml(token)}</div>
    </div>
  `;

  // Wire the buttons
  const approve = el.querySelector('.btn-approve');
  const reject = el.querySelector('.btn-reject');
  if (approve) approve.addEventListener('click', () => hitlDecide(token, 'approved'));
  if (reject) reject.addEventListener('click', () => hitlDecide(token, 'rejected'));
}

function renderHitlFinal(el, o) {
  const c = o.classified || {};
  const bannerClass = o.executed ? 'executed' : 'blocked';
  const icon = o.executed ? '✅' : '🛑';
  const label = o.executed ? 'Action executed' : 'Action blocked';
  el.innerHTML += `
    <div class="hitl-final-banner ${bannerClass}">
      <span class="icon">${icon}</span>
      <span>${label}: ${escapeHtml(o.message ?? '')}</span>
    </div>
    <div class="output-section">
      <h3>Classification</h3>
      <div class="pending-approval-detail">
        <span class="pad-label">Amount</span><span class="pad-value">$${c.amount ?? 0}</span>
        <span class="pad-label">Urgency</span><span class="pad-value">${escapeHtml(String(c.urgency ?? '?'))}</span>
        <span class="pad-label">Reasoning</span><span class="pad-value">${escapeHtml(c.reasoning ?? '')}</span>
        <span class="pad-label">Decision</span><span class="pad-value">${escapeHtml(o.decision ?? '?')}</span>
      </div>
    </div>
    <div class="output-section">
      <h3>Raw JSON</h3>
      <pre class="json-pre">${jsonHighlight(o)}</pre>
    </div>
  `;
}

// POST /api/resume/:token — non-SSE, one-shot JSON
async function hitlDecide(token, decision) {
  const outputEl = $('.col-output[data-output="hitl-approval"]');
  const approve = outputEl?.querySelector('.btn-approve');
  const reject = outputEl?.querySelector('.btn-reject');
  if (approve) approve.disabled = true;
  if (reject) reject.disabled = true;
  try {
    const resp = await fetch(`/api/resume/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const json = await resp.json();
    if (json.ok) {
      const runResult = {
        status: json.result.status,
        input: { token, decision },
        output: json.result.output,
        error: json.result.error,
      };
      renderFinalResult('hitl-approval', outputEl, { ok: true, result: runResult });
    } else {
      outputEl.innerHTML = `<div class="output-section">
        <h3>Resume failed</h3>
        <div class="output-error">${escapeHtml(json.error ?? 'unknown')}</div>
      </div>`;
    }
  } catch (err) {
    outputEl.innerHTML = `<div class="output-section">
      <h3>Resume failed</h3>
      <div class="output-error">${escapeHtml(String(err))}</div>
    </div>`;
  }
}

// Trace event handler extension: mark the gate node as "suspended"
// (highlighted in orange) and the execute node as "skipped" until resume
const _origHandleTraceEvent = handleTraceEvent;
window.handleTraceEvent = function (name, event, eventsEl, outputEl, onResult) {
  _origHandleTraceEvent(name, event, eventsEl, outputEl, onResult);
  if (name !== 'hitl-approval') return;
  if (event.type === 'suspend') {
    const gateNode = document.querySelector('#graph-hitl-approval [data-node="gate"]');
    if (gateNode) gateNode.classList.add('suspended');
  } else if (event.type === 'resume') {
    const gateNode = document.querySelector('#graph-hitl-approval [data-node="gate"]');
    const execNode = document.querySelector('#graph-hitl-approval [data-node="execute"]');
    if (gateNode) gateNode.classList.remove('suspended');
    if (execNode) execNode.classList.add('active');
  }
};

// ─── Multi-agent handoff render (example 09) ───────────────────────────
function renderMultiAgentHandoff(el, r) {
  if (!r.output) {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status}</h3>
      <div class="output-error">${escapeHtml(r.error ?? 'no output')}</div>
    </div>`;
    return;
  }
  if (typeof r.output.message !== 'string') {
    el.innerHTML = `<div class="output-section">
      <h3>Workflow ${r.status} (unexpected output shape)</h3>
      <pre class="json-pre">${jsonHighlight(r.output)}</pre>
    </div>`;
    return;
  }
  const o = r.output;
  const path = (o.agentPath || []).join(' → ');
  const delegated = !!o.delegated;
  el.innerHTML = `
    <div class="output-section">
      <h3>Agent path</h3>
      <div class="agent-path">
        ${(o.agentPath || []).map((a, i) =>
          `<span class="agent-tag">${escapeHtml(a)}</span>${i < o.agentPath.length - 1 ? '<span class="agent-arrow">→</span>' : ''}`
        ).join('')}
      </div>
    </div>
    <div class="output-section">
      <h3>Delegation</h3>
      <div class="summary-item">
        <div class="label">Delegated to specialist?</div>
        <div class="value">${delegated ? '✅ yes' : '❌ no'}</div>
      </div>
    </div>
    ${o.specialistResponse ? `
    <div class="output-section">
      <h3>Specialist response</h3>
      <div class="review-text">${escapeHtml(o.specialistResponse)}</div>
    </div>
    ` : ''}
    <div class="output-section">
      <h3>Final answer to customer</h3>
      <div class="review-text">${escapeHtml(o.message)}</div>
    </div>
  `;
}
