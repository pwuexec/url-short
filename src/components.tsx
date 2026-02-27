import type { FC } from 'hono/jsx'
import { parseUserAgent } from './user-agent'
import type { Visit } from './links'

type User = { id: string; email: string; name: string; picture?: string; createdAt: string; isAdmin?: boolean }

const css = `
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --surface: #ffffff;
    --line: #1f2937;
    --text: #111827;
    --muted: #4b5563;
    --accent: #0b63f6;
    --danger: #b91c1c;
  }

  [data-theme="dark"] {
    color-scheme: dark;
    --bg: #0b0f14;
    --surface: #0b0f14;
    --line: #4b5563;
    --text: #e5e7eb;
    --muted: #9ca3af;
    --accent: #60a5fa;
    --danger: #f87171;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
    background: var(--bg);
    color: var(--text);
    line-height: 1.4;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .topbar, .subbar, .footer {
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }

  .subbar { border-top: 0; }
  .footer { border-top: 1px solid var(--line); border-bottom: 0; margin-top: auto; }

  .topbar-inner, .subbar-inner, .footer-inner, .page, .cookie-banner {
    width: min(67.5rem, 96vw);
    margin: 0 auto;
  }

  .topbar-inner {
    min-height: 3.375rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .subbar-inner {
    min-height: 2.625rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow-x: auto;
  }

  .brand {
    color: var(--text);
    font-size: 1.125rem;
    font-weight: 700;
  }
  .brand:hover { color: var(--text); text-decoration: none; }
  .brand-mark { color: var(--accent); }

  .nav-item, .subnav-item, .result-btn, .action-link, .dialog-close, .cookie-dismiss {
    border: 1px solid var(--line);
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.375rem 0.625rem;
    white-space: nowrap;
  }
  .nav-item, .subnav-item, .hero-form button, .action-link, .result-btn {
    transition: background-color 0.12s ease, color 0.12s ease;
  }
  .nav-item, .action-link { cursor: pointer; }
  .nav-item:hover,
  .subnav-item:hover,
  .subnav-item.active,
  .hero-form button:hover,
  .action-link:hover,
  .result-btn:hover {
    background: var(--text);
    color: var(--bg);
    text-decoration: none;
  }

  .copy-btn { min-width: 4.5rem; text-align: center; }
  .copy-btn[data-copied="1"] { color: var(--accent); border-color: var(--accent); }

  .user-menu {
    position: relative;
  }
  .user-menu summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border: 1px solid var(--line);
    background: var(--surface);
    overflow: hidden;
    transition: border-color 0.12s ease;
  }
  .user-menu summary::-webkit-details-marker { display: none; }
  .user-menu summary:hover { border-color: var(--accent); }
  .user-menu[open] summary { border-color: var(--accent); }
  .user-avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
  .user-initial {
    font-size: 0.8125rem;
    font-weight: 700;
    font-family: inherit;
    color: var(--text);
    line-height: 1;
  }
  .user-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 0.3125rem);
    min-width: 11.875rem;
    border: 1px solid var(--line);
    background: var(--surface);
    z-index: 200;
  }
  .dropdown-info {
    padding: 0.625rem;
    border-bottom: 1px solid var(--line);
  }
  .dropdown-name { font-size: 0.75rem; font-weight: 700; color: var(--text); }
  .dropdown-email { font-size: 0.6875rem; color: var(--muted); margin-top: 0.125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dropdown-logout {
    display: block;
    width: 100%;
    padding: 0.5rem 0.625rem;
    text-align: left;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
    transition: background 0.12s ease, color 0.12s ease;
  }
  .dropdown-logout:hover { background: var(--text); color: var(--bg); }

  .page { flex: 1; margin: 1rem auto; }

  .card {
    border: 1px solid var(--line);
    border-radius: 0;
    background: var(--surface);
    padding: 0.875rem;
  }
  .card + .card { margin-top: 0.625rem; }
  .action-card { padding: 0.875rem; }

  h1 {
    font-size: 1.375rem;
    font-weight: 700;
    margin-bottom: 0.625rem;
  }

  h2 {
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: var(--muted);
    font-size: 0.75rem;
    margin-bottom: 0.625rem;
  }

  .hero-form {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
  }

  .hero-form input {
    min-width: 0;
    min-height: 2.75rem;
    border: 1px solid var(--line);
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    font-family: inherit;
    font-size: 0.8125rem;
    padding: 0 0.625rem;
    outline: none;
  }
  .hero-form input.invalid { border-color: var(--danger); }

  .hero-form button {
    min-height: 2.75rem;
    border: 1px solid var(--line);
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 700;
    padding: 0 0.75rem;
    cursor: pointer;
  }

  .hero-error {
    margin-top: 0.5rem;
    color: var(--danger);
    font-size: 0.75rem;
    display: none;
  }
  .hero-error.visible { display: block; }

  .result-label {
    font-size: 0.6875rem;
    color: var(--muted);
    margin-bottom: 0.375rem;
  }
  .result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .result-url { font-size: 1.125rem; font-weight: 700; word-break: break-all; }

  .target-inline { display: inline-flex; align-items: center; gap: 0.375rem; }
  .favicon { width: 1rem; height: 1rem; }

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .stats-actions {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    padding-top: 0.375rem;
  }
  .stats-slug-label { font-size: 0.6875rem; color: var(--muted); margin-bottom: 0.25rem; }
  .stats-slug { font-size: 1.375rem; font-weight: 700; margin-bottom: 0; line-height: 1.2; }
  .stats-slug-origin { color: var(--muted); font-weight: 400; }
  .stats-target {
    margin-top: 0.625rem;
    font-size: 0.8125rem;
    word-break: break-all;
  }
  .favicon-lg { width: 1.25rem; height: 1.25rem; flex-shrink: 0; }
  .table-actions { display: flex; gap: 0.25rem; align-items: center; }

  .dashboard-table { min-width: 35rem; }

  .stat-cards {
    margin-top: 0.625rem;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .stat-card {
    border: 1px solid var(--line);
    border-radius: 0;
    padding: 0.5rem;
  }
  .stat-card .label { font-size: 0.6875rem; color: var(--muted); }
  .stat-card .value { margin-top: 0.25rem; font-size: 1.125rem; font-weight: 700; }

  .table-wrap {
    margin-top: 0.625rem;
    overflow-x: auto;
    border: 1px solid var(--line);
  }
  .visits-table {
    width: 100%;
    min-width: 60rem;
    border-collapse: collapse;
    font-family: inherit;
  }
  .visits-table th, .visits-table td {
    border-bottom: 1px solid var(--line);
    text-align: left;
    padding: 0.5rem;
    font-size: 0.75rem;
    vertical-align: top;
  }
  .visits-table th { font-size: 0.6875rem; color: var(--muted); }
  .visits-table tr:last-child td { border-bottom: 0; }

  .mono { font-family: inherit; font-size: 0.75rem; }
  .country-badge {
    display: inline-block;
    border: 1px solid var(--line);
    border-radius: 0;
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
  }

  .action-link.disabled { pointer-events: none; opacity: 0.5; text-decoration: none; }

  .bar-chart { margin-top: 0.25rem; }
  .bar-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }
  .bar-label { font-size: 0.6875rem; color: var(--muted); width: 5.5rem; flex-shrink: 0; text-align: right; }
  .bar-track { flex: 1; height: 0.625rem; background: var(--line); position: relative; overflow: hidden; }
  .bar-fill { position: absolute; left: 0; top: 0; height: 100%; background: var(--accent); }
  .bar-count { font-size: 0.6875rem; color: var(--muted); width: 2.5rem; text-align: right; flex-shrink: 0; }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    padding: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dialog {
    width: min(53.75rem, 100%);
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .dialog-header {
    border-bottom: 1px solid var(--line);
    padding: 0.625rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .dialog-title { font-size: 0.875rem; font-weight: 700; }
  .dialog-body { padding: 0.625rem; }

  .map-embed {
    width: 100%;
    height: 26.25rem;
    border: 1px solid var(--line);
  }

  .empty {
    color: var(--muted);
    font-size: 0.75rem;
    padding: 0.25rem 0;
  }

  .not-found {
    text-align: center;
    padding: 1.25rem 0.625rem;
  }
  .not-found h1 { font-size: 2.625rem; margin-bottom: 0.25rem; }
  .not-found p { color: var(--muted); margin-bottom: 0.5rem; }

  .footer-inner {
    min-height: 5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.6875rem;
    color: var(--muted);
    padding: 1rem 0;
  }

  .footer-left {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .footer-api-link {
    margin-left: auto;
    font-size: 0.625rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--line);
    padding: 0.2rem 0.45rem;
    border-radius: 3px;
  }
  .footer-api-link:hover { color: var(--accent); border-color: var(--accent); text-decoration: none; }

  .cookie-banner {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0.625rem;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 0.6875rem;
  }
  .cookie-banner-inner {
    padding: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  @media (max-width: 50rem) {
    .stat-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .visits-table:not(.dashboard-table) th:nth-child(5),
    .visits-table:not(.dashboard-table) td:nth-child(5),
    .visits-table:not(.dashboard-table) th:nth-child(6),
    .visits-table:not(.dashboard-table) td:nth-child(6) { display: none; }
  }

  @media (max-width: 35rem) {
    .hero-form { grid-template-columns: 1fr; }
    .hero-form button { width: 100%; }
    .stat-cards { grid-template-columns: 1fr; }
    .cookie-banner { width: 96vw; }
    .visits-table, .dashboard-table { min-width: 0; }
    .dashboard-table th:nth-child(3), .dashboard-table td:nth-child(3),
    .dashboard-table th:nth-child(4), .dashboard-table td:nth-child(4) { display: none; }
    .visits-table:not(.dashboard-table) th:nth-child(2),
    .visits-table:not(.dashboard-table) td:nth-child(2),
    .visits-table:not(.dashboard-table) th:nth-child(4),
    .visits-table:not(.dashboard-table) td:nth-child(4) { display: none; }
  }
`

