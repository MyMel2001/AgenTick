// Main AI Chat Interface (Operating Environment Controller)
const TerminalApp = (() => {
  let conversationHistory = [];

  function render(container) {
    const history = document.getElementById('term-history');
    const input = document.getElementById('term-input');
    const btn = document.getElementById('ai-btn');

    const addMessage = (role, content) => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message message-${role}`;
      msgDiv.innerHTML = `
        <div class="message-content">${formatContent(content)}</div>
      `;
      history.appendChild(msgDiv);
      history.scrollTop = history.scrollHeight;
      return msgDiv;
    };

    const addToolUsage = (tool, args) => {
      const toolDiv = document.createElement('div');
      toolDiv.className = 'tool-badge';
      toolDiv.innerHTML = `<span>⚙️</span> Running <strong>${tool}</strong>...`;
      history.appendChild(toolDiv);
      history.scrollTop = history.scrollHeight;
      return toolDiv;
    };

    const formatContent = (text) => {
      // Basic markdown-like formatting for lines and bold
      return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
    };

    const handleSend = async () => {
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      addMessage('user', text);

      let currentAIMsg = addMessage('ai', '...');
      let currentToolEl = null;

      try {
        await API.chat.stream(text, conversationHistory, (event, data) => {
          if (event === 'status') {
            currentAIMsg.querySelector('.message-content').textContent = data.message;
          } else if (event === 'tool_start') {
            currentToolEl = addToolUsage(data.tool, data.args);
          } else if (event === 'tool_result') {
            if (currentToolEl) {
              currentToolEl.innerHTML = `<span>✅</span> Finished <strong>${data.tool}</strong>`;
              currentToolEl.style.opacity = '0.7';
            }
          } else if (event === 'message') {
            currentAIMsg.querySelector('.message-content').innerHTML = formatContent(data.content);
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: data.content });
          } else if (event === 'error') {
            currentAIMsg.querySelector('.message-content').style.color = 'var(--danger-color)';
            currentAIMsg.querySelector('.message-content').textContent = `Error: ${data.message}`;
          }
        });
      } catch (err) {
        currentAIMsg.querySelector('.message-content').textContent = `Error: ${err.message}`;
      }
    };

    btn.onclick = handleSend;
    input.onkeydown = (e) => { e.key === 'Enter' && handleSend(); };

    // Initial greeting
    addMessage('ai', "Welcome to AgenTick. I am your operating environment. How can I assist you today?");
  }

  return { render };
})();

window.TerminalApp = TerminalApp;
