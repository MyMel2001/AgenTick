// Settings Component
const SettingsApp = (() => {
  async function render(container) {
    const { settings } = await API.settings.get();
    
    container.innerHTML = `
      <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1.5rem">
        <div class="form-group">
          <label>Agent Identity (Who are you to the AI?)</label>
          <input type="text" id="set-identity" value="${settings.identity || ''}" placeholder="e.g. A senior software engineer working on AgenTick">
        </div>
        <div class="form-group">
          <label>Wallpaper Image URL</label>
          <input type="text" id="set-wallpaper" value="${settings.wallpaperUrl || ''}" placeholder="https://images.unsplash.com/...">
        </div>
        <div class="form-group">
          <label>Theme</label>
          <select id="set-theme" style="background:rgba(255,255,255,0.05);border:1px solid var(--panel-border);border-radius:12px;padding:0.75rem;color:white">
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark Mode</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light Mode</option>
          </select>
        </div>
        <button class="btn btn-primary" id="save-settings">Save Settings</button>
      </div>
    `;

    container.querySelector('#save-settings').onclick = async () => {
      const newSettings = {
        identity: container.querySelector('#set-identity').value,
        wallpaperUrl: container.querySelector('#set-wallpaper').value,
        theme: container.querySelector('#set-theme').value
      };
      
      try {
        await API.settings.update(newSettings);
        App.applySettings(newSettings);
        alert('Settings saved!');
      } catch (err) {
        alert(err.message);
      }
    };
  }

  return { render };
})();

window.SettingsApp = SettingsApp;