const themeBootstrapScript = `
  (function () {
    var theme = 'light';
    try {
      var saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') {
        theme = saved;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
      }
    } catch (_) {}
    document.documentElement.setAttribute('data-theme', theme);
  })();
`

const themeToggleScript = `
  (function () {
    var button = document.getElementById('theme-toggle');
    if (!button) return;

    var label = document.getElementById('theme-toggle-label');

    function applyButtonState(theme) {
      var isDark = theme === 'dark';
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
    }

    var currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyButtonState(currentTheme);

    var autofocused = document.querySelector('input[autofocus]');
    if (autofocused && autofocused.value) {
      var len = autofocused.value.length;
      autofocused.setSelectionRange(len, len);
    }

    button.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      applyButtonState(next);
      try {
        localStorage.setItem('theme', next);
      } catch (_) {}
    });
  })();
`

const heroFormTrimScript = `
  (function () {
    var form = document.querySelector('.hero-form');
    if (!form) return;
    form.addEventListener('submit', function () {
      var input = form.querySelector('input[name="url"], input[name="q"]');
      if (input) input.value = input.value.trim();
    });
  })();
`

const copyScript = `
  (function () {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-copy]');
      if (!btn) return;
      var text = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(text).then(function () {
        var orig = btn.textContent;
        btn.setAttribute('data-copied', '1');
        btn.textContent = 'Copied!';
        setTimeout(function () {
          btn.removeAttribute('data-copied');
          btn.textContent = orig;
        }, 1500);
      });
    });
  })();
`

