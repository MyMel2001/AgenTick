// Settings Component for Environment Configuration
const SettingsApp = (() => {
  async function render(container) {
    const { settings } = await API.settings.get();
    
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1.5rem">
        <div class="form-group">
          <label>Agent Identity</label>
          <input type="text" id="set-identity" value="${settings.identity || ''}" placeholder="Who are you to the AI?">
        </div>
        <div class="form-group">
          <label>Display Name</label>
          <input type="text" id="set-display-name" value="${settings.displayName || ''}" placeholder="What should the AI call you?">
        </div>
        <div class="form-group">
          <label>Wallpaper URL</label>
          <input type="text" id="set-wallpaper" value="${settings.wallpaperUrl || ''}" placeholder="https://...">
        </div>
        <div class="form-group">
          <label>Interface Theme</label>
          <select id="set-theme" style="background:rgba(255,255,255,0.05);border:1px solid var(--panel-border);border-radius:12px;padding:0.75rem;color:white">
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark Mode</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light Mode</option>
          </select>
        </div>
        
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--panel-border)">
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem">Operating Environment Modules</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
            <button class="btn" style="font-size:0.8rem" id="nav-files">📁 Files</button>
            <button class="btn" style="font-size:0.8rem" id="nav-scripts">📜 Scripts</button>
            <button class="btn" style="font-size:0.8rem" id="nav-cron">⏰ Scheduler</button>
          </div>
        </div>

        <button class="btn btn-primary" id="save-settings">Save Environment Changes</button>
      </div>
    `;

    container.querySelector('#save-settings').onclick = async () => {
      const newSettings = {
        identity: container.querySelector('#set-identity').value,
        displayName: container.querySelector('#set-display-name').value,
        wallpaperUrl: container.querySelector('#set-wallpaper').value,
        theme: container.querySelector('#set-theme').value
      };
      
      try {
        await API.settings.update(newSettings);
        App.applySettings(newSettings);
        alert('Environment updated');
      } catch (err) {
        alert(err.message);
      }
    };

    // Module Navigation (Open as temporary modals or just alerts for now as we transition)
    container.querySelector('#nav-files').onclick = () => {
      alert('Use the AI to manage your files. Type: "List my files" or "Read /notes.txt"');
    };
    container.querySelector('#nav-scripts').onclick = () => {
      // For now, we'll keep the script editor accessible via settings if they really want the GUI
      const modalBody = document.getElementById('settings-body');
      ScriptsApp.render(modalBody);
    };
    container.querySelector('#nav-cron').onclick = () => {
      const modalBody = document.getElementById('settings-body');
      CronApp.render(modalBody);
    };
  }

  return { render };
})();

window.SettingsApp = SettingsApp;
