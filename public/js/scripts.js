// Script Editor Component for custom vibe-coded tools
const ScriptsApp = (() => {
  async function render(container) {
    container.innerHTML = `
      <div style="display:flex;height:100%">
        <div id="scripts-list" style="width:200px;border-right:1px solid var(--panel-border);overflow-y:auto;padding:0.5rem">
          <button class="btn btn-primary btn-full" id="new-script" style="margin-bottom:1rem">+ New Tool</button>
          <div id="scripts-items"></div>
        </div>
        <div id="script-editor" style="flex:1;display:flex;flex-direction:column;padding:1rem;gap:1rem">
          <div class="form-group">
            <label>Tool Name</label>
            <input type="text" id="script-name" placeholder="e.g. My Weather Summary">
          </div>
          <div class="form-group">
            <label>Tool Description (How the AI should use it)</label>
            <input type="text" id="script-desc" placeholder="e.g. Summarizes the weather and saves it to a note">
          </div>
          <div class="form-group" style="flex:1;display:flex;flex-direction:column">
            <label>Tool Logic (Vibe-coded / Natural Language or Code)</label>
            <textarea id="script-code" style="flex:1;background:transparent;border:1px solid var(--panel-border);border-radius:12px;color:white;font-family:var(--font-mono);resize:none;padding:1rem" placeholder="Describe the steps the tool should perform..."></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.5rem">
            <button class="btn" style="color:var(--danger-color)" id="delete-script">Delete</button>
            <button class="btn btn-primary" id="save-script">Save Tool</button>
          </div>
        </div>
      </div>
    `;

    const items = container.querySelector('#scripts-items');
    const nameInput = container.querySelector('#script-name');
    const descInput = container.querySelector('#script-desc');
    const codeInput = container.querySelector('#script-code');
    const saveBtn = container.querySelector('#save-script');
    const delBtn = container.querySelector('#delete-script');
    let currentScriptId = null;

    const refreshList = async () => {
      const { scripts } = await API.request('/api/scripts');
      items.innerHTML = '';
      scripts.forEach(script => {
        const div = document.createElement('div');
        div.style = 'padding:0.75rem;cursor:pointer;border-radius:8px;margin-bottom:0.25rem;transition:background 0.2s;border:1px solid transparent';
        if (script.id === currentScriptId) div.style.borderColor = 'var(--accent-color)';
        div.innerHTML = `
          <div style="font-weight:bold;font-size:0.875rem">${script.name}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${script.description}</div>
        `;
        div.onclick = () => loadScript(script.id);
        items.appendChild(div);
      });
    };

    const loadScript = async (id) => {
      const { scripts } = await API.request('/api/scripts');
      const script = scripts.find(s => s.id === id);
      if (!script) return;
      currentScriptId = id;
      nameInput.value = script.name;
      descInput.value = script.description;
      codeInput.value = script.code;
      refreshList();
    };

    saveBtn.onclick = async () => {
      const name = nameInput.value.trim();
      const description = descInput.value.trim();
      const code = codeInput.value.trim();
      
      if (!name || !code) return alert('Name and code are required');
      
      const payload = { name, description, code };
      
      try {
        if (currentScriptId) {
          await API.request(`/api/scripts/${currentScriptId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const res = await API.request('/api/scripts', { method: 'POST', body: JSON.stringify(payload) });
          currentScriptId = res.script.id;
        }
        alert('Tool saved and active!');
        refreshList();
      } catch (err) {
        alert(err.message);
      }
    };

    delBtn.onclick = async () => {
      if (!currentScriptId) return;
      if (confirm('Delete this tool?')) {
        await API.request(`/api/scripts/${currentScriptId}`, { method: 'DELETE' });
        currentScriptId = null;
        nameInput.value = '';
        descInput.value = '';
        codeInput.value = '';
        refreshList();
      }
    };

    container.querySelector('#new-script').onclick = () => {
      currentScriptId = null;
      nameInput.value = '';
      descInput.value = '';
      codeInput.value = '';
      refreshList();
    };

    refreshList();
  }

  return { render };
})();

window.ScriptsApp = ScriptsApp;
