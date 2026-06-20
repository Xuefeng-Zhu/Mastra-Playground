// Lightweight interaction demo for the mockup.
// Fuses the timeline ↔ graph: clicking a timeline row pulses the corresponding
// graph node. Hovering a node highlights its timeline rows.
//
// Pure demo behavior — none of this ships; the real version lives in app.js.

(function () {
  // Click a timeline row → highlight matching graph node(s)
  document.querySelectorAll('.tl-row').forEach((row) => {
    row.addEventListener('click', () => {
      const step = row.dataset.step;
      if (!step) return;
      flashNode(step);
    });
  });

  // Hover a node → dim other nodes, filter timeline to that step
  document.querySelectorAll('.node').forEach((node) => {
    const step = node.querySelector('.node-id')?.textContent;
    if (!step) return;

    node.addEventListener('mouseenter', () => {
      document.querySelectorAll('.tl-row').forEach((r) => {
        r.style.opacity = r.dataset.step === step ? '1' : '0.25';
      });
      // dim other nodes slightly
      document.querySelectorAll('.node').forEach((n) => {
        if (n !== node) n.style.opacity = '0.35';
      });
      // pulse edge from this node
      pulseEdges(step);
    });
    node.addEventListener('mouseleave', () => {
      document.querySelectorAll('.tl-row').forEach((r) => (r.style.opacity = ''));
      document.querySelectorAll('.node').forEach((n) => (n.style.opacity = ''));
      document.querySelectorAll('.edge').forEach((e) => e.classList.remove('edge-flash'));
    });
  });

  function flashNode(step) {
    const node = findNodeByStep(step);
    if (!node) return;
    node.style.transition = 'transform 0.2s';
    node.style.transformOrigin = 'center';
    node.style.transform = 'scale(1.05)';
    setTimeout(() => (node.style.transform = ''), 200);
    pulseEdges(step);
  }

  function findNodeByStep(step) {
    const map = {
      plan: 'plan',
      fanout: 'web',     // any of the parallel tools
      synthesize: 'synthesize',
    };
    const id = map[step] || step;
    return Array.from(document.querySelectorAll('.node')).find((n) => {
      const label = n.querySelector('.node-id')?.textContent;
      return label === id;
    });
  }

  function pulseEdges(step) {
    document.querySelectorAll('.edge').forEach((e) => e.classList.remove('edge-flash'));
    // super-light: just bump opacity for a moment
    document.querySelectorAll('.edge').forEach((e) => {
      e.style.transition = 'stroke 0.2s';
      e.style.opacity = '0.5';
      setTimeout(() => (e.style.opacity = ''), 400);
    });
  }

  // ⌘K fake-open (just flash the search bar)
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
      ev.preventDefault();
      const cmd = document.querySelector('.cmd-k');
      if (!cmd) return;
      cmd.style.borderColor = 'var(--c-accent)';
      cmd.style.boxShadow = '0 0 0 3px var(--c-accent-soft)';
      setTimeout(() => {
        cmd.style.borderColor = '';
        cmd.style.boxShadow = '';
      }, 600);
    }
    // ⌘↵ to "run"
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      const btn = document.querySelector('.run-btn');
      if (!btn) return;
      btn.style.transform = 'scale(0.97)';
      setTimeout(() => (btn.style.transform = ''), 120);
    }
  });
})();
