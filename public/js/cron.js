// Scheduler (Cron) Component
const CronApp = (() => {
  async function render(container) {
    container.innerHTML = `
      <div style="padding:1rem;display:flex;flex-direction:column;height:100%;gap:1rem">
        <div style="display:flex;gap:0.5rem">
          <input type="text" id="cron-desc" placeholder="e.g. Check the weather every 2 hours" style="flex:1">
          <button class="btn btn-primary" id="cron-add">Add Job</button>
        </div>
        <div id="cron-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem"></div>
      </div>
    `;

    const list = container.querySelector('#cron-list');
    const descInput = container.querySelector('#cron-desc');

    const refresh = async () => {
      const { jobs } = await API.cron.list();
      list.innerHTML = jobs.length ? '' : '<div style="color:var(--text-secondary);text-align:center;padding:2rem">No active jobs. Use the input above to describe a task you want the AI to perform regularly.</div>';
      
      jobs.forEach(job => {
        const div = document.createElement('div');
        div.style = 'background:rgba(255,255,255,0.05);padding:1rem;border-radius:12px;border:1px solid var(--panel-border);display:flex;justify-content:space-between;align-items:center';
        div.innerHTML = `
          <div>
            <div style="font-weight:bold">${job.description}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary)">Action: ${job.action}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary)">Status: ${job.active ? 'Active' : 'Inactive'} | Last run: ${job.lastRun ? new Date(job.lastRun).toLocaleString() : 'Never'}</div>
          </div>
          <div style="display:flex;gap:0.5rem">
            <button class="btn" onclick="API.cron.toggle('${job.id}').then(() => window.dispatchEvent(new CustomEvent('cron-refresh')))">${job.active ? 'Pause' : 'Resume'}</button>
            <button class="btn" style="color:var(--danger-color)" onclick="API.cron.delete('${job.id}').then(() => window.dispatchEvent(new CustomEvent('cron-refresh')))">Delete</button>
          </div>
        `;
        list.appendChild(div);
      });
    };

    container.querySelector('#cron-add').onclick = async () => {
      const desc = descInput.value.trim();
      if (!desc) return;
      descInput.value = '';
      descInput.disabled = true;
      try {
        await API.cron.create(desc);
        refresh();
      } catch (err) {
        alert(err.message);
      } finally {
        descInput.disabled = false;
      }
    };

    window.addEventListener('cron-refresh', refresh);
    refresh();
  }

  return { render };
})();

window.CronApp = CronApp;
