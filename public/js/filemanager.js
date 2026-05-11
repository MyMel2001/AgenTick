// File Manager Component
const FileManagerApp = (() => {
  let currentPath = '/';

  async function render(container) {
    container.innerHTML = `
      <div class="file-manager">
        <div class="fm-toolbar" style="padding:0.5rem;background:rgba(255,255,255,0.05);display:flex;gap:0.5rem;border-bottom:1px solid var(--panel-border)">
          <button class="btn" id="fm-up">↑</button>
          <input type="text" id="fm-path" value="/" style="flex:1;background:transparent;border:none;color:white">
          <button class="btn" id="fm-mkdir">New Folder</button>
          <button class="btn" id="fm-refresh">↻</button>
        </div>
        <div id="fm-list" style="padding:1rem;display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));gap:1rem"></div>
      </div>
    `;

    const list = container.querySelector('#fm-list');
    const pathInput = container.querySelector('#fm-path');
    
    const refresh = async () => {
      list.innerHTML = 'Loading...';
      try {
        const { entries } = await API.files.list(currentPath);
        list.innerHTML = '';
        
        entries.forEach(entry => {
          const item = document.createElement('div');
          item.className = 'fm-item';
          item.style = 'display:flex;flex-direction:column;align-items:center;gap:0.5rem;cursor:pointer;padding:0.5rem;border-radius:8px';
          item.innerHTML = `
            <div style="font-size:2rem">${entry.isDirectory ? '📁' : '📄'}</div>
            <div style="font-size:0.75rem;text-align:center;word-break:break-all">${entry.name}</div>
          `;
          
          item.addEventListener('dblclick', () => {
            if (entry.isDirectory) {
              currentPath = entry.path;
              pathInput.value = currentPath;
              refresh();
            } else {
              previewFile(entry.path);
            }
          });

          item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (confirm(`Delete ${entry.name}?`)) {
              API.files.delete(entry.path).then(refresh);
            }
          });

          list.appendChild(item);
        });
      } catch (err) {
        list.innerHTML = `Error: ${err.message}`;
      }
    };

    container.querySelector('#fm-up').onclick = () => {
      if (currentPath === '/') return;
      currentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
      pathInput.value = currentPath;
      refresh();
    };

    container.querySelector('#fm-mkdir').onclick = async () => {
      const name = prompt('Folder name:');
      if (name) {
        await API.files.mkdir((currentPath === '/' ? '' : currentPath) + '/' + name);
        refresh();
      }
    };

    container.querySelector('#fm-refresh').onclick = refresh;

    refresh();
  }

  async function previewFile(path) {
    try {
      const file = await API.files.read(path);
      let content = '';
      if (file.iv && file.salt) {
        content = await CryptoModule.decrypt(file, App.getUserPassword());
      } else {
        content = file.encryptedContent || '[Empty]';
      }
      alert(`Content of ${path}:\n\n${content}`);
    } catch (err) {
      alert(`Error reading file: ${err.message}`);
    }
  }

  return { render };
})();

window.FileManagerApp = FileManagerApp;