const cookieBannerScript = `
  (function () {
    var banner = document.getElementById('cookie-banner');
    if (!banner) return;
    try {
      if (localStorage.getItem('cookie-ok') === '1') {
        banner.style.display = 'none';
        return;
      }
    } catch (_) {}
    var btn = document.getElementById('cookie-dismiss');
    if (btn) {
      btn.addEventListener('click', function () {
        banner.style.display = 'none';
        try { localStorage.setItem('cookie-ok', '1'); } catch (_) {}
      });
    }
  })();
`


function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, '')
}

function formatUtcAndLocal(timestamp: string): { utc: string; local: string } {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return { utc: '-', local: '-' }
  }

  const utc = date.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })
  const local = date.toLocaleString('en-US', { timeZoneName: 'short' })
  return { utc, local }
}

function buildMapLink(latitude?: number, longitude?: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const lat = Number(latitude).toFixed(6)
  const lon = Number(longitude).toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`
}

function buildMapEmbedLink(latitude?: number, longitude?: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const lat = Number(latitude)
  const lon = Number(longitude)
  const delta = 0.04
  const left = lon - delta
  const right = lon + delta
  const top = lat + delta
  const bottom = lat - delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lon}`
}

function buildGoogleMapsLink(latitude?: number, longitude?: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const lat = Number(latitude)
  const lon = Number(longitude)
  return `https://www.google.com/maps?q=${lat},${lon}`
}

