// Inject a small "Copy URL" button next to the H1 of every doc page.
// Runs only in the browser.

import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const BTN_ID = 'wc-copy-url-btn';

function injectButton() {
  if (!ExecutionEnvironment.canUseDOM) return;
  if (document.getElementById(BTN_ID)) return;

  const h1 =
    document.querySelector('article header h1') ||
    document.querySelector('article h1');
  if (!h1) return;

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:inline-flex;align-items:center;gap:.5rem;margin-left:.75rem;vertical-align:middle;';

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = 'Copy URL';
  btn.title = 'Copy this page URL';
  btn.style.cssText =
    'padding:4px 10px;border-radius:6px;border:1px solid var(--ifm-color-emphasis-300);' +
    'background:var(--ifm-background-surface-color);color:var(--ifm-font-color-base);' +
    'font-size:13px;cursor:pointer;line-height:1.4;';

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = old || 'Copy URL';
      }, 1200);
    } catch {
      btn.textContent = 'Copy failed';
    }
  });

  wrap.appendChild(btn);
  h1.appendChild(wrap);
}

function schedule() {
  // Defer so SPA route changes have time to render the new H1
  setTimeout(injectButton, 50);
}

if (ExecutionEnvironment.canUseDOM) {
  schedule();
  // Re-inject on client-side route changes
  const _push = history.pushState;
  history.pushState = function (...args) {
    const r = _push.apply(this, args as Parameters<typeof _push>);
    schedule();
    return r;
  };
  window.addEventListener('popstate', schedule);
}

export {};
