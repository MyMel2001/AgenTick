// Virtual Browser Component
const BrowserApp = (() => {
  function render(container) {
    container.innerHTML = `
      <div class="browser-window">
        <div class="browser-toolbar">
          <button class="btn" id="browser-back">←</button>
          <button class="btn" id="browser-forward">→</button>
          <button class="btn" id="browser-refresh">↻</button>
          <input type="text" class="browser-url-bar" id="browser-url" placeholder="Enter URL or search..." value="https://duckduckgo.com">
          <button class="btn btn-primary" id="browser-go">Go</button>
        </div>
        <iframe id="browser-frame" class="browser-content" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
    `;

    const urlInput = container.querySelector('#browser-url');
    const goBtn = container.querySelector('#browser-go');
    const frame = container.querySelector('#browser-frame');

    const navigate = async (url) => {
      if (!url.startsWith('http')) url = 'https://' + url;
      urlInput.value = url;
      try {
        const data = await API.browse.fetch(url);
        const blob = new Blob([data.sanitizedHtml], { type: 'text/html' });
        frame.src = URL.createObjectURL(blob);
      } catch (err) {
        frame.srcdoc = `<div style="padding:2rem;color:red">Failed to load: ${err.message}</div>`;
      }
    };

    goBtn.addEventListener('click', () => navigate(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(urlInput.value);
    });

    // Initial load
    navigate('https://duckduckgo.com');
  }

  return { render };
})();

window.BrowserApp = BrowserApp;