function getLocationName(visit: Visit): string {
  return [visit.city, visit.region, visit.country].filter(Boolean).join(', ') || 'Unknown'
}

type NavLinkKey = 'shorten' | 'analytics' | 'dashboard' | 'site-analytics'

function getActiveNavLink(pathname: string): NavLinkKey {
  const normalizedPath = pathname.split('?')[0]
  if (normalizedPath === '/dashboard') return 'dashboard'
  if (normalizedPath === '/analytics') return 'site-analytics'
  if (normalizedPath === '/search' || normalizedPath.endsWith('/stats')) return 'analytics'
  return 'shorten'
}

export const Layout: FC<{ children: any; title?: string; description?: string; noindex?: boolean; pathname?: string; user?: User | null }> = ({ children, title, description, noindex, pathname = '/', user }) => {
  const pageTitle = title ? `${title} - url short` : 'url short'
  const activeNavLink = getActiveNavLink(pathname)
  return (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{pageTitle}</title>
      {description && <meta name="description" content={description} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:site_name" content="url short" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={pageTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={pageTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <header>
        <div class="topbar">
          <div class="topbar-inner">
            <a class="brand" href="/">
              url<span class="brand-mark">/</span>short
            </a>
            <div class="topbar-actions">
              <button id="theme-toggle" class="nav-item" type="button" aria-pressed="false" aria-label="Toggle theme">
                <span id="theme-toggle-label">Dark mode</span>
              </button>
              {user ? (
                <details class="user-menu">
                  <summary>
                    {user.picture
                      ? <img class="user-avatar" src={user.picture} alt={user.name} />
                      : <span class="user-initial">{user.name.charAt(0).toUpperCase()}</span>
                    }
                  </summary>
                  <div class="user-dropdown">
                    <div class="dropdown-info">
                      <div class="dropdown-name">{user.name}</div>
                      <div class="dropdown-email">{user.email}</div>
                    </div>
                    <form method="post" action="/auth/logout">
                      <button class="dropdown-logout" type="submit">logout</button>
                    </form>
                  </div>
                </details>
              ) : (
                <a class="nav-item" href="/auth/google">login with google</a>
              )}
            </div>
          </div>
        </div>
        <div class="subbar">
          <div class="subbar-inner">
            <a class={`subnav-item${activeNavLink === 'shorten' ? ' active' : ''}`} href="/">Shorten a link</a>
            <a class={`subnav-item${activeNavLink === 'analytics' ? ' active' : ''}`} href="/search">Find analytics</a>
            {user && (
              <a class={`subnav-item${activeNavLink === 'dashboard' ? ' active' : ''}`} href="/dashboard">My links</a>
            )}
            {user?.isAdmin && (
              <a class={`subnav-item${activeNavLink === 'site-analytics' ? ' active' : ''}`} href="/analytics">Analytics</a>
            )}
          </div>
        </div>
      </header>
      <main class="page">{children}</main>
      <footer class="footer">
        <div class="footer-inner">
          <div class="footer-left">
            <span>src: <a href="https://github.com/pwuexec/url-short" target="_blank" rel="noopener noreferrer">github.com/pwuexec/url-short</a></span>
            <span>logs: ip + ua + geo</span>
          </div>
          <a class="footer-api-link" target="_blank" href="/api/docs">API</a>
        </div>
      </footer>
      <div id="cookie-banner" class="cookie-banner" role="alert">
        <div class="cookie-banner-inner">
          <span>notice: requests are logged for stats</span>
          <button id="cookie-dismiss" class="cookie-dismiss" type="button">ok</button>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: themeToggleScript }} />
      <script dangerouslySetInnerHTML={{ __html: cookieBannerScript }} />
      <script dangerouslySetInnerHTML={{ __html: heroFormTrimScript }} />
      <script dangerouslySetInnerHTML={{ __html: copyScript }} />

    </body>
  </html>
  )
}

