// Main application controller for AgenTick OS
const App = (() => {
  let currentUser = null;
  let userPassword = null; // Stored in memory only for E2E
  let activeWindows = new Map();
  let zIndexCounter = 1000;

  async function init() {
    setupAuthListeners();
    setupClock();
    
    try {
      const data = await API.auth.me();
      if (data.user) {
        // We have a session, but need password to unlock
        showAuthScreen('login', true);
      } else {
        showAuthScreen('login');
      }
    } catch (err) {
      showAuthScreen('login');
    }
  }

  function setupAuthListeners() {
    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.tab === 'login';
        document.getElementById('login-form').classList.toggle('active', isLogin);
        document.getElementById('register-form').classList.toggle('active', !isLogin);
      });
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const pass = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      
      try {
        const data = await API.auth.login(username, pass);
        userPassword = pass;
        currentUser = data.user;
        unlockOS();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value;
      const pass = document.getElementById('reg-password').value;
      const pass2 = document.getElementById('reg-password2').value;
      const errEl = document.getElementById('register-error');

      if (pass !== pass2) {
        errEl.textContent = "Passwords don't match";
        return;
      }

      try {
        const data = await API.auth.register(username, pass);
        userPassword = pass;
        currentUser = data.user;
        unlockOS();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await API.auth.logout();
      window.location.reload();
    });

    window.addEventListener('unauthorized', () => {
      window.location.reload();
    });
  }

  function showAuthScreen(tab, persistentSession = false) {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('desktop').classList.add('hidden');
    if (persistentSession) {
      document.querySelector('.auth-tagline').textContent = "Session found. Please unlock with your password.";
      document.querySelector('.auth-tabs').classList.add('hidden');
    }
  }

  async function unlockOS() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('desktop').classList.remove('hidden');
    document.getElementById('start-username').textContent = currentUser.username;
    
    // Load settings
    try {
      const { settings } = await API.settings.get();
      applySettings(settings);
    } catch (err) {
      console.error("Failed to load settings", err);
    }

    setupDesktopListeners();
  }

  function applySettings(settings) {
    if (settings.wallpaperUrl) {
      document.getElementById('wallpaper').style.backgroundImage = `url(${settings.wallpaperUrl})`;
      document.getElementById('wallpaper').style.opacity = '1';
    }
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }

  function setupDesktopListeners() {
    // Desktop icons
    document.querySelectorAll('.desktop-icon').forEach(icon => {
      icon.addEventListener('dblclick', () => {
        openApp(icon.dataset.app);
      });
      // Single click for mobile/touch
      icon.addEventListener('click', () => {
        if (window.innerWidth < 768) openApp(icon.dataset.app);
      });
    });

    // Start button
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      startMenu.classList.add('hidden');
    });

    startMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.dataset.app) {
        openApp(e.target.dataset.app);
        startMenu.classList.add('hidden');
      }
    });

    // Taskbar clock
    setupClock();
  }

  function setupClock() {
    const clock = document.getElementById('clock');
    const update = () => {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    update();
    setInterval(update, 1000);
  }

  function openApp(appId) {
    if (activeWindows.has(appId)) {
      focusWindow(appId);
      return;
    }

    const template = document.getElementById('window-template');
    const winClone = template.content.cloneNode(true);
    const win = winClone.querySelector('.window');
    const body = win.querySelector('.window-body');
    const titleText = win.querySelector('.window-title-text');
    const icon = win.querySelector('.window-icon');

    win.dataset.app = appId;
    win.id = `window-${appId}`;

    const config = getAppConfig(appId);
    titleText.textContent = config.title;
    icon.textContent = config.icon;
    win.style.width = config.width + 'px';
    win.style.height = config.height + 'px';
    win.style.left = (window.innerWidth / 2 - config.width / 2) + (activeWindows.size * 20) + 'px';
    win.style.top = (window.innerHeight / 2 - config.height / 2) + (activeWindows.size * 20) + 'px';

    setupWindowEvents(win, appId);
    document.getElementById('windows-container').appendChild(win);
    activeWindows.set(appId, win);
    
    // Initialize app content
    initializeAppContent(appId, body);
    
    // Add to taskbar
    addTaskbarItem(appId, config.icon);
    
    focusWindow(appId);
  }

  function getAppConfig(appId) {
    const configs = {
      terminal: { title: 'AI Terminal', icon: '🤖', width: 800, height: 600 },
      browser: { title: 'Virtual Browser', icon: '🌐', width: 1000, height: 700 },
      files: { title: 'File Manager', icon: '📁', width: 700, height: 500 },
      notes: { title: 'Notes', icon: '📝', width: 600, height: 500 },
      cron: { title: 'Scheduler', icon: '⏰', width: 500, height: 400 },
      settings: { title: 'Settings', icon: '⚙️', width: 450, height: 400 }
    };
    return configs[appId] || { title: appId, icon: '📦', width: 400, height: 300 };
  }

  function setupWindowEvents(win, appId) {
    const titlebar = win.querySelector('.window-titlebar');
    const closeBtn = win.querySelector('.win-close');
    const minBtn = win.querySelector('.win-minimize');
    const maxBtn = win.querySelector('.win-maximize');

    let isDragging = false;
    let startX, startY, initialX, initialY;

    titlebar.addEventListener('mousedown', (e) => {
      focusWindow(appId);
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = win.offsetLeft;
      initialY = win.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      win.style.left = initialX + dx + 'px';
      win.style.top = initialY + dy + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    closeBtn.addEventListener('click', () => closeWindow(appId));
    minBtn.addEventListener('click', () => win.classList.add('hidden'));
    maxBtn.addEventListener('click', () => win.classList.toggle('maximized'));
    win.addEventListener('mousedown', () => focusWindow(appId));
  }

  function focusWindow(appId) {
    const win = activeWindows.get(appId);
    if (!win) return;
    win.classList.remove('hidden');
    zIndexCounter++;
    win.style.zIndex = zIndexCounter;
    
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active'));
    win.classList.add('active');
    
    document.querySelectorAll('.taskbar-item').forEach(i => i.classList.remove('active'));
    const item = document.querySelector(`.taskbar-item[data-app="${appId}"]`);
    if (item) item.classList.add('active');
  }

  function closeWindow(appId) {
    const win = activeWindows.get(appId);
    if (win) {
      win.remove();
      activeWindows.delete(appId);
      removeTaskbarItem(appId);
    }
  }

  function addTaskbarItem(appId, icon) {
    const tray = document.getElementById('taskbar-apps');
    const item = document.createElement('div');
    item.className = 'taskbar-item';
    item.dataset.app = appId;
    item.textContent = icon;
    item.addEventListener('click', () => focusWindow(appId));
    tray.appendChild(item);
  }

  function removeTaskbarItem(appId) {
    const item = document.querySelector(`.taskbar-item[data-app="${appId}"]`);
    if (item) item.remove();
  }

  function initializeAppContent(appId, container) {
    switch (appId) {
      case 'terminal': TerminalApp.render(container); break;
      case 'browser': BrowserApp.render(container); break;
      case 'files': FileManagerApp.render(container); break;
      case 'notes': NotesApp.render(container); break;
      case 'cron': CronApp.render(container); break;
      case 'settings': SettingsApp.render(container); break;
    }
  }

  return { init, getUserPassword: () => userPassword, openApp, focusWindow, applySettings };
})();

document.addEventListener('DOMContentLoaded', App.init);
