// AI Terminal Component
const TerminalApp = (() => {
  let conversationHistory = [];

  function render(container) {
    container.innerHTML = `
      <div class="terminal-window">
        <div class="terminal-history" id="term-history">
          <div class="message message-ai">Hello! I am your AgenTick AI assistant. How can I help you today?</div>
        </div>
        <div class="terminal-input-area">
          <input type="text" class="terminal-input" id="term-input" placeholder="Type a message or command..." autocomplete="off">
        </div>
      </div>
    `;

    const input = container.querySelector('#term-input');
    const history = container.querySelector('#term-history');

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const msg = input.value.trim();
        input.value = '';
        await sendMessage(msg, history);
      }
    });
  }

  async function sendMessage(text, historyEl) {
    appendMessage(historyEl, 'user', text);
    
    const aiMsgEl = appendMessage(historyEl, 'ai', '');
    const statusEl = document.createElement('div');
    statusEl.className = 'terminal-status';
    aiMsgEl.appendChild(statusEl);

    const contentEl = document.createElement('div');
    aiMsgEl.appendChild(contentEl);

    try {
      await API.chat.stream(text, conversationHistory, (event, data) => {
        if (event === 'status') {
          statusEl.textContent = `[ ${data.message} ]`;
        } else if (event === 'tool_start') {
          const badge = document.createElement('span');
          badge.className = 'tool-badge';
          badge.textContent = `Using tool: ${data.tool}`;
          aiMsgEl.insertBefore(badge, contentEl);
        } else if (event === 'message') {
          contentEl.textContent += data.content;
          historyEl.scrollTop = historyEl.scrollHeight;
        } else if (event === 'done') {
          statusEl.remove();
          conversationHistory.push({ role: 'user', content: text });
          conversationHistory.push({ role: 'assistant', content: contentEl.textContent });
        }
      });
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  }

  function appendMessage(historyEl, role, text) {
    const div = document.createElement('div');
    div.className = `message message-${role}`;
    if (role === 'user') div.textContent = `> ${text}`;
    else div.textContent = text;
    historyEl.appendChild(div);
    historyEl.scrollTop = historyEl.scrollHeight;
    return div;
  }

  return { render };
})();

window.TerminalApp = TerminalApp;