type CreatedUrlData = { target: string; favicon: string; createdAt: string }

export const HomePage: FC<{ created?: string; origin: string; createdUrlData?: CreatedUrlData; error?: string; inputValue?: string; user?: User | null }> = ({ created, origin, createdUrlData, error, inputValue, user }) => (
  <Layout description="Shorten any URL instantly. Free and open — no account required." pathname="/" user={user}>
    <section class="card action-card">
      <h1>raw url shortener</h1>
      <form class="hero-form" method="post" action="/">
        <input type="text" name="url" placeholder="url: example.com/a/very/long/path" required autofocus value={inputValue} class={error ? 'invalid' : undefined} />
        <button type="submit">go</button>
      </form>
      {error === 'empty' && <p class="hero-error visible">Please enter a URL.</p>}
      {error === 'invalid' && <p class="hero-error visible">Please enter a valid URL.</p>}
      {error === 'ratelimit' && <p class="hero-error visible">Too many requests. Please slow down.</p>}
      {!user && (
        <p class="subtitle" style="margin-top: 0.5rem; margin-bottom: 0">
          <a href="/auth/google">sign in</a> to keep track of your links
        </p>
      )}
    </section>
    {created && (
      <section class="card result-card">
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{navigator.clipboard.writeText(${JSON.stringify(`${origin}/${created}`)})}catch(_){}})()` }} />
        <div class="result-label">created &amp; copied to clipboard</div>
        <div class="table-wrap" style="margin-top: 8px">
          <table class="visits-table dashboard-table">
            <thead>
              <tr>
                <th></th>
                <th>Short URL</th>
                <th>Target</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="width: 28px; padding-right: 0">
                  {createdUrlData?.favicon && <img class="favicon-lg" src={createdUrlData.favicon} alt="" loading="lazy" />}
                </td>
                <td style="white-space: nowrap; font-weight: 700">
                  <span class="stats-slug-origin">{stripProtocol(origin)}/</span><a href={`/${created}`} target="_blank" rel="noopener noreferrer">{created}</a>
                </td>
                <td style="max-width: 320px">
                  <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px">
                    {createdUrlData?.target && <a href={createdUrlData.target} target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{stripProtocol(createdUrlData.target)}</a>}
                  </div>
                </td>
                <td style="white-space: nowrap; color: var(--muted)">{createdUrlData?.createdAt ? formatUtcAndLocal(createdUrlData.createdAt).utc : '-'}</td>
                <td>
                  <div class="table-actions">
                    <button class="action-link copy-btn" type="button" data-copy={`${origin}/${created}`}>copy</button>
                    <a class="action-link" href={`/${created}/stats`}>stats</a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    )}
  </Layout>
)


export const StatsPage: FC<{
  slug: string
  target: string
  favicon?: string
  visits: Visit[]
  selectedMapIndex?: number
  selectedUaIndex?: number
  origin: string
  user?: User | null
}> = ({
  slug,
  target,
  favicon,
  visits,
  selectedMapIndex,
  selectedUaIndex,
  origin,
  user,
}) => {
  const countries = new Set(visits.map((v) => v.country).filter(Boolean)).size
  const uniqueIps = new Set(visits.map((v) => v.ip)).size
  const displayVisits = [...visits].reverse()
  const selectedMapVisit = selectedMapIndex !== undefined ? displayVisits[selectedMapIndex] : undefined
  const selectedUaVisit = selectedUaIndex !== undefined ? displayVisits[selectedUaIndex] : undefined
  const selectedMapEmbed = selectedMapVisit ? buildMapEmbedLink(selectedMapVisit.latitude, selectedMapVisit.longitude) : null
  const selectedMapOpen = selectedMapVisit ? buildMapLink(selectedMapVisit.latitude, selectedMapVisit.longitude) : null
  const selectedGoogleMap = selectedMapVisit ? buildGoogleMapsLink(selectedMapVisit.latitude, selectedMapVisit.longitude) : null
  const selectedUaParsed = selectedUaVisit ? parseUserAgent(selectedUaVisit.userAgent) : null
  const showMapDialog = Boolean(selectedMapVisit)
  const showUaDialog = !showMapDialog && Boolean(selectedUaVisit && selectedUaParsed)

  return (
    <Layout title={slug} description={`${visits.length} visit${visits.length !== 1 ? 's' : ''} — redirects to ${stripProtocol(target)}`} noindex pathname={`/${slug}/stats`} user={user}>
      <section class="card">
        <div class="stats-header">
          <div>
            <div class="stats-slug-label">short url</div>
            <h1 class="stats-slug">
              <span class="stats-slug-origin">{stripProtocol(origin)}/</span><a href={`/${slug}`} target="_blank" rel="noopener noreferrer">{slug}</a>
            </h1>
          </div>
          <div class="stats-actions">
            <a href={`/${slug}/stats?view=json`} target="_blank" rel="noopener noreferrer">json</a>
            <a href="/">home</a>
          </div>
        </div>
        <div class="stats-target">
          <span class="target-inline">
            {favicon && <img class="favicon-lg" src={favicon} alt="" loading="lazy" />}
            <a href={target} target="_blank" rel="noopener noreferrer">{stripProtocol(target)}</a>
          </span>
        </div>

        <div class="stat-cards">
          <div class="stat-card">
            <div class="label">Total visits</div>
            <div class="value">{visits.length}</div>
          </div>
          <div class="stat-card">
            <div class="label">Unique IPs</div>
            <div class="value">{uniqueIps}</div>
          </div>
          <div class="stat-card">
            <div class="label">Countries</div>
            <div class="value">{countries}</div>
          </div>
          <div class="stat-card">
            <div class="label">Last visit</div>
            <div class="value" style="font-size: 14px">
              {displayVisits.length > 0 ? (
                <>
                  <div>{formatUtcAndLocal(displayVisits[0].timestamp).utc}</div>
                  <div style="font-size: 12px; color: var(--muted)">
                    {formatUtcAndLocal(displayVisits[0].timestamp).local}
                  </div>
                </>
              ) : (
                '-'
              )}
            </div>
          </div>
        </div>
      </section>

      {visits.length > 0 ? (
        <section class="card">
          <h2>visits</h2>
          <div class="table-wrap">
            <table class="visits-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>IP</th>
                  <th>Location</th>
                  <th>Browser</th>
                  <th>OS</th>
                  <th>Device</th>
                  <th>Map</th>
                </tr>
              </thead>
              <tbody>
                {displayVisits.map((v, idx) => {
                  const parsed = parseUserAgent(v.userAgent)
                  const mapLink = buildMapLink(v.latitude, v.longitude)
                  const time = formatUtcAndLocal(v.timestamp)

                  return (
                    <tr>
                      <td class="mono">
                        <div>{time.utc}</div>
                        <div style="font-size: 12px; color: var(--muted)">{time.local}</div>
                      </td>
                      <td class="mono">{v.ip}</td>
                      <td>
                        {v.country && <span class="country-badge">{v.country}</span>}
                      </td>
                      <td>{parsed.browser}</td>
                      <td>{parsed.os}</td>
                      <td>{parsed.device}</td>
                      <td>
                        <div class="table-actions">
                          {mapLink ? (
                            <a class="action-link" href={`/${slug}/stats?map=${idx}`}>map</a>
                          ) : (
                            <span class="action-link disabled">n/a</span>
                          )}
                          <a class="action-link" href={`/${slug}/stats?ua=${idx}`}>ua</a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section class="card">
          <p class="empty">No visits yet</p>
        </section>
      )}
      {showMapDialog && selectedMapVisit && (
        <div class="dialog-backdrop">
          <div class="dialog" role="dialog" aria-modal="true" aria-label="Visit map dialog">
            <div class="dialog-header">
              <div class="dialog-title">location</div>
              <a class="dialog-close" href={`/${slug}/stats`}>Close</a>
            </div>
            <div class="dialog-body">
              {selectedMapEmbed ? (
                <>
                  <iframe class="map-embed" src={selectedMapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  <p style="margin-top: 10px"><strong>Location:</strong> {getLocationName(selectedMapVisit)}</p>
                  <p><strong>Latitude:</strong> {String(selectedMapVisit.latitude ?? '-')}</p>
                  <p><strong>Longitude:</strong> {String(selectedMapVisit.longitude ?? '-')}</p>
                  {selectedMapOpen && (
                    <p style="margin-top: 8px; font-size: 13px">
                      <a href={selectedMapOpen} target="_blank" rel="noopener noreferrer">openstreetmap</a>
                    </p>
                  )}
                  {selectedGoogleMap && (
                    <p style="margin-top: 4px; font-size: 13px">
                      <a href={selectedGoogleMap} target="_blank" rel="noopener noreferrer">google maps</a>
                    </p>
                  )}
                </>
              ) : (
                <p class="subtitle" style="margin-bottom: 0">no coordinates</p>
              )}
            </div>
          </div>
        </div>
      )}
      {showUaDialog && selectedUaVisit && selectedUaParsed && (
        <div class="dialog-backdrop">
          <div class="dialog" role="dialog" aria-modal="true" aria-label="User agent dialog">
            <div class="dialog-header">
              <div class="dialog-title">user-agent</div>
              <a class="dialog-close" href={`/${slug}/stats`}>Close</a>
            </div>
            <div class="dialog-body">
              {selectedUaParsed.browser && <p><strong>Browser:</strong> {selectedUaParsed.browser}</p>}
              {selectedUaParsed.browserVersion && <p><strong>Browser version:</strong> {selectedUaParsed.browserVersion}</p>}
              {selectedUaParsed.os && <p><strong>OS:</strong> {selectedUaParsed.os}</p>}
              {selectedUaParsed.osVersion && <p><strong>OS version:</strong> {selectedUaParsed.osVersion}</p>}
              {selectedUaParsed.device && <p><strong>Device:</strong> {selectedUaParsed.device}</p>}
              {selectedUaParsed.engine && <p><strong>Engine:</strong> {selectedUaParsed.engine}</p>}
              {selectedUaParsed.engineVersion && <p><strong>Engine version:</strong> {selectedUaParsed.engineVersion}</p>}
              {selectedUaParsed.platformVendor && <p><strong>Platform vendor:</strong> {selectedUaParsed.platformVendor}</p>}
              {selectedUaParsed.platformModel && <p><strong>Platform model:</strong> {selectedUaParsed.platformModel}</p>}
              {selectedUaParsed.platformType && <p><strong>Platform type:</strong> {selectedUaParsed.platformType}</p>}
              <p style="margin-top: 10px; font-size: 12px; color: var(--muted)">Raw UA</p>
              <pre class="mono" style="white-space: pre-wrap; word-break: break-word; margin-top: 4px">{selectedUaVisit.userAgent}</pre>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export const SearchPage: FC<{ error?: string; query?: string; user?: User | null }> = ({ error, query, user }) => (
  <Layout title="Find" pathname="/search" user={user}>
    <section class="card action-card">
      <h1>find stats</h1>
      <p class="subtitle">slug or short url</p>
      <form class="hero-form" method="get" action="/search">
        <input
          type="text"
          name="q"
          placeholder="abc123 or https://domain/abc123"
          required
          autofocus
          value={query}
          class={error ? 'invalid' : undefined}
        />
        <button type="submit">go</button>
      </form>
      {error === 'empty' && <p class="hero-error visible">Please enter a slug or URL.</p>}
      {error === 'notfound' && <p class="hero-error visible">No short URL found for that slug.</p>}
    </section>
  </Layout>
)

export const NotFound: FC<{ code?: number; message?: string }> = ({ code = 404, message = 'short url not found' }) => (
  <Layout title={`${code} Not Found`} noindex>
    <section class="card">
      <div class="not-found">
        <h1>{code}</h1>
        <p>{message}</p>
        <a href="/">home</a>
      </div>
    </section>
  </Layout>
)

type AERow = Record<string, string>

export const AnalyticsPage: FC<{
  user: User
  created30d: number
  visits30d: number
  topSlugs: AERow[]
  topCountries: AERow[]
  dailyVisits: AERow[]
  origin: string
}> = ({ user, created30d, visits30d, topSlugs, topCountries, dailyVisits, origin }) => {
  const maxVisits = Math.max(...dailyVisits.map(r => Number(r.visits)), 1)
  const empty = topSlugs.length === 0 && topCountries.length === 0 && dailyVisits.length === 0

  return (
    <Layout title="Analytics" pathname="/analytics" user={user}>
      <section class="card">
        <h1 style="margin-bottom: 0.25rem">site analytics</h1>
        <p class="subtitle" style="margin-bottom: 0.5rem">last 30 days</p>
        <div class="stat-cards">
          <div class="stat-card">
            <div class="label">URLs created</div>
            <div class="value">{created30d}</div>
          </div>
          <div class="stat-card">
            <div class="label">Total visits</div>
            <div class="value">{visits30d}</div>
          </div>
        </div>
      </section>

      {dailyVisits.length > 0 && (
        <section class="card">
          <h2>visits — last 14 days</h2>
          <div class="bar-chart">
            {dailyVisits.map(r => {
              const pct = Math.max((Number(r.visits) / maxVisits) * 100, 1)
              return (
                <div class="bar-row">
                  <span class="bar-label">{r.day}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style={`width: ${pct}%`} />
                  </div>
                  <span class="bar-count">{r.visits}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {topSlugs.length > 0 && (
        <section class="card">
          <h2>top links — last 30 days</h2>
          <div class="table-wrap" style="margin-top: 0.5rem">
            <table class="visits-table">
              <thead><tr><th>Slug</th><th>Visits</th></tr></thead>
              <tbody>
                {topSlugs.map(r => (
                  <tr>
                    <td><a href={`/${r.slug}/stats`}>{stripProtocol(origin)}/{r.slug}</a></td>
                    <td class="mono">{r.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {topCountries.length > 0 && (
        <section class="card">
          <h2>visitors by country — last 30 days</h2>
          <div class="table-wrap" style="margin-top: 0.5rem">
            <table class="visits-table">
              <thead><tr><th>Country</th><th>Visits</th></tr></thead>
              <tbody>
                {topCountries.map(r => (
                  <tr>
                    <td><span class="country-badge">{r.country || '—'}</span></td>
                    <td class="mono">{r.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {empty && (
        <section class="card">
          <p class="empty">No analytics data yet — data appears once traffic is recorded.</p>
        </section>
      )}
    </Layout>
  )
}

type DashboardLink = { slug: string; target: string; favicon: string; createdAt: string }

export const DashboardPage: FC<{ user: User; links: DashboardLink[]; origin: string }> = ({ user, links, origin }) => (
  <Layout title="My links" pathname="/dashboard" user={user}>
    <section class="card">
      <div class="stats-header">
        <div>
          <h1 style="margin-bottom: 0">my links</h1>
          <p class="subtitle" style="margin-top: 0.25rem; margin-bottom: 0">newly created links can take up to 2 minutes to appear</p>
        </div>
        <div class="stats-actions">
          <a class="nav-item" href="/">+ new link</a>
        </div>
      </div>
      {links.length === 0 ? (
        <p class="empty" style="margin-top: 10px">No links yet. <a href="/">Shorten one now.</a></p>
      ) : (
        <div class="table-wrap" style="margin-top: 10px">
          <table class="visits-table dashboard-table">
            <thead>
              <tr>
                <th></th>
                <th>Short URL</th>
                <th>Target</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr>
                  <td style="width: 28px; padding-right: 0">
                    <img class="favicon-lg" src={link.favicon} alt="" loading="lazy" />
                  </td>
                  <td style="white-space: nowrap; font-weight: 700">
                    <span class="stats-slug-origin">{stripProtocol(origin)}/</span><a href={`/${link.slug}`} target="_blank" rel="noopener noreferrer">{link.slug}</a>
                  </td>
                  <td style="max-width: 320px">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px">
                      <a href={link.target} target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{stripProtocol(link.target)}</a>
                    </div>
                  </td>
                  <td style="white-space: nowrap; color: var(--muted)">{formatUtcAndLocal(link.createdAt).utc}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-link copy-btn" type="button" data-copy={`${origin}/${link.slug}`}>copy</button>
                      <a class="action-link" href={`/${link.slug}/stats`}>stats</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </Layout>
)
