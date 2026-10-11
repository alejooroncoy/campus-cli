// Start the session request before loading the application and React bundles.
// Cached names are a display preview only; APIs always validate the real session.
(() => {
  if (!window.__campusSessionBootstrap) {
    const promise = fetch('/api/app/session', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
    }).then(async response => {
      if (!response.ok) throw new Error('No se pudo comprobar la sesión.');
      return response.json();
    });
    window.__campusSessionBootstrap = { promise };
    // The application consumes this same promise, including its rejection.
    void promise.catch(() => {});
  }

  const bootstrap = window.__campusSessionBootstrap;
  let preview = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem('campus_ui_profile') || 'null');
    if (cached?.authenticated && Date.now() - cached.savedAt < 15 * 60 * 1000) preview = cached;
  } catch { /* Storage is optional. */ }

  function paint() {
    if (!preview) return;
    if (!preview.authenticated) {
      const greeting = document.querySelector('[data-home-greeting]');
      if (greeting && greeting.textContent !== 'Bienvenido a Campus') greeting.textContent = 'Bienvenido a Campus';
      const note = document.querySelector('[data-home-note]');
      if (note) note.hidden = false;
      document.querySelectorAll('[data-app-sidebar-menu-name]').forEach(element => { if (element.textContent !== 'Tu cuenta Campus') element.textContent = 'Tu cuenta Campus'; });
      document.querySelectorAll('[data-app-sidebar-menu-sub]').forEach(element => { if (element.textContent !== 'Guarda tus consultas') element.textContent = 'Guarda tus consultas'; });
      document.querySelectorAll('[data-app-sidebar-user-name]').forEach(element => { if (element.textContent !== 'Invitado') element.textContent = 'Invitado'; });
      document.querySelectorAll('[data-app-sidebar-user-avatar], [data-app-sidebar-menu-avatar]').forEach(element => {
        if (element.classList.contains('has-initials')) {
          element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>';
          element.classList.remove('has-initials');
        }
      });
      return;
    }
    const text = (selector, value) => {
      if (typeof value !== 'string') return;
      document.querySelectorAll(selector).forEach(element => { if (element.textContent !== value) element.textContent = value; });
    };
    text('[data-app-sidebar-user-name], [data-app-sidebar-menu-name]', preview.shortName);
    text('[data-app-sidebar-user-sub], [data-app-sidebar-menu-sub]', preview.subTitle);
    document.querySelectorAll('[data-app-sidebar-user-avatar], [data-app-sidebar-menu-avatar]').forEach(element => {
      if (typeof preview.initials === 'string') {
        if (element.textContent !== preview.initials) element.textContent = preview.initials;
        element.classList.add('has-initials');
      }
    });
    const firstName = preview.cleanName?.split(/\s+/)[0];
    if (firstName) text('[data-home-greeting]', `Hola, ${firstName}.`);
    const note = document.querySelector('[data-home-note]');
    if (note) note.hidden = true;
  }

  // Replace a cached preview as soon as the real session responds, even if the
  // application bundle is still downloading. Never expose tokens in this script.
  void bootstrap.promise.then(session => {
    if (window.__campusSessionBootstrap !== bootstrap) return;
    if (!session.authenticated) {
      preview = { authenticated: false };
    } else {
      let name = (session.banner?.fullName || session.email?.split('@')[0] || '').trim();
      if (name.includes(',')) {
        const [last, first] = name.split(',').map(part => part.trim());
        name = `${first} ${last}`.trim();
      }
      if (name === name.toUpperCase()) name = name.toLocaleLowerCase('es').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('es'));
      const parts = name.split(/\s+/).filter(Boolean);
      preview = {
        authenticated: true,
        cleanName: name,
        shortName: parts.slice(0, 2).join(' '),
        initials: parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2),
        subTitle: session.university?.shortName || 'Cuenta Campus',
      };
      preview.initials = preview.initials.toLocaleUpperCase('es');
    }
    paint();
  }).catch(() => { /* A failed validation does not turn a preview into access. */ });

  paint();
  // An async head script can arrive before the sidebar has been parsed.
  if (document.readyState === 'loading') {
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'loading') { observer.disconnect(); paint(); }
    }, { once: true });
  }
})();
