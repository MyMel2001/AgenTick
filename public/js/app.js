// Main application controller for AgenTick Operating Environment
const App = (() => {
  let currentUser = null;
  let userPassword = null; 

  async function init() {
    setupAuthListeners();
    
    try {
      const data = await API.auth.me();
      if (data.user) {
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
        unlockEnvironment();
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
        unlockEnvironment();
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
      document.querySelector('.auth-tagline').textContent = "Session found. Please unlock.";
      document.querySelector('.auth-tabs').classList.add('hidden');
    }
  }

  async function unlockEnvironment() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('desktop').classList.remove('hidden');
    
    try {
      const { settings } = await API.settings.get();
      applySettings(settings);
    } catch (err) {
      console.error("Failed to load settings", err);
    }

    setupEnvironmentListeners();
    // Initialize the main chat interface
    TerminalApp.render(document.getElementById('desktop'));
  }

  function applySettings(settings) {
    if (settings.wallpaperUrl) {
      document.getElementById('wallpaper').style.backgroundImage = `url(${settings.wallpaperUrl})`;
      document.getElementById('wallpaper').style.opacity = '1';
    }
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }

  function setupEnvironmentListeners() {
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsModal = document.getElementById('settings-modal');
    const modalClose = document.querySelector('.modal-close');

    settingsToggle.onclick = () => {
      settingsModal.classList.remove('hidden');
      SettingsApp.render(document.getElementById('settings-body'));
    };

    modalClose.onclick = () => {
      settingsModal.classList.add('hidden');
    };

    window.onclick = (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
      }
    };
  }

  return { init, getUserPassword: () => userPassword, applySettings };
})();

document.addEventListener('DOMContentLoaded', App.init);
