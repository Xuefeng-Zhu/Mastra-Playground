import pkg from "jsdom"; const { JSDOM, ResourceLoader } = pkg;
import { readFileSync } from 'fs';

const html = readFileSync('/home/azureuser/workspace/mastra-playground/public/index.html', 'utf8');
const css = readFileSync('/home/azureuser/workspace/mastra-playground/public/style.css', 'utf8');
const js = readFileSync('/home/azureuser/workspace/mastra-playground/public/app.js', 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost:8917/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

// stub EventSource
class ES { constructor() {} close(){} }
window.EventSource = ES;
window.fetch = async () => ({ ok: true, json: async () => ({}) });

// strip script tag from HTML
const stripped = html.replace(/<script src="\/app\.js"[^>]*><\/script>/, '');
window.document.open(); window.document.write(stripped + `<style>${css}</style>`);
window.document.close();

// capture errors
window.addEventListener('error', e => {
  console.log('ERR:', e.message, e.filename, e.lineno, e.colno);
});
window.onerror = (m, src, ln, col, err) => {
  console.log('ONERR:', m, '@', ln + ':' + col, '|', err && err.stack ? err.stack.split('\n').slice(0,3).join('\n  ') : '(no stack)');
};

try {
  window.eval(js);
  console.log('EVAL OK');
} catch (e) {
  console.log('EVAL THREW:', e.message);
  console.log(e.stack.split('\n').slice(0,5).join('\n'));
}
