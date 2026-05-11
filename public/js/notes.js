// Notes Component
const NotesApp = (() => {
  async function render(container) {
    container.innerHTML = `
      <div style="display:flex;height:100%">
        <div id="notes-list" style="width:200px;border-right:1px solid var(--panel-border);overflow-y:auto;padding:0.5rem">
          <button class="btn btn-primary btn-full" id="new-note" style="margin-bottom:1rem">+ New Note</button>
          <div id="notes-items"></div>
        </div>
        <div id="note-editor" style="flex:1;display:flex;flex-direction:column;padding:1rem;gap:1rem">
          <input type="text" id="note-title" placeholder="Note Title" style="font-size:1.5rem;font-weight:bold;background:transparent;border:none">
          <textarea id="note-content" style="flex:1;background:transparent;border:none;color:white;font-family:inherit;resize:none" placeholder="Start typing..."></textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary" id="save-note">Save Note</button>
          </div>
        </div>
      </div>
    `;

    const items = container.querySelector('#notes-items');
    const titleInput = container.querySelector('#note-title');
    const contentInput = container.querySelector('#note-content');
    const saveBtn = container.querySelector('#save-note');
    let currentNoteId = null;

    const refreshList = async () => {
      const { notes } = await API.notes.list();
      items.innerHTML = '';
      notes.forEach(note => {
        const div = document.createElement('div');
        div.style = 'padding:0.75rem;cursor:pointer;border-radius:8px;margin-bottom:0.25rem;transition:background 0.2s';
        div.textContent = note.title;
        div.onclick = () => loadNote(note.id);
        items.appendChild(div);
      });
    };

    const loadNote = async (id) => {
      const { note } = await API.notes.get(id);
      currentNoteId = id;
      titleInput.value = note.title;
      if (note.iv && note.salt) {
        contentInput.value = await CryptoModule.decrypt(note, App.getUserPassword());
      } else {
        contentInput.value = '';
      }
    };

    saveBtn.onclick = async () => {
      const title = titleInput.value || 'Untitled';
      const plaintext = contentInput.value;
      const encrypted = await CryptoModule.encrypt(plaintext, App.getUserPassword());
      
      const payload = { title, ...encrypted };
      
      if (currentNoteId) {
        await API.notes.update(currentNoteId, payload);
      } else {
        const res = await API.notes.create(payload);
        currentNoteId = res.note.id;
      }
      refreshList();
      alert('Note saved encrypted!');
    };

    container.querySelector('#new-note').onclick = () => {
      currentNoteId = null;
      titleInput.value = '';
      contentInput.value = '';
    };

    refreshList();
  }

  return { render };
})();

window.NotesApp = NotesApp;
