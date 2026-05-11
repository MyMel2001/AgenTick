// API client for AgenTick backend
const API = (() => {
  async function request(endpoint, options = {}) {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (res.status === 401) {
      // Auto logout if session expired
      window.dispatchEvent(new CustomEvent('unauthorized'));
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  return {
    auth: {
      login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
      register: (username, password) => request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
      logout: () => request('/api/auth/logout', { method: 'POST' }),
      me: () => request('/api/auth/me')
    },
    files: {
      list: (path) => request(`/api/files/list?path=${encodeURIComponent(path || '/')}`),
      read: (path) => request(`/api/files/read?path=${encodeURIComponent(path)}`),
      write: (payload) => request('/api/files/write', { method: 'POST', body: JSON.stringify(payload) }),
      delete: (path) => request(`/api/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
      mkdir: (path) => request('/api/files/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),
      search: (q) => request(`/api/files/search?q=${encodeURIComponent(q)}`)
    },
    settings: {
      get: () => request('/api/settings'),
      update: (settings) => request('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
    },
    notes: {
      list: () => request('/api/notes'),
      get: (id) => request(`/api/notes/${id}`),
      create: (payload) => request('/api/notes', { method: 'POST', body: JSON.stringify(payload) }),
      update: (id, payload) => request(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
      delete: (id) => request(`/api/notes/${id}`, { method: 'DELETE' })
    },
    browse: {
      fetch: (url) => request('/api/browse/fetch', { method: 'POST', body: JSON.stringify({ url }) }),
      search: (query) => request('/api/browse/search', { method: 'POST', body: JSON.stringify({ query }) }),
      download: (url) => request('/api/browse/download', { method: 'POST', body: JSON.stringify({ url }) })
    },
    chat: {
      // Chat uses SSE for streaming
      stream: (message, history, onEvent) => {
        return new Promise((resolve, reject) => {
          fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversationHistory: history })
          }).then(response => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            function process() {
              reader.read().then(({ done, value }) => {
                if (done) { resolve(); return; }
                buffer += decoder.decode(value);
                const lines = buffer.split('\n\n');
                buffer = lines.pop();

                for (const line of lines) {
                  if (line.startsWith('event: ')) {
                    const [eventLine, dataLine] = line.split('\n');
                    const event = eventLine.replace('event: ', '');
                    const data = JSON.parse(dataLine.replace('data: ', ''));
                    onEvent(event, data);
                    if (event === 'done') resolve();
                  }
                }
                process();
              });
            }
            process();
          }).catch(reject);
        });
      }
    },
    cron: {
      list: () => request('/api/cron'),
      create: (description) => request('/api/cron', { method: 'POST', body: JSON.stringify({ description }) }),
      delete: (id) => request(`/api/cron/${id}`, { method: 'DELETE' }),
      toggle: (id) => request(`/api/cron/${id}/toggle`, { method: 'PATCH' }),
      logs: (id) => request(`/api/cron/${id}/logs`)
    }
  };
})();

window.API = API;
