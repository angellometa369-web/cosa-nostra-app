/* ===== COSA NOSTRA — App con datos reales de BetaDomino ===== */

const ROLE_LABELS = { don: 'Don', capo: 'Capo', consigliere: 'Consigliere', soldado: 'Soldado', aspirante: 'Aspirante' };

let currentUser = null;
let currentTournamentId = null;
let revealObserver = null;

/* ===== MOTION ENGINE — bidirectional domino + pointer glow ===== */
function setupMotionSystem() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('is-visible'));
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target;
        if (entry.isIntersecting) {
          el.classList.add('is-animating', 'is-visible');
          const done = () => {
            el.classList.remove('is-animating');
            el.removeEventListener('animationend', done);
          };
          el.addEventListener('animationend', done, { once: true });
        } else {
          el.classList.remove('is-visible', 'is-animating');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  }

  document.querySelectorAll('.reveal-on-scroll').forEach(el => revealObserver.observe(el));
}

function addPointerGlow(elements) {
  elements.forEach((element) => {
    if (element.dataset.pointerReady) return;
    element.dataset.pointerReady = 'true';
    element.addEventListener('pointermove', (event) => {
      const bounds = element.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 100;
      const y = ((event.clientY - bounds.top) / bounds.height) * 100;
      element.style.setProperty('--pointer-x', `${x}%`);
      element.style.setProperty('--pointer-y', `${y}%`);
    });
  });
}

function tagPageForDomino(root) {
  if (!root) return;
  // section headers
  root.querySelectorAll('.section-label, .section-title, .section-subtitle').forEach((el, i) => {
    el.classList.add('reveal-on-scroll', 'domino-block');
    el.style.animationDelay = `${Math.min(i * 60, 300)}ms`;
  });
  // home / static cards
  root.querySelectorAll('.cards-grid > .card').forEach((el, i) => {
    el.classList.add('reveal-on-scroll', 'domino-card');
    el.style.animationDelay = `${Math.min(i * 100, 500)}ms`;
  });
  // rules table rows
  root.querySelectorAll('#rulesTable tbody tr').forEach((el, i) => {
    el.classList.add('reveal-on-scroll', 'domino-row');
    el.style.animationDelay = `${Math.min(i * 40, 600)}ms`;
  });
  // hero
  root.querySelectorAll('.hero-content').forEach(el => {
    el.classList.add('reveal-on-scroll', 'domino-block');
  });
}

function refreshMotionTargets() {
  const active = document.querySelector('.page.active') || document;
  tagPageForDomino(active);
  setupMotionSystem();
  addPointerGlow([...document.querySelectorAll('#rankingBody tr, #torneosGrid .card, .cards-grid .card')]);
}


/* ===== DOMINO FIELD — ambient tiles + scroll cascade (bidirectional) ===== */
let lastScrollY = 0;
let scrollDir = 1; // 1 down, -1 up
let cascadeWave = 0;

function spawnDominoField() {
  const field = document.getElementById('dominoField');
  if (!field) return;
  field.innerHTML = '';
  const count = window.innerWidth < 640 ? 8 : 12;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const tile = document.createElement('div');
    tile.className = 'domino-tile';
    tile.style.left = (4 + (i * 8) % 90) + '%';
    tile.style.top = (6 + ((i * 13) % 82)) + '%';
    tile.dataset.baseRot = String(-20 + (i * 9) % 40);
    tile.dataset.depth = String(0.4 + (i % 3) * 0.2);
    tile.dataset.index = String(i);
    frag.appendChild(tile);
  }
  field.appendChild(frag);
  updateDominoParallax();
}

function updateDominoParallax() {
  const field = document.getElementById('dominoField');
  if (!field) return;
  const y = window.scrollY || 0;
  const dy = y - lastScrollY;
  if (Math.abs(dy) > 2) {
    scrollDir = dy > 0 ? 1 : -1;
    cascadeWave += dy * 0.06;
  }
  lastScrollY = y;

  document.documentElement.style.setProperty('--bg-shift', `${-(y * 0.08)}px`);
  document.documentElement.dataset.scrollDir = String(scrollDir);

  const tiles = field.children;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const depth = +tile.dataset.depth || 0.5;
    const idx = +tile.dataset.index || 0;
    const baseRot = +tile.dataset.baseRot || 0;
    const tip = Math.sin(cascadeWave * 0.035 + idx * 0.5) * 18 * depth * scrollDir;
    const shiftY = (y * depth * 0.03 * scrollDir) + Math.sin(y * 0.01 + idx) * 10 * depth;
    tile.style.transform = `translate3d(0,${shiftY.toFixed(1)}px,0) rotate(${(baseRot + tip).toFixed(1)}deg)`;
  }
}



function updateNavbarOnScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  const progress = Math.min(window.scrollY / 180, 1);
  navbar.style.setProperty('--scroll-progress', progress.toFixed(3));
  navbar.classList.toggle('scrolled', progress > 0.2);
}

function getData() {
  return window.COSA_DATA || { ranking: [], tournaments: [], playerCount: 0, tournamentCount: 0 };
}

/** Hidrata COSA_DATA desde Prisma (API). Fallback: data.js local. */
async function hydrateFromApi() {
  try {
    const base = getApiBase();
    const rankingUrl = `${base}/api/ranking`.replace(/([^:]\/)\/+/g, '$1');
    const tournamentsUrl = `${base}/api/tournaments`.replace(/([^:]\/)\/+/g, '$1');
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const [rRes, tRes] = await Promise.all([
      fetch(rankingUrl, { signal: controller.signal }),
      fetch(tournamentsUrl, { signal: controller.signal }),
    ]);
    clearTimeout(t);
    if (!rRes.ok) return false;
    const rankingData = await rRes.json();
    let tournaments = (window.COSA_DATA && window.COSA_DATA.tournaments) || [];
    if (tRes.ok) {
      const tData = await tRes.json();
      if (Array.isArray(tData.tournaments) && tData.tournaments.length) {
        tournaments = tData.tournaments;
      }
    }
    if (!Array.isArray(rankingData.ranking) || !rankingData.ranking.length) return false;
    window.COSA_DATA = {
      generatedAt: new Date().toISOString().slice(0, 10),
      formula: rankingData.formula || 'PG → EFE → AVG → PJ',
      tournamentCount: rankingData.tournamentCount ?? tournaments.length,
      playerCount: rankingData.playerCount ?? rankingData.ranking.length,
      ranking: rankingData.ranking,
      tournaments,
      source: 'api',
    };
    setConnUI(true);
    return true;
  } catch (e) {
    console.warn('[hydrateFromApi]', e.message || e);
    setConnUI(false);
    return false;
  }
}

function getAuthToken() {
  try {
    return localStorage.getItem('cn_token') || null;
  } catch {
    return null;
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem('cn_session');
    if (raw) currentUser = JSON.parse(raw);
  } catch (e) {
    currentUser = null;
  }
  updateAuthUI();
}

function saveSession(user, token, expiresAt) {
  currentUser = user;
  try {
    localStorage.setItem('cn_session', JSON.stringify(user));
    if (token) localStorage.setItem('cn_token', token);
    if (expiresAt) localStorage.setItem('cn_token_exp', expiresAt);
  } catch (e) { /* ignore quota */ }
  updateAuthUI();
}

function clearSessionLocal() {
  currentUser = null;
  try {
    localStorage.removeItem('cn_session');
    localStorage.removeItem('cn_token');
    localStorage.removeItem('cn_token_exp');
  } catch (e) { /* ignore */ }
  updateAuthUI();
}

async function logout() {
  const token = getAuthToken();
  if (token) {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch (e) { /* offline or already invalid */ }
  }
  clearSessionLocal();
  showPage('home');
}

/** Valida token con el backend; limpia sesión si es inválida */
async function restoreSession() {
  loadSession();
  const token = getAuthToken();
  if (!token || !currentUser) return;
  try {
    const data = await apiFetch('/api/auth/me');
    if (data?.user) {
      currentUser = data.user;
      localStorage.setItem('cn_session', JSON.stringify(data.user));
      updateAuthUI();
    }
  } catch (err) {
    if (err.status === 401) clearSessionLocal();
  }
}

function updateAuthUI() {
  const loginBtn = document.getElementById('btnLogin');
  const logoutBtn = document.getElementById('btnLogout');
  const profileBtn = document.getElementById('btnProfile');
  const isAdmin = currentUser && (currentUser.role === 'don' || currentUser.role === 'admin');
  document.querySelectorAll('.nav-admin').forEach((el) => {
    el.classList.toggle('hidden', !isAdmin);
  });
  if (currentUser) {
    loginBtn?.classList.add('hidden');
    profileBtn?.classList.remove('hidden');
    logoutBtn?.classList.remove('hidden');
  } else {
    loginBtn?.classList.remove('hidden');
    profileBtn?.classList.add('hidden');
    logoutBtn?.classList.add('hidden');
  }
}

function showPage(pageId, opts) {
  if ((pageId === 'login' || pageId === 'perfil') && !document.getElementById('page-' + pageId)) pageId = 'home';

  // Admin gate (duro): sin rol don/admin → login
  const adminPages = [
    'admin', 'admin-players', 'admin-tournaments', 'admin-notifications', 'admin-club-aliases',
    'import', 'import-preview', 'import-history',
  ];
  if (adminPages.includes(pageId)) {
    const isAdmin = currentUser && (currentUser.role === 'don' || currentUser.role === 'admin');
    if (!isAdmin) {
      pageId = 'login';
      try { showToast({ title: 'Acceso restringido', body: 'Inicia sesión como administrador.' }); } catch (_) {}
    }
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });
  document.getElementById('mobileNav')?.classList.remove('open');
  window.scrollTo(0, 0);

  if (pageId === 'ranking') renderRanking();
  if (pageId === 'torneos') renderTorneosList();
  if (pageId === 'torneo-detalle') {
    currentTournamentId = opts?.id || currentTournamentId;
    renderTorneoDetalle(currentTournamentId);
  }
  if (pageId === 'admin') renderAdmin();
  if (pageId === 'admin-players') loadAdminPlayers();
  if (pageId === 'admin-tournaments') loadAdminTournaments();
  if (pageId === 'admin-notifications') loadAdminNotifications();
  if (pageId === 'admin-club-aliases') loadAdminClubAliases();
  if (pageId === 'perfil') loadUserProfile();
  if (pageId === 'login') {
    const apiInput = document.getElementById('loginApiBase');
    if (apiInput) apiInput.value = getApiBase();
  }
  if (pageId === 'import') setupImportDropzone();
  if (pageId === 'import-preview') renderImportPreview();
  if (pageId === 'import-history') loadImportHistory();

  refreshMotionTargets();
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
}

function typeLabel(t) {
  if (t === 'parejas') return 'Parejas';
  if (t === 'equipos') return 'Equipos';
  return 'Individual';
}

function filterRules() {
  const input = document.getElementById('rulesSearchInput');
  const rows = document.querySelectorAll('#rulesTable tbody tr');
  if (!input || rows.length === 0) return;

  const term = input.value.trim().toLowerCase();
  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!term || text.includes(term)) ? '' : 'none';
  });
}

function recalculateRankingFromTournaments() {
  const data = getData();

  const playerMap = new Map();

  (data.tournaments || []).forEach((t) => {
    (t.players || []).forEach((p) => {
      const rawName = (p.name || '').trim();
      if (!rawName) return;

      const key = rawName.toUpperCase();
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          name: rawName,
          club: p.club || '—',
          pj: 0,
          pg: 0,
          pp: 0,
          efe: 0,
          tournaments: 0
        });
      }

      const entry = playerMap.get(key);
      entry.pj += Number(p.pj) || 0;
      entry.pg += Number(p.pg) || 0;
      entry.pp += Number(p.pp) || 0;
      entry.efe += Number(p.efe) || 0;
      entry.tournaments += 1;

      if (!entry.club || entry.club === '—') {
        entry.club = p.club || '—';
      }
    });
  });

  const list = [...playerMap.values()].map((p) => {
    const avg = p.pj > 0 ? p.pg / p.pj : 0;
    return {
      ...p,
      avg: Number(avg.toFixed(4)),
      avgPct: Math.round(avg * 100)
    };
  });

  list.sort((a, b) => b.pg - a.pg || b.efe - a.efe || b.avg - a.avg || b.pj - a.pj);
  list.forEach((p, index) => { p.pos = index + 1; });

  data.ranking = list;
  data.playerCount = list.length;
  data.tournamentCount = (data.tournaments || []).length;
}

/* ===== BADGES DE ESTATUS (P0) ===== */
const BADGE_DEFS = [
  { id: 'don', label: 'Don', cls: 'badge-status-don', test: (p) => Number(p.pos) === 1 },
  { id: 'capo', label: 'Capo', cls: 'badge-status-capo', test: (p) => { const n = Number(p.pos); return n >= 2 && n <= 3; } },
  { id: 'consigliere', label: 'Consigliere', cls: 'badge-status-consigliere', test: (p) => { const n = Number(p.pos); return n >= 4 && n <= 10; } },
  { id: 'leyenda', label: 'Leyenda', cls: 'badge-status-leyenda', test: (p) => Number(p.tournaments) >= 4 },
  { id: 'invicto', label: 'Invicto', cls: 'badge-status-invicto', test: (p) => Number(p.pg) > 0 && Number(p.pp) === 0 },
  { id: 'veterano', label: 'Veterano', cls: 'badge-status-veterano', test: (p) => Number(p.pj) >= 20 },
  { id: 'promesa', label: 'Promesa', cls: 'badge-status-promesa', test: (p) => Number(p.tournaments) <= 2 && Number(p.avgPct) >= 60 },
];

function getPlayerBadges(player, max = 3) {
  if (!player) return [];
  return BADGE_DEFS.filter((b) => b.test(player)).slice(0, max);
}

function renderBadgesHTML(player, { compact = false, max = 3 } = {}) {
  const badges = getPlayerBadges(player, max);
  if (!badges.length) return '';
  const rowCls = compact ? 'badge-row badge-row--compact' : 'badge-row';
  return `<div class="${rowCls}">${badges
    .map((b) => `<span class="badge-status ${b.cls}">${b.label}</span>`)
    .join('')}</div>`;
}

/* ===== PLAYER DETAIL MODAL (P0) ===== */
let playerModalLastFocus = null;

function getPlayerTournamentHistory(playerName) {
  const data = getData();
  const name = (playerName || '').toUpperCase().trim();
  if (!name) return [];
  const out = [];
  (data.tournaments || []).forEach((t) => {
    const match = (t.players || []).find(
      (p) => (p.name || '').toUpperCase().trim() === name
    );
    if (match) {
      out.push({
        id: t.id,
        name: t.name,
        date: t.date,
        type: t.type,
        pos: match.pos,
        pg: match.pg,
        pp: match.pp,
      });
    }
  });
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}

function findPlayerByName(name) {
  const data = getData();
  const key = (name || '').toUpperCase().trim();
  return (data.ranking || []).find((p) => (p.name || '').toUpperCase().trim() === key) || null;
}

function buildPlayerModalHTML(player) {
  if (!player) {
    return emptyStateHTML({
      icon: '?',
      title: 'Jugador no encontrado',
      msg: 'No hay datos de ranking para este nombre.',
    });
  }

  const initial = (player.name || '?').charAt(0);
  const efeStr = `${player.efe > 0 ? '+' : ''}${player.efe ?? 0}`;
  const history = getPlayerTournamentHistory(player.name);
  const badges = renderBadgesHTML(player, { max: 3 });

  const historyHTML = history.length
    ? `<ul class="player-modal-history">${history
        .map(
          (h) => `
      <li>
        <div>
          <div class="player-modal-history-name">${h.name}</div>
          <div class="player-modal-history-meta">${formatDate(h.date)} · ${typeLabel(h.type)}</div>
        </div>
        <div class="player-modal-history-meta">#${h.pos} · ${h.pg}-${h.pp}</div>
      </li>`
        )
        .join('')}</ul>`
    : emptyStateHTML({
        icon: '♠',
        title: 'Sin historial de torneos',
        msg: 'Este jugador aún no figura en resultados confirmados.',
      });

  return `
    <div class="player-modal-header">
      <div class="player-modal-avatar" aria-hidden="true">${initial}</div>
      <div>
        <div class="player-modal-name" id="playerModalName">${player.name}</div>
        <div class="player-modal-meta">
          ${player.club || '—'} · <span class="player-modal-pos">#${player.pos}</span>
        </div>
        ${badges}
      </div>
    </div>

    <div class="player-modal-stats">
      <div class="player-modal-stat">
        <div class="player-modal-stat-value">${player.pg ?? 0}</div>
        <div class="player-modal-stat-label">PG</div>
      </div>
      <div class="player-modal-stat">
        <div class="player-modal-stat-value">${efeStr}</div>
        <div class="player-modal-stat-label">EFE</div>
      </div>
      <div class="player-modal-stat">
        <div class="player-modal-stat-value">${player.avgPct ?? 0}%</div>
        <div class="player-modal-stat-label">AVG</div>
      </div>
      <div class="player-modal-stat">
        <div class="player-modal-stat-value">${player.pj ?? 0}</div>
        <div class="player-modal-stat-label">PJ</div>
      </div>
      <div class="player-modal-stat">
        <div class="player-modal-stat-value">${player.tournaments ?? 0}</div>
        <div class="player-modal-stat-label">Torneos</div>
      </div>
    </div>

    <div class="player-modal-eff">
      <div class="player-modal-eff-label">
        <span>Eficiencia</span>
        <span>${player.avgPct ?? 0}%</span>
      </div>
      <div class="player-modal-eff-bar">
        <div class="player-modal-eff-fill" style="width:${Math.min(100, player.avgPct || 0)}%"></div>
      </div>
    </div>

    <div class="player-modal-section-title">Historial</div>
    ${historyHTML}

    <div class="player-modal-actions">
      <button type="button" class="btn btn-outline" id="playerModalCloseBtn">Cerrar</button>
    </div>
  `;
}

function openPlayerModal(playerOrName) {
  const overlay = document.getElementById('playerModalOverlay');
  const content = document.getElementById('playerModalContent');
  if (!overlay || !content) return;

  const player =
    typeof playerOrName === 'string' ? findPlayerByName(playerOrName) : playerOrName;

  content.innerHTML = buildPlayerModalHTML(player);
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  document.body.classList.add('modal-open');
  playerModalLastFocus = document.activeElement;

  const closeBtn = document.getElementById('playerModalClose');
  closeBtn?.focus();

  document.getElementById('playerModalCloseBtn')?.addEventListener('click', closePlayerModal);
}

function closePlayerModal() {
  const overlay = document.getElementById('playerModalOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  const onEnd = () => {
    overlay.hidden = true;
    overlay.removeEventListener('transitionend', onEnd);
  };
  overlay.addEventListener('transitionend', onEnd);
  // Fallback if reduced-motion / no transition
  setTimeout(() => {
    if (!overlay.classList.contains('is-open')) overlay.hidden = true;
  }, 350);
  if (playerModalLastFocus && typeof playerModalLastFocus.focus === 'function') {
    playerModalLastFocus.focus();
  }
}

function setupPlayerModal() {
  const overlay = document.getElementById('playerModalOverlay');
  const closeBtn = document.getElementById('playerModalClose');
  if (!overlay) return;

  closeBtn?.addEventListener('click', closePlayerModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePlayerModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      e.preventDefault();
      closePlayerModal();
    }
  });
}

function bindPlayerRowClicks(container) {
  if (!container) return;
  container.querySelectorAll('tr[data-player]').forEach((tr) => {
    const name = tr.getAttribute('data-player');
    if (!name) return;
    tr.addEventListener('click', () => openPlayerModal(name));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPlayerModal(name);
      }
    });
  });
}

/* ===== SKELETON & EMPTY STATES (P0) ===== */
function skeletonRankingRows(count = 8) {
  return Array.from({ length: count }, () => `
    <tr class="skeleton-row" aria-hidden="true">
      <td><div class="skeleton skeleton-text" style="width:28px;height:18px;"></div></td>
      <td>
        <div class="skeleton-player-cell">
          <div class="skeleton skeleton-avatar"></div>
          <div class="skeleton-player-meta">
            <div class="skeleton skeleton-text md"></div>
            <div class="skeleton skeleton-text sm"></div>
          </div>
        </div>
      </td>
      <td><div class="skeleton skeleton-text" style="width:32px;height:16px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width:40px;height:16px;"></div></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="skeleton skeleton-bar"></div>
          <div class="skeleton skeleton-text" style="width:28px;height:12px;"></div>
        </div>
      </td>
      <td><div class="skeleton skeleton-text sm"></div></td>
    </tr>
  `).join('');
}

function skeletonTorneosCards(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-badge" style="margin-bottom:14px;"></div>
      <div class="skeleton skeleton-text lg" style="margin-bottom:10px;"></div>
      <div class="skeleton skeleton-text sm" style="margin-bottom:16px;"></div>
      <div class="skeleton skeleton-text" style="width:55%;height:11px;"></div>
    </div>
  `).join('');
}

function emptyStateHTML({ icon = '—', title, msg, ctaHtml = '' }) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <p class="empty-state-msg">${msg}</p>
      ${ctaHtml}
    </div>
  `;
}

function renderRankingSkeleton(count = 8) {
  const tbody = document.getElementById('rankingBody');
  const meta = document.getElementById('rankingMeta');
  if (meta) meta.textContent = 'Consultando los archivos de la familia…';
  if (tbody) tbody.innerHTML = skeletonRankingRows(count);
}

function renderTorneosSkeleton(count = 4) {
  const grid = document.getElementById('torneosGrid');
  if (grid) grid.innerHTML = skeletonTorneosCards(count);
}

/* ===== RANKING ===== */
function renderRanking() {
  const data = getData();
  const tbody = document.getElementById('rankingBody');
  const meta = document.getElementById('rankingMeta');
  if (!tbody) return;

  const list = data.ranking || [];

  if (!list.length) {
    if (meta) meta.textContent = '0 jugadores · 0 torneos';
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          ${emptyStateHTML({
            icon: '♠',
            title: 'El imperio aún no tiene nombres escritos.',
            msg: 'Cuando se registren los primeros resultados del ranking, aparecerán aquí.',
          })}
        </td>
      </tr>
    `;
    return;
  }

  if (meta) {
    meta.textContent = `${data.playerCount} jugadores · ${data.tournamentCount} torneos · Orden: PG → EFE → AVG`;
  }

  tbody.innerHTML = list.slice(0, 80).map((p, i) => {
    const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const initial = (p.name || '?').charAt(0);
    const badges = renderBadgesHTML(p, { compact: true, max: 2 });
    const safeName = String(p.name || '').replace(/"/g, '&quot;');
    return `
      <tr class="reveal-on-scroll domino-row" style="animation-delay:${Math.min(i * 55, 700)}ms"
          data-player="${safeName}" tabindex="0" role="button" aria-label="Ver ficha de ${safeName}">
        <td class="rank-pos ${posClass}">${p.pos}</td>
        <td>
          <div class="player-cell">
            <div class="player-avatar">${initial}</div>
            <div>
              <div class="player-name">${p.name}</div>
              <div class="player-role">${p.club || '—'}</div>
              ${badges}
            </div>
          </div>
        </td>
        <td class="points">${p.pg}</td>
        <td style="color:var(--cream)">${p.efe > 0 ? '+' : ''}${p.efe}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="efficiency-bar"><div class="efficiency-fill" style="width:${Math.min(100, p.avgPct)}%"></div></div>
            <span style="font-size:0.85rem;color:var(--gray-alias)">${p.avgPct}%</span>
          </div>
        </td>
        <td style="color:var(--gray-alias)">${p.pj} PJ · ${p.tournaments} torneos</td>
      </tr>
    `;
  }).join('');
  bindPlayerRowClicks(tbody);
  refreshMotionTargets();
}

/* ===== TORNEOS LIST ===== */
function renderTorneosList() {
  const grid = document.getElementById('torneosGrid');
  if (!grid) return;
  const data = getData();
  const list = [...(data.tournaments || [])].sort((a, b) => b.date.localeCompare(a.date));

  if (!list.length) {
    grid.innerHTML = emptyStateHTML({
      icon: '♠',
      title: 'Ningún torneo ha sido registrado todavía.',
      msg: 'Los torneos confirmados aparecerán en este archivo de la familia.',
    });
    return;
  }

  grid.innerHTML = list.map(t => {
    const badge = t.type === 'individual' ? 'badge-upcoming' : t.type === 'parejas' ? 'badge-ongoing' : 'badge-finished';
    return `
      <div class="card reveal-on-scroll domino-card" style="cursor:pointer; animation-delay: ${Math.min(list.indexOf(t) * 100, 700)}ms" onclick="showPage('torneo-detalle', {id: '${t.id}'})">
        <span class="card-badge ${badge}">${typeLabel(t.type)}</span>
        <h3 class="card-title">${t.name}</h3>
        <div class="card-meta">${formatDate(t.date)} · ${t.playerCount} jugadores</div>
        <p class="card-desc">Ver resultados completos →</p>
      </div>
    `;
  }).join('');
  refreshMotionTargets();
}

/* ===== TORNEO DETALLE ===== */
function renderTorneoDetalle(id) {
  const data = getData();
  const t = (data.tournaments || []).find(x => x.id === id);
  const titleEl = document.getElementById('torneoDetalleTitle');
  const metaEl = document.getElementById('torneoDetalleMeta');
  const bodyEl = document.getElementById('torneoDetalleBody');

  if (!t) {
    if (titleEl) titleEl.textContent = 'Torneo no encontrado';
    if (bodyEl) bodyEl.innerHTML = '';
    return;
  }

  if (titleEl) titleEl.textContent = t.name;
  if (metaEl) metaEl.textContent = `${formatDate(t.date)} · ${typeLabel(t.type)} · ${t.playerCount} jugadores`;

  if (bodyEl) {
    bodyEl.innerHTML = t.players.map(p => {
      const posClass = p.pos === 1 ? 'gold' : p.pos === 2 ? 'silver' : p.pos === 3 ? 'bronze' : '';
      const avgPct = Math.round((p.avg || 0) * 100);
      const ranked = findPlayerByName(p.name);
      const badgeSource = ranked || {
        name: p.name,
        pos: p.pos,
        pg: p.pg,
        pp: p.pp,
        pj: p.pj,
        tournaments: ranked?.tournaments ?? 1,
        avgPct,
      };
      const badges = renderBadgesHTML(badgeSource, { compact: true, max: 2 });
      const safeName = String(p.name || '').replace(/"/g, '&quot;');
      return `
        <tr data-player="${safeName}" tabindex="0" role="button" aria-label="Ver ficha de ${safeName}">
          <td class="rank-pos ${posClass}">${p.pos}</td>
          <td>
            <div class="player-cell">
              <div class="player-avatar">${(p.name || '?').charAt(0)}</div>
              <div>
                <div class="player-name">${p.name}</div>
                <div class="player-role">${p.club || '—'}</div>
                ${badges}
              </div>
            </div>
          </td>
          <td class="points">${p.pg}-${p.pp}</td>
          <td style="color:var(--cream)">${p.efe > 0 ? '+' : ''}${p.efe}</td>
          <td style="color:var(--gray-alias)">${avgPct}%</td>
          <td style="color:var(--gray-alias)">${p.pj}</td>
        </tr>
      `;
    }).join('');
    bindPlayerRowClicks(bodyEl);
  }
}

/* ===== PROFILE (simple lookup in ranking) ===== */
function renderProfile() {
  const box = document.getElementById('profileContent');
  if (!box) return;
  if (!currentUser) {
    box.innerHTML = `<div class="text-center"><p style="color:var(--gray-alias);margin-bottom:20px;">Inicia sesión para ver tu perfil.</p>
      <button class="btn btn-primary" onclick="showPage('login')">Iniciar sesión</button></div>`;
    return;
  }
  const data = getData();
  const found = (data.ranking || []).find(p =>
    p.name.includes((currentUser.alias || currentUser.name || '').toUpperCase()) ||
    (currentUser.alias || '').toUpperCase().includes(p.name.split(' ')[0])
  );
  const u = currentUser;
  const initial = (u.alias || u.name || '?').charAt(0).toUpperCase();
  const stats = found || { pg: 0, efe: 0, avgPct: 0, pj: 0, tournaments: 0, pos: '—' };

  box.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${initial}</div>
      <h2 style="font-family:var(--font-serif);font-size:1.5rem;margin-bottom:4px;">${u.alias || u.name}</h2>
      <p style="color:var(--gray-alias);font-size:0.85rem;">${found ? 'Posición #' + found.pos : 'Sin datos de ranking aún'}</p>
    </div>
    <div class="profile-stats">
      <div class="stat-item"><div class="stat-value">${stats.pg}</div><div class="stat-label">Victorias</div></div>
      <div class="stat-item"><div class="stat-value">${stats.efe > 0 ? '+' : ''}${stats.efe || 0}</div><div class="stat-label">EFE</div></div>
      <div class="stat-item"><div class="stat-value">${stats.avgPct || 0}%</div><div class="stat-label">AVG</div></div>
    </div>
    <div style="margin-top:20px;text-align:center;color:var(--gray-alias);font-size:0.9rem;">
      ${stats.pj || 0} partidas · ${stats.tournaments || 0} torneos
    </div>
    <div class="mt-8 text-center">
      <button class="btn btn-outline" onclick="logout()">Cerrar sesión</button>
    </div>
  `;
}

/* ===== AUTH & PROFILE (servidor: bcrypt + sesión opaca) ===== */
function switchAuthTab(tab) {
  const boxLogin = document.getElementById('authBoxLogin');
  const boxReg = document.getElementById('authBoxRegister');
  const btnLogin = document.getElementById('btnTabLogin');
  const btnReg = document.getElementById('btnTabRegister');

  if (tab === 'register') {
    boxLogin?.classList.add('hidden');
    boxReg?.classList.remove('hidden');
    if (btnLogin) btnLogin.className = 'btn btn-ghost';
    if (btnReg) btnReg.className = 'btn btn-outline';
  } else {
    boxLogin?.classList.remove('hidden');
    boxReg?.classList.add('hidden');
    if (btnLogin) btnLogin.className = 'btn btn-outline';
    if (btnReg) btnReg.className = 'btn btn-ghost';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const alias = document.getElementById('regAlias').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('registerError');
  const submitBtn = e.target?.querySelector?.('button[type="submit"]');

  if (errorEl) {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando…';
  }

  try {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, alias, email, password }),
    });

    if (!data.token || !data.user) {
      throw new Error('Respuesta de registro incompleta');
    }

    saveSession(data.user, data.token, data.expires);
    showToast({ title: 'Bienvenido', body: `Cuenta creada exitosamente para ${data.user.name}.` });
    showPage('perfil');
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Error al registrar usuario.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrarse';
    }
  }
}

async function loadUserProfile() {
  const title = document.getElementById('profileTitle');
  const email = document.getElementById('profileEmail');
  const nameInput = document.getElementById('profileName');
  const aliasInput = document.getElementById('profileAlias');
  const playerCard = document.getElementById('profilePlayerCard');
  const playerName = document.getElementById('profilePlayerName');
  const playerStats = document.getElementById('profilePlayerStats');

  if (!currentUser) {
    showPage('login');
    return;
  }

  if (nameInput) nameInput.value = currentUser.name || '';
  if (aliasInput) aliasInput.value = currentUser.alias || '';
  if (email) email.textContent = currentUser.email || '';
  if (title) title.textContent = currentUser.name ? `Hola, ${currentUser.name}` : 'Mi Perfil';

  try {
    const data = await apiFetch('/api/user/profile');
    if (data?.user?.player) {
      const p = data.user.player;
      if (playerCard && playerName && playerStats) {
        playerName.textContent = `${p.displayName} (${p.club || 'Sin club'})`;
        playerStats.textContent = `Puntos: ${p.rankingPoints} · Víctorias: ${p.wins}PG-${p.losses}PP · Torneos: ${p.tournamentsPlayed}`;
        playerCard.style.display = 'block';
      }
    } else if (playerCard) {
      playerCard.style.display = 'none';
    }
  } catch (err) {
    console.warn('Error al cargar perfil:', err);
  }
}

async function saveUserProfile(e) {
  e.preventDefault();
  const st = document.getElementById('profileFormStatus');
  const payload = {
    name: document.getElementById('profileName').value.trim(),
    alias: document.getElementById('profileAlias').value.trim(),
    password: document.getElementById('profilePassword').value,
  };
  try {
    if (st) { st.textContent = 'Guardando…'; st.className = 'admin-form-status'; }
    const data = await apiFetch('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (data?.user) {
      currentUser = { ...currentUser, ...data.user };
      localStorage.setItem('cn_session', JSON.stringify(currentUser));
      updateAuthUI();
    }
    if (st) { st.textContent = 'Perfil actualizado.'; st.className = 'admin-form-status is-ok'; }
    showToast({ title: 'Perfil', body: 'Datos actualizados correctamente.' });
    document.getElementById('profilePassword').value = '';
  } catch (err) {
    if (st) { st.textContent = err.message || 'Error'; st.className = 'admin-form-status is-error'; }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const apiBaseInput = document.getElementById('loginApiBase');
  const errorEl = document.getElementById('loginError');
  const submitBtn = e.target?.querySelector?.('button[type="submit"]');

  if (apiBaseInput && apiBaseInput.value.trim()) {
    setApiBase(apiBaseInput.value.trim());
  }

  if (errorEl) {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando…';
  }

  try {
    const data = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!data.token || !data.user) {
      throw new Error('Respuesta de login incompleta');
    }

    saveSession(data.user, data.token, data.expiresAt);
    const isAdmin = data.user.role === 'don' || data.user.role === 'admin';
    showPage(isAdmin ? 'admin' : 'home');
  } catch (err) {
    if (errorEl) {
      if (err.status === 401) {
        errorEl.textContent = 'Email o contraseña incorrectos.';
      } else {
        errorEl.textContent =
          err.message ||
          'No se pudo iniciar sesión. Arranca el backend (cosa-nostra) en el puerto 3000.';
      }
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  }
}

/* ===== API CLIENT + IMPORT FLOW ===== */
// Vacío = mismo origen (server.js hace proxy de /api → backend en :3001)
const DEFAULT_API_BASE = '';
let importState = {
  batchId: null,
  fileHash: null,
  tournament: null,
  stats: null,
  rows: [],
  file: null,
};

function getApiBase() {
  try {
    const stored = localStorage.getItem('cn_api_base');
    if (stored === null || stored === undefined) return DEFAULT_API_BASE;
    return String(stored).replace(/\/$/, '');
  } catch {
    return DEFAULT_API_BASE;
  }
}

function setApiBase(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  // Permitir cadena vacía = mismo origen (proxy)
  localStorage.setItem('cn_api_base', clean);
  checkConnection();
}

async function apiFetch(path, options = {}) {
  const base = getApiBase();
  // base vacío → ruta relativa /api/... (proxy del server.js)
  const url = path.startsWith('http')
    ? path
    : base
      ? `${base}${path.startsWith('/') ? path : '/' + path}`
      : path.startsWith('/')
        ? path
        : `/${path}`;
  const token = getAuthToken();
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    const err = new Error(
      `No se pudo conectar con el backend (${base}). ¿Está en marcha? Ejecuta: cd cosa-nostra && npm run dev`
    );
    err.status = 0;
    err.url = url;
    err.cause = networkErr;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login' && path !== '/api/auth/me') {
      clearSessionLocal();
    }
    let msg = (data && data.error) || `HTTP ${res.status}`;
    if (res.status === 404) {
      msg = `Ruta no encontrada (404): ${url}. Comprueba que el backend Next.js esté en ${base} y que la URL del API en Admin sea correcta (sin /api al final).`;
    }
    const err = new Error(msg);
    err.status = res.status;
    err.details = data && data.details;
    err.data = data;
    err.url = url;
    throw err;
  }
  return data;
}

function setConnUI(online) {
  const el = document.getElementById('connStatus');
  const dot = document.getElementById('adminConnDot');
  const label = document.getElementById('adminConnLabel');
  if (el) {
    el.textContent = online ? '●' : '○';
    el.classList.toggle('online', online);
    el.classList.toggle('offline', !online);
    el.title = online ? 'Conectado al backend' : 'Sin conexión al backend';
  }
  if (dot) {
    dot.classList.toggle('online', online);
    dot.classList.toggle('offline', !online);
  }
  if (label) {
    label.textContent = online
      ? 'CONECTADO — Sincronización disponible'
      : 'SIN CONEXIÓN — Ranking local disponible. La importación requiere conexión.';
  }
}

async function checkConnection() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const base = getApiBase();
    const url = `${base}/api/ranking`.replace(/([^:]\/)\/+/g, '$1');
    const res = await fetch(url, { signal: controller.signal, method: 'GET' });
    clearTimeout(t);
    // Solo online si responde 2xx (un 404 ya no cuenta como conectado)
    setConnUI(res.ok);
    return res.ok;
  } catch {
    setConnUI(false);
    return false;
  }
}

function renderAdmin() {
  const input = document.getElementById('apiBaseInput');
  if (input) input.value = getApiBase();
  checkConnection();
  const isAdmin = currentUser && (currentUser.role === 'don' || currentUser.role === 'admin');
  if (!isAdmin) {
    // Still show panel; gate is soft. Hint via conn label is enough.
  }
}

function setupImportDropzone() {
  const zone = document.getElementById('importDropzone');
  const input = document.getElementById('importFileInput');
  const btn = document.getElementById('btnSelectFile');
  const status = document.getElementById('importUploadStatus');
  if (!zone || !input) return;

  if (status) {
    status.className = 'import-status hidden';
    status.textContent = '';
  }

  btn?.addEventListener('click', () => input.click());
  input.onchange = () => {
    if (input.files && input.files[0]) handleImportFile(input.files[0]);
  };

  zone.ondragover = (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  };
  zone.ondragleave = () => zone.classList.remove('dragover');
  zone.ondrop = (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleImportFile(f);
  };
}

function showImportStatus(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = `import-status ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleImportFile(file) {
  if (!/\.xlsx?$/i.test(file.name)) {
    showImportStatus('importUploadStatus', 'error', 'Solo se aceptan archivos .xlsx o .xls');
    return;
  }
  showImportStatus('importUploadStatus', 'info', `Subiendo ${file.name}…`);

  const online = await checkConnection();
  if (!online) {
    showImportStatus(
      'importUploadStatus',
      'error',
      'Sin conexión al backend. Configura la URL de la API en Admin y asegúrate de que el servidor esté en marcha.'
    );
    return;
  }

  try {
    const form = new FormData();
    form.append('file', file);
    const data = await apiFetch('/api/import/betadomino/preview', {
      method: 'POST',
      body: form,
      headers: {}, // let browser set multipart boundary
    });

    importState = {
      batchId: data.batchId,
      fileHash: data.file?.fileHash || data.fileHash,
      tournament: data.tournament,
      stats: data.stats,
      rows: data.rows || [],
      file: data.file,
    };

    showImportStatus(
      'importUploadStatus',
      'success',
      data.reused
        ? 'Batch en preview reutilizado (mismo archivo). Abriendo revisión…'
        : 'Archivo procesado. Abriendo revisión…'
    );
    setTimeout(() => showPage('import-preview'), 400);
  } catch (err) {
    showImportStatus(
      'importUploadStatus',
      'error',
      err.message || 'Error al procesar el archivo'
    );
  }
}

function matchBadge(status) {
  const map = {
    exact_id: ['match-exact', 'Exacto ID'],
    exact_name: ['match-exact', 'Exacto nombre'],
    fuzzy_name: ['match-fuzzy', 'Fuzzy'],
    new: ['match-new', 'Nuevo'],
    conflict: ['match-conflict', 'Conflicto'],
  };
  const [cls, label] = map[status] || ['match-fuzzy', status || '—'];
  return `<span class="match-badge ${cls}">${label}</span>`;
}

function effectiveRowAction(row) {
  if (row.action) return row.action;
  if (row.matchStatus === 'exact_id' || row.matchStatus === 'exact_name') return 'accept_match';
  if (row.matchStatus === 'new') return 'create_new';
  return '';
}

function renderImportPreview() {
  const title = document.getElementById('previewTitle');
  const meta = document.getElementById('previewMeta');
  const statsEl = document.getElementById('previewStats');
  const body = document.getElementById('previewBody');
  const alert = document.getElementById('previewAlert');
  const btnConfirm = document.getElementById('btnConfirmImport');
  const btnReact = document.getElementById('btnOpenReactPreview');

  if (!importState.batchId) {
    if (title) title.textContent = 'Sin batch activo';
    if (body) body.innerHTML = '';
    if (btnReact) btnReact.style.display = 'none';
    return;
  }

  if (btnReact && importState.batchId) {
    btnReact.href = `/import/preview/${importState.batchId}`;
    btnReact.style.display = 'inline-flex';
  }

  const t = importState.tournament || {};
  if (title) title.textContent = t.name || 'Preview de importación';
  if (meta) {
    meta.textContent = [
      t.date || '',
      t.type === 'parejas' ? 'Parejas' : 'Individual',
      t.roundNumber != null ? `Ronda ${t.roundNumber}` : '',
      importState.file?.originalFilename || '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const s = importState.stats || {};
  if (statsEl) {
    statsEl.innerHTML = [
      ['Jugadores', s.players ?? importState.rows.length],
      ['Reconocidos', s.recognized ?? '—'],
      ['Nuevos', s.new ?? '—'],
      ['Fuzzy', s.fuzzy ?? '—'],
      ['Conflictos', s.conflicts ?? '—'],
    ]
      .map(
        ([lbl, val]) =>
          `<div class="preview-stat"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`
      )
      .join('');
  }

  if (alert) {
    alert.className = 'import-status hidden';
    alert.textContent = '';
  }

  if (body) {
    body.innerHTML = importState.rows
      .map((row, i) => {
        const action = effectiveRowAction(row);
        const needsPlayerId = action === 'link_existing' || (action === 'accept_match' && row.matchStatus === 'conflict');
        return `
        <tr data-decision-id="${row.decisionId || ''}" data-row-index="${row.rowIndex}">
          <td class="rank-pos">${row.pos ?? i + 1}</td>
          <td>
            <div class="player-name">${row.nameRaw || '—'}</div>
            <div class="player-role" style="font-size:0.75rem;">${row.betaId ? 'ID ' + row.betaId : ''}</div>
          </td>
          <td style="color:var(--gray-alias)">${row.clubRaw || '—'}</td>
          <td>${matchBadge(row.matchStatus)}</td>
          <td>
            <select class="preview-action-select" data-decision-id="${row.decisionId || ''}">
              <option value="accept_match" ${action === 'accept_match' ? 'selected' : ''}>Aceptar match</option>
              <option value="create_new" ${action === 'create_new' ? 'selected' : ''}>Crear nuevo</option>
              <option value="link_existing" ${action === 'link_existing' ? 'selected' : ''}>Vincular existente</option>
              <option value="ignore" ${action === 'ignore' ? 'selected' : ''}>Ignorar</option>
            </select>
            <input type="text" class="preview-player-id ${needsPlayerId ? '' : 'hidden'}"
              placeholder="playerId GFCN"
              value="${row.selectedPlayerId || row.proposedPlayerId || ''}"
              data-decision-id="${row.decisionId || ''}">
          </td>
          <td class="points">${row.pg ?? 0}-${row.pp ?? 0}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('.preview-action-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const id = sel.dataset.decisionId;
        const row = importState.rows.find((r) => r.decisionId === id);
        if (row) row.action = sel.value;
        const input = body.querySelector(`.preview-player-id[data-decision-id="${id}"]`);
        if (input) {
          const show = sel.value === 'link_existing' || (sel.value === 'accept_match' && row?.matchStatus === 'conflict');
          input.classList.toggle('hidden', !show);
        }
        updateConfirmEnabled();
      });
    });
  }

  updateConfirmEnabled();
}

function updateConfirmEnabled() {
  const btn = document.getElementById('btnConfirmImport');
  if (!btn) return;
  const pending = importState.rows.filter((r) => {
    const a = effectiveRowAction(r);
    if (!a) return true;
    if (
      (a === 'accept_match' || a === 'link_existing') &&
      r.matchStatus !== 'exact_id' &&
      r.matchStatus !== 'exact_name' &&
      !r.selectedPlayerId &&
      !r.proposedPlayerId
    ) {
      // will read from input at confirm time
    }
    return false;
  });
  // Allow confirm; server validates
  btn.disabled = !importState.batchId || importState.rows.length === 0;
}

async function autoResolvePreview() {
  importState.rows.forEach((row) => {
    if (row.action) return;
    if (row.matchStatus === 'exact_id' || row.matchStatus === 'exact_name') {
      row.action = 'accept_match';
      if (row.proposedPlayerId) row.selectedPlayerId = row.proposedPlayerId;
    } else if (row.matchStatus === 'new') {
      row.action = 'create_new';
    }
  });
  // Persist bulk
  const decisions = importState.rows
    .filter((r) => r.decisionId && r.action)
    .map((r) => ({
      id: r.decisionId,
      action: r.action,
      selectedPlayerId:
        r.action === 'accept_match' || r.action === 'link_existing'
          ? r.selectedPlayerId || r.proposedPlayerId || null
          : null,
    }));
  if (decisions.length) {
    try {
      await apiFetch(`/api/import/betadomino/${importState.batchId}/decisions`, {
        method: 'PATCH',
        body: JSON.stringify({ decisions }),
      });
    } catch (err) {
      showImportStatus('previewAlert', 'error', err.message || 'Error al guardar decisiones automáticas');
      return;
    }
  }
  renderImportPreview();
  showImportStatus('previewAlert', 'success', `${decisions.length} filas resueltas automáticamente.`);
}

async function confirmImport() {
  const btn = document.getElementById('btnConfirmImport');
  if (btn) btn.disabled = true;

  // Collect actions from DOM
  const body = document.getElementById('previewBody');
  const decisions = [];
  if (body) {
    body.querySelectorAll('tr[data-decision-id]').forEach((tr) => {
      const id = tr.dataset.decisionId;
      if (!id) return;
      const sel = tr.querySelector('.preview-action-select');
      const pidInput = tr.querySelector('.preview-player-id');
      const action = sel?.value || 'create_new';
      let selectedPlayerId = null;
      if (action === 'accept_match' || action === 'link_existing') {
        selectedPlayerId = (pidInput?.value || '').trim() || null;
        const row = importState.rows.find((r) => r.decisionId === id);
        if (!selectedPlayerId && row) {
          selectedPlayerId = row.selectedPlayerId || row.proposedPlayerId || null;
        }
      }
      decisions.push({ id, action, selectedPlayerId });
      const row = importState.rows.find((r) => r.decisionId === id);
      if (row) {
        row.action = action;
        row.selectedPlayerId = selectedPlayerId;
      }
    });
  }

  try {
    if (decisions.length) {
      await apiFetch(`/api/import/betadomino/${importState.batchId}/decisions`, {
        method: 'PATCH',
        body: JSON.stringify({ decisions }),
      });
    }

    const result = await apiFetch('/api/import/betadomino/confirm', {
      method: 'POST',
      body: JSON.stringify({
        batchId: importState.batchId,
        fileHash: importState.fileHash,
        // confirmedById lo asigna el servidor desde el token admin
      }),
    });

    showImportStatus(
      'previewAlert',
      'success',
      `Confirmado. Torneo ${result.tournamentId}. Jugadores nuevos: ${result.summary?.playersCreated ?? 0}. Resultados: ${result.summary?.resultsWritten ?? 0}.`
    );
    if (btn) {
      btn.textContent = 'Confirmado ✓';
    }
  } catch (err) {
    const details = err.details?.length ? ' — ' + err.details.slice(0, 3).join('; ') : '';
    showImportStatus('previewAlert', 'error', (err.message || 'Error al confirmar') + details);
    if (btn) btn.disabled = false;
  }
}

async function loadImportHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = `
    <div class="skeleton-card" style="margin-bottom:12px;" aria-hidden="true">
      <div class="skeleton skeleton-text lg" style="margin-bottom:10px;width:60%;"></div>
      <div class="skeleton skeleton-text sm" style="width:40%;"></div>
    </div>
    <div class="skeleton-card" style="margin-bottom:12px;" aria-hidden="true">
      <div class="skeleton skeleton-text lg" style="margin-bottom:10px;width:55%;"></div>
      <div class="skeleton skeleton-text sm" style="width:35%;"></div>
    </div>
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-text lg" style="margin-bottom:10px;width:50%;"></div>
      <div class="skeleton skeleton-text sm" style="width:30%;"></div>
    </div>
  `;

  const online = await checkConnection();
  if (!online) {
    list.innerHTML = emptyStateHTML({
      icon: '○',
      title: 'Sin conexión',
      msg: 'No se puede cargar el historial. El ranking local sigue disponible.',
    });
    return;
  }

  try {
    const data = await apiFetch('/api/import/betadomino/list?limit=40');
    const batches = data.batches || [];
    if (!batches.length) {
      list.innerHTML = emptyStateHTML({
        icon: '♠',
        title: 'No hay importaciones todavía.',
        msg: 'Cuando confirmes el primer archivo, aparecerá aquí el historial de la familia.',
      });
      return;
    }
    list.innerHTML = batches
      .map((b) => {
        const date = b.tournamentDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : '');
        const stats = b.stats || {};
        const players = stats.players ?? b.decisionCount ?? '—';
        return `
        <div class="history-item">
          <div class="history-item-main">
            <div class="history-item-title">${b.tournamentName || 'Sin nombre'}</div>
            <div class="history-item-meta">
              ${date} · ${b.type === 'parejas' ? 'Parejas' : 'Individual'} · ${players} jugadores
              ${b.originalFilename ? ' · ' + b.originalFilename : ''}
            </div>
          </div>
          <span class="history-status ${b.status}">${b.status}</span>
          ${
            b.status === 'preview'
              ? `<button class="btn btn-outline" type="button" data-open-batch="${b.batchId}">Revisar</button>
                 <a class="btn btn-outline" style="margin-left:6px;font-size:0.8rem;padding:4px 8px;" href="/import/preview/${b.batchId}">Vista React</a>`
              : `<a class="btn btn-outline" style="font-size:0.8rem;padding:4px 8px;" href="/ranking/events/${b.batchId}">🔍 Impacto</a>`
          }
        </div>`;
      })
      .join('');

    list.querySelectorAll('[data-open-batch]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-open-batch');
        try {
          const batch = await apiFetch(`/api/import/betadomino/${id}`);
          importState = {
            batchId: batch.batchId,
            fileHash: batch.file?.fileHash,
            tournament: batch.tournament,
            stats: batch.stats,
            rows: batch.rows || [],
            file: batch.file,
          };
          showPage('import-preview');
        } catch (err) {
          alert(err.message || 'No se pudo cargar el batch');
        }
      });
    });
  } catch (err) {
    list.innerHTML = emptyStateHTML({
      icon: '!',
      title: 'No se pudo conectar con la familia.',
      msg: err.message || 'Error al cargar historial. Reintentar más tarde.',
      ctaHtml: `<button class="btn btn-outline" type="button" onclick="loadImportHistory()">Reintentar</button>`,
    });
  }
}


/* ===== WEB PUSH NOTIFICATIONS ===== */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function getSwRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    if (window.__cnSwReg) return window.__cnSwReg;
    const reg = await navigator.serviceWorker.ready;
    window.__cnSwReg = reg;
    return reg;
  } catch {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      window.__cnSwReg = reg;
      await navigator.serviceWorker.ready;
      return reg;
    } catch (e) {
      console.warn('[sw] getSwRegistration', e);
      return null;
    }
  }
}

/** Re-suscribe tras pushsubscriptionchange del SW */
async function resyncPushSubscription(oldEndpoint) {
  try {
    if (oldEndpoint) {
      try {
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: oldEndpoint }),
        });
      } catch (_) {}
    }
    if (Notification.permission === 'granted') {
      await enablePushNotifications();
    }
  } catch (e) {
    console.warn('[push] resync failed', e);
  }
}
window.resyncPushSubscription = resyncPushSubscription;

function handlePushNavigate(url) {
  const u = String(url || '');
  if (u.includes('ranking')) showPage('ranking');
  else if (u.includes('torneo')) showPage('torneos');
  else if (u.includes('admin')) showPage('admin');
  else showPage('home');
  loadNotifications();
}
window.handlePushNavigate = handlePushNavigate;

async function enablePushNotifications() {
  if (!pushSupported()) {
    alert('Este dispositivo o navegador no soporta notificaciones push.');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Permiso denegado. Puedes activarlo después en ajustes del navegador.');
    return false;
  }

  const reg = await getSwRegistration();
  if (!reg) {
    alert('Service Worker no disponible. Abre la app por HTTPS o localhost.');
    return false;
  }

  let publicKey;
  try {
    const data = await apiFetch('/api/push/vapid-public-key');
    publicKey = data.publicKey;
  } catch (err) {
    alert(err.message || 'No se pudo obtener la clave VAPID del servidor.');
    return false;
  }

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      topics: ['ranking', 'tournaments', 'results'],
      userAgent: navigator.userAgent,
    }),
  });

  try {
    localStorage.setItem('cn_push_enabled', '1');
    localStorage.setItem('cn_push_dismissed', '1');
  } catch (_) {}
  hidePushBanner();
  showToast({ title: 'Avisos activados', body: 'Recibirás novedades del club en este dispositivo.' });
  return true;
}

async function disablePushNotifications() {
  const reg = await getSwRegistration();
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    try {
      await apiFetch('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch (_) {}
    await subscription.unsubscribe();
  }
  try {
    localStorage.removeItem('cn_push_enabled');
  } catch (_) {}
}

function hidePushBanner() {
  document.getElementById('pushNotifyBar')?.classList.remove('show');
}

function maybeShowPushBanner() {
  if (!pushSupported()) return;
  try {
    if (localStorage.getItem('cn_push_dismissed') || localStorage.getItem('cn_push_enabled')) return;
  } catch (_) {
    return;
  }
  if (Notification.permission === 'denied') return;
  // Delay so install bar doesn't collide
  setTimeout(() => {
    const bar = document.getElementById('pushNotifyBar');
    if (bar && !document.getElementById('pwaInstallBar')?.classList.contains('show')) {
      bar.classList.add('show');
    }
  }, 2500);
}

async function sendTestPush() {
  const status = document.getElementById('pushSendStatus');
  if (status) status.textContent = 'Enviando…';
  try {
    const result = await apiFetch('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Cosa Nostra',
        body: 'Prueba de notificación — la familia está conectada.',
        url: './index.html',
        topic: 'results',
        tag: 'test',
      }),
    });
    if (status) {
      status.textContent = `Enviadas: ${result.sent || 0} · Fallidas: ${result.failed || 0} · Suscriptores: ${result.total || 0}`;
    }
    showToast({ title: 'Aviso enviado', body: 'También aparecerá en el centro de notificaciones.' });
    loadNotifications();
  } catch (err) {
    if (status) status.textContent = err.message || 'Error al enviar';
  }
}



/* ===== IN-APP NOTIFICATIONS ===== */
const NOTIF_GUEST_READ_KEY = 'cn_notif_read_ids';
let notifState = { items: [], unread: 0, open: false };

function getGuestReadIds() {
  try {
    const raw = localStorage.getItem(NOTIF_GUEST_READ_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGuestReadIds(ids) {
  try {
    localStorage.setItem(NOTIF_GUEST_READ_KEY, JSON.stringify([...new Set(ids)].slice(-100)));
  } catch (_) {}
}

function formatNotifTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return Math.floor(diff / 60) + ' min';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h';
    return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('is-empty');
  } else {
    badge.textContent = '0';
    badge.classList.add('is-empty');
  }
}

function renderNotifList() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const items = notifState.items || [];
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty">No hay avisos todavía.<br>Cuando haya resultados o novedades, aparecerán aquí.</div>';
    return;
  }
  list.innerHTML = items.map((n) => {
    const unread = !n.read ? ' is-unread' : '';
    const typeCls = n.type ? ` notif-type-${n.type}` : '';
    const safeTitle = String(n.title || '').replace(/</g, '&lt;');
    const safeBody = String(n.body || '').replace(/</g, '&lt;');
    return `
      <button type="button" class="notif-item${unread}${typeCls}" data-notif-id="${n.id}" data-notif-url="${(n.url || '').replace(/"/g, '&quot;')}">
        <div class="notif-item-top">
          <span class="notif-dot" aria-hidden="true"></span>
          <div>
            <div class="notif-item-title">${safeTitle}</div>
            <div class="notif-item-body">${safeBody}</div>
            <div class="notif-item-meta">${formatNotifTime(n.createdAt)}</div>
          </div>
        </div>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-notif-id]').forEach((btn) => {
    btn.addEventListener('click', () => onNotifClick(btn.getAttribute('data-notif-id'), btn.getAttribute('data-notif-url')));
  });
}

async function loadNotifications() {
  try {
    const headers = {};
    if (!getAuthToken()) {
      const ids = getGuestReadIds();
      if (ids.length) headers['X-Read-Ids'] = ids.join(',');
    }
    const data = await apiFetch('/api/notifications?limit=40', { headers });
    let items = data.notifications || [];
    // Huésped: aplicar leídas locales
    if (!getAuthToken()) {
      const read = new Set(getGuestReadIds());
      items = items.map((n) => ({ ...n, read: n.read || read.has(n.id) }));
    }
    notifState.items = items;
    notifState.unread = items.filter((n) => !n.read).length;
    updateNotifBadge(notifState.unread);
    if (notifState.open) renderNotifList();
    return true;
  } catch (err) {
    // Offline: mantener estado local / empty
    if (!notifState.items.length) {
      const list = document.getElementById('notifList');
      if (list && notifState.open) {
        list.innerHTML = '<div class="notif-empty">Sin conexión. Los avisos se cargarán al reconectar.</div>';
      }
    }
    return false;
  }
}

async function markNotificationsRead(ids, all = false) {
  if (getAuthToken()) {
    try {
      await apiFetch('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify(all ? { all: true } : { ids }),
      });
    } catch (_) {}
  } else {
    const current = getGuestReadIds();
    if (all) {
      saveGuestReadIds(current.concat((notifState.items || []).map((n) => n.id)));
    } else {
      saveGuestReadIds(current.concat(ids || []));
    }
  }
  if (all) {
    notifState.items = (notifState.items || []).map((n) => ({ ...n, read: true }));
  } else {
    const set = new Set(ids || []);
    notifState.items = (notifState.items || []).map((n) =>
      set.has(n.id) ? { ...n, read: true } : n
    );
  }
  notifState.unread = notifState.items.filter((n) => !n.read).length;
  updateNotifBadge(notifState.unread);
  renderNotifList();
}

async function onNotifClick(id, url) {
  if (id) await markNotificationsRead([id]);
  closeNotifPanel();
  if (url) {
    // Soporta rutas internas data-page
    if (url.includes('ranking')) showPage('ranking');
    else if (url.includes('torneo')) showPage('torneos');
    else if (url.includes('admin')) showPage('admin');
    else if (url.startsWith('http')) window.open(url, '_blank');
  }
}

function openNotifPanel() {
  const panel = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  if (!panel) return;
  notifState.open = true;
  panel.hidden = false;
  if (overlay) overlay.hidden = false;
  requestAnimationFrame(() => {
    panel.classList.add('is-open');
    overlay?.classList.add('is-open');
  });
  renderNotifList();
  loadNotifications();
}

function closeNotifPanel() {
  const panel = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  notifState.open = false;
  panel?.classList.remove('is-open');
  overlay?.classList.remove('is-open');
  setTimeout(() => {
    if (!notifState.open) {
      if (panel) panel.hidden = true;
      if (overlay) overlay.hidden = true;
    }
  }, 280);
}

function showToast({ title, body, duration = 4200 } = {}) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <div>
      ${title ? `<div class="toast-title">${String(title).replace(/</g, '&lt;')}</div>` : ''}
      ${body ? `<div class="toast-body">${String(body).replace(/</g, '&lt;')}</div>` : ''}
    </div>
    <button type="button" class="toast-close" aria-label="Cerrar">×</button>
  `;
  el.querySelector('.toast-close')?.addEventListener('click', () => el.remove());
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

function setupInAppNotifications() {
  document.getElementById('notifBell')?.addEventListener('click', () => {
    if (notifState.open) closeNotifPanel();
    else openNotifPanel();
  });
  document.getElementById('notifOverlay')?.addEventListener('click', closeNotifPanel);
  document.getElementById('notifClose')?.addEventListener('click', closeNotifPanel);
  document.getElementById('notifMarkAll')?.addEventListener('click', () => markNotificationsRead([], true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifState.open) closeNotifPanel();
  });
  // Carga inicial + polling suave
  loadNotifications();
  setInterval(() => {
    if (document.visibilityState === 'visible') loadNotifications();
  }, 60000);
}



/* ===== ADMIN CRUD: PLAYERS ===== */
let adminPlayersCache = [];

function isCurrentAdmin() {
  return !!(currentUser && (currentUser.role === 'don' || currentUser.role === 'admin'));
}

async function loadAdminUsersForSelect() {
  const sel = document.getElementById('playerUserId');
  if (!sel) return;
  try {
    const data = await apiFetch('/api/admin/users');
    const users = data.users || [];
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Sin cuenta de usuario --</option>' +
      users.map(u => {
        const linked = u.player ? ` (Ya vinculado a: ${escapeHtml(u.player.displayName)})` : '';
        return `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})${linked}</option>`;
      }).join('');
    if (currentVal) sel.value = currentVal;
  } catch (err) {
    console.warn('Error al cargar usuarios:', err);
  }
}

async function loadAdminPlayers() {
  const box = document.getElementById('adminPlayersList');
  if (!box) return;
  if (!isCurrentAdmin()) {
    box.innerHTML = '<p style="color:var(--gray-alias);">Se requiere administrador.</p>';
    return;
  }
  box.innerHTML = '<p style="color:var(--gray-alias);">Cargando jugadores…</p>';
  try {
    loadAdminUsersForSelect();
    const data = await apiFetch('/api/admin/players');
    adminPlayersCache = data.players || [];
    renderAdminPlayersList(adminPlayersCache);
  } catch (err) {
    box.innerHTML = `<p style="color:#f0a0a0;">${err.message || 'Error'}</p>`;
  }
}

function filterPlayers() {
  const q = (document.getElementById('playerSearch')?.value || '').toLowerCase().trim();
  if (!q) return renderAdminPlayersList(adminPlayersCache);
  const filtered = adminPlayersCache.filter(
    (p) =>
      (p.displayName || '').toLowerCase().includes(q) ||
      (p.club || '').toLowerCase().includes(q) ||
      (p.userEmail || '').toLowerCase().includes(q)
  );
  renderAdminPlayersList(filtered);
}

function renderAdminPlayersList(list) {
  const box = document.getElementById('adminPlayersList');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p style="color:var(--gray-alias);">No hay jugadores.</p>';
    return;
  }
  box.innerHTML = list
    .map((p) => {
      const inactive = p.active === false ? ' is-inactive' : '';
      const status = p.active === false ? ' · inactivo' : '';
      const userLabel = p.userEmail ? ` · 👤 ${escapeHtml(p.userEmail)}` : '';
      return `
      <div class="admin-list-item${inactive}">
        <div class="admin-list-main">
          <div class="admin-list-title">${escapeHtml(p.displayName)}</div>
          <div class="admin-list-meta">${escapeHtml(p.club || '—')} · ${p.wins}PG-${p.losses}PP · ${p.tournamentsPlayed} torneos${userLabel}${status}</div>
        </div>
        <div class="admin-list-actions">
          <button type="button" class="btn btn-outline" data-edit-player="${p.id}">Editar</button>
          <button type="button" class="btn btn-danger" data-del-player="${p.id}">${p.active === false ? 'Ya inactivo' : 'Eliminar'}</button>
        </div>
      </div>`;
    })
    .join('');

  box.querySelectorAll('[data-edit-player]').forEach((btn) => {
    btn.addEventListener('click', () => editPlayer(btn.getAttribute('data-edit-player')));
  });
  box.querySelectorAll('[data-del-player]').forEach((btn) => {
    btn.addEventListener('click', () => deletePlayer(btn.getAttribute('data-del-player')));
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resetPlayerForm() {
  document.getElementById('playerEditId').value = '';
  document.getElementById('playerName').value = '';
  document.getElementById('playerClub').value = '';
  document.getElementById('playerWins').value = '0';
  document.getElementById('playerLosses').value = '0';
  document.getElementById('playerTournaments').value = '0';
  const selUser = document.getElementById('playerUserId');
  if (selUser) selUser.value = '';
  document.getElementById('btnSavePlayer').textContent = 'Añadir jugador';
  document.getElementById('btnCancelPlayerEdit')?.classList.add('hidden');
  const st = document.getElementById('playerFormStatus');
  if (st) { st.textContent = ''; st.className = 'admin-form-status'; }
}

function editPlayer(id) {
  const p = adminPlayersCache.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('playerEditId').value = p.id;
  document.getElementById('playerName').value = p.displayName || '';
  document.getElementById('playerClub').value = p.club || '';
  document.getElementById('playerWins').value = p.wins ?? 0;
  document.getElementById('playerLosses').value = p.losses ?? 0;
  document.getElementById('playerTournaments').value = p.tournamentsPlayed ?? 0;
  const selUser = document.getElementById('playerUserId');
  if (selUser) selUser.value = p.userId || '';
  document.getElementById('btnSavePlayer').textContent = 'Guardar cambios';
  document.getElementById('btnCancelPlayerEdit')?.classList.remove('hidden');
  document.getElementById('playerName')?.focus();
}

async function savePlayer(e) {
  e.preventDefault();
  const st = document.getElementById('playerFormStatus');
  const id = document.getElementById('playerEditId').value;
  const payload = {
    displayName: document.getElementById('playerName').value.trim(),
    club: document.getElementById('playerClub').value.trim(),
    wins: Number(document.getElementById('playerWins').value) || 0,
    losses: Number(document.getElementById('playerLosses').value) || 0,
    tournamentsPlayed: Number(document.getElementById('playerTournaments').value) || 0,
    userId: document.getElementById('playerUserId')?.value || null,
  };
  if (!payload.displayName) return;
  try {
    if (st) { st.textContent = 'Guardando…'; st.className = 'admin-form-status'; }
    if (id) {
      await apiFetch(`/api/admin/players/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/admin/players', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (st) { st.textContent = 'Guardado.'; st.className = 'admin-form-status is-ok'; }
    showToast({ title: 'Jugador', body: id ? 'Actualizado.' : 'Creado.' });
    resetPlayerForm();
    await loadAdminPlayers();
    hydrateFromApi().catch(() => {});
  } catch (err) {
    if (st) { st.textContent = err.message || 'Error'; st.className = 'admin-form-status is-error'; }
  }
}

async function deletePlayer(id) {
  if (!confirm('¿Eliminar o desactivar este jugador?')) return;
  try {
    const res = await apiFetch(`/api/admin/players/${id}`, { method: 'DELETE' });
    showToast({
      title: 'Jugador',
      body: res.softDeleted ? 'Desactivado (tenía resultados).' : 'Eliminado.',
    });
    await loadAdminPlayers();
    hydrateFromApi().catch(() => {});
  } catch (err) {
    alert(err.message || 'Error al eliminar');
  }
}

/* ===== ADMIN CRUD: TOURNAMENTS ===== */
let adminTournamentsCache = [];

async function loadAdminTournaments() {
  const box = document.getElementById('adminTournamentsList');
  if (!box) return;
  if (!isCurrentAdmin()) {
    box.innerHTML = '<p style="color:var(--gray-alias);">Se requiere administrador.</p>';
    return;
  }
  box.innerHTML = '<p style="color:var(--gray-alias);">Cargando torneos…</p>';
  try {
    const data = await apiFetch('/api/admin/tournaments');
    adminTournamentsCache = data.tournaments || [];
    renderAdminTournamentsList(adminTournamentsCache);
  } catch (err) {
    box.innerHTML = `<p style="color:#f0a0a0;">${err.message || 'Error'}</p>`;
  }
}

function renderAdminTournamentsList(list) {
  const box = document.getElementById('adminTournamentsList');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p style="color:var(--gray-alias);">No hay torneos.</p>';
    return;
  }
  box.innerHTML = list
    .map((t) => `
      <div class="admin-list-item">
        <div class="admin-list-main">
          <div class="admin-list-title">${escapeHtml(t.name)}</div>
          <div class="admin-list-meta">${t.startDate || '—'} · ${t.type} · ${t.status} · ${t.resultsCount || 0} resultados</div>
        </div>
        <div class="admin-list-actions">
          <button type="button" class="btn btn-outline" data-edit-tournament="${t.id}">Editar</button>
          <button type="button" class="btn btn-danger" data-del-tournament="${t.id}">Eliminar</button>
        </div>
      </div>`)
    .join('');

  box.querySelectorAll('[data-edit-tournament]').forEach((btn) => {
    btn.addEventListener('click', () => editTournament(btn.getAttribute('data-edit-tournament')));
  });
  box.querySelectorAll('[data-del-tournament]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTournament(btn.getAttribute('data-del-tournament')));
  });
}

function resetTournamentForm() {
  document.getElementById('tournamentEditId').value = '';
  document.getElementById('tournamentName').value = '';
  document.getElementById('tournamentDate').value = '';
  document.getElementById('tournamentType').value = 'individual';
  document.getElementById('tournamentStatus').value = 'upcoming';
  document.getElementById('tournamentLocation').value = '';
  document.getElementById('tournamentDesc').value = '';
  document.getElementById('btnSaveTournament').textContent = 'Añadir torneo';
  document.getElementById('btnCancelTournamentEdit')?.classList.add('hidden');
  const st = document.getElementById('tournamentFormStatus');
  if (st) { st.textContent = ''; st.className = 'admin-form-status'; }
}

function editTournament(id) {
  const t = adminTournamentsCache.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('tournamentEditId').value = t.id;
  document.getElementById('tournamentName').value = t.name || '';
  document.getElementById('tournamentDate').value = t.startDate || '';
  document.getElementById('tournamentType').value = t.type || 'individual';
  document.getElementById('tournamentStatus').value = t.status || 'upcoming';
  document.getElementById('tournamentLocation').value = t.location || '';
  document.getElementById('tournamentDesc').value = t.description || '';
  document.getElementById('btnSaveTournament').textContent = 'Guardar cambios';
  document.getElementById('btnCancelTournamentEdit')?.classList.remove('hidden');
}

async function saveTournament(e) {
  e.preventDefault();
  const st = document.getElementById('tournamentFormStatus');
  const id = document.getElementById('tournamentEditId').value;
  const payload = {
    name: document.getElementById('tournamentName').value.trim(),
    startDate: document.getElementById('tournamentDate').value || null,
    type: document.getElementById('tournamentType').value,
    status: document.getElementById('tournamentStatus').value,
    location: document.getElementById('tournamentLocation').value.trim(),
    description: document.getElementById('tournamentDesc').value.trim(),
  };
  if (!payload.name) return;
  try {
    if (st) { st.textContent = 'Guardando…'; st.className = 'admin-form-status'; }
    if (id) {
      await apiFetch(`/api/admin/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/admin/tournaments', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (st) { st.textContent = 'Guardado.'; st.className = 'admin-form-status is-ok'; }
    showToast({ title: 'Torneo', body: id ? 'Actualizado.' : 'Creado.' });
    resetTournamentForm();
    await loadAdminTournaments();
    hydrateFromApi().catch(() => {});
  } catch (err) {
    if (st) { st.textContent = err.message || 'Error'; st.className = 'admin-form-status is-error'; }
  }
}

async function deleteTournament(id) {
  if (!confirm('¿Eliminar este torneo y sus resultados? Esta acción no se puede deshacer.')) return;
  try {
    await apiFetch(`/api/admin/tournaments/${id}`, { method: 'DELETE' });
    showToast({ title: 'Torneo', body: 'Eliminado.' });
    await loadAdminTournaments();
    hydrateFromApi().catch(() => {});
  } catch (err) {
    alert(err.message || 'Error al eliminar');
  }
}

/* ===== ADMIN CRUD: NOTIFICATIONS ===== */
async function loadAdminNotifications() {
  const box = document.getElementById('adminNotifsList');
  if (!box) return;
  if (!isCurrentAdmin()) {
    box.innerHTML = '<p style="color:var(--gray-alias);">Se requiere administrador.</p>';
    return;
  }
  box.innerHTML = '<p style="color:var(--gray-alias);">Cargando avisos…</p>';
  try {
    const data = await apiFetch('/api/notifications?limit=50');
    const list = data.notifications || [];
    if (!list.length) {
      box.innerHTML = '<p style="color:var(--gray-alias);">No hay avisos.</p>';
      return;
    }
    box.innerHTML = list
      .map((n) => `
        <div class="admin-list-item">
          <div class="admin-list-main">
            <div class="admin-list-title">${escapeHtml(n.title)}</div>
            <div class="admin-list-meta">${escapeHtml(n.type)} · ${formatNotifTime(n.createdAt)} · ${escapeHtml((n.body || '').slice(0, 80))}</div>
          </div>
          <div class="admin-list-actions">
            <button type="button" class="btn btn-outline" data-edit-notif="${n.id}">Editar</button>
            <button type="button" class="btn btn-danger" data-del-notif="${n.id}">Eliminar</button>
          </div>
        </div>`)
      .join('');

    window.__adminNotifsCache = list;
    box.querySelectorAll('[data-edit-notif]').forEach((btn) => {
      btn.addEventListener('click', () => editAdminNotif(btn.getAttribute('data-edit-notif')));
    });
    box.querySelectorAll('[data-del-notif]').forEach((btn) => {
      btn.addEventListener('click', () => deleteAdminNotif(btn.getAttribute('data-del-notif')));
    });
  } catch (err) {
    box.innerHTML = `<p style="color:#f0a0a0;">${err.message || 'Error'}</p>`;
  }
}

function resetNotifForm() {
  document.getElementById('notifEditId').value = '';
  document.getElementById('notifTitle').value = '';
  document.getElementById('notifBody').value = '';
  document.getElementById('notifType').value = 'info';
  document.getElementById('notifUrl').value = '';
  document.getElementById('btnSaveNotif').textContent = 'Publicar aviso';
  document.getElementById('btnCancelNotifEdit')?.classList.add('hidden');
  const st = document.getElementById('notifFormStatus');
  if (st) { st.textContent = ''; st.className = 'admin-form-status'; }
}

function editAdminNotif(id) {
  const n = (window.__adminNotifsCache || []).find((x) => x.id === id);
  if (!n) return;
  document.getElementById('notifEditId').value = n.id;
  document.getElementById('notifTitle').value = n.title || '';
  document.getElementById('notifBody').value = n.body || '';
  document.getElementById('notifType').value = n.type || 'info';
  document.getElementById('notifUrl').value = n.url || '';
  document.getElementById('btnSaveNotif').textContent = 'Guardar cambios';
  document.getElementById('btnCancelNotifEdit')?.classList.remove('hidden');
}

async function saveAdminNotification(e) {
  e.preventDefault();
  const st = document.getElementById('notifFormStatus');
  const id = document.getElementById('notifEditId').value;
  const payload = {
    title: document.getElementById('notifTitle').value.trim(),
    body: document.getElementById('notifBody').value.trim(),
    type: document.getElementById('notifType').value,
    url: document.getElementById('notifUrl').value.trim() || null,
  };
  if (!payload.title || !payload.body) return;
  try {
    if (st) { st.textContent = 'Guardando…'; st.className = 'admin-form-status'; }
    if (id) {
      await apiFetch(`/api/admin/notifications/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (st) { st.textContent = 'Guardado.'; st.className = 'admin-form-status is-ok'; }
    showToast({ title: 'Aviso', body: id ? 'Actualizado.' : 'Publicado.' });
    resetNotifForm();
    await loadAdminNotifications();
    loadNotifications();
  } catch (err) {
    if (st) { st.textContent = err.message || 'Error'; st.className = 'admin-form-status is-error'; }
  }
}

async function deleteAdminNotif(id) {
  if (!confirm('¿Eliminar este aviso?')) return;
  try {
    await apiFetch(`/api/admin/notifications/${id}`, { method: 'DELETE' });
    showToast({ title: 'Aviso', body: 'Eliminado.' });
    await loadAdminNotifications();
    loadNotifications();
  } catch (err) {
    alert(err.message || 'Error');
  }
}

/* ===== ADMIN CRUD: CLUB ALIASES ===== */
async function loadAdminClubAliases() {
  const box = document.getElementById('adminClubAliasesList');
  if (!box) return;
  if (!isCurrentAdmin()) {
    box.innerHTML = '<p style="color:var(--gray-alias);">Se requiere administrador.</p>';
    return;
  }
  box.innerHTML = '<p style="color:var(--gray-alias);">Cargando alias de clubes…</p>';
  try {
    const data = await apiFetch('/api/admin/club-aliases');
    const list = data.aliases || [];
    if (!list.length) {
      box.innerHTML = '<p style="color:var(--gray-alias);">No hay alias de clubes guardados.</p>';
      return;
    }
    box.innerHTML = list
      .map((a) => `
        <div class="admin-list-item">
          <div class="admin-list-main">
            <div class="admin-list-title">${escapeHtml(a.alias)} → ${escapeHtml(a.canonical)}</div>
            <div class="admin-list-meta">ID: ${escapeHtml(a.id)}</div>
          </div>
          <div class="admin-list-actions">
            <button type="button" class="btn btn-danger" data-del-alias="${a.id}">Eliminar</button>
          </div>
        </div>`)
      .join('');

    box.querySelectorAll('[data-del-alias]').forEach((btn) => {
      btn.addEventListener('click', () => deleteAdminClubAlias(btn.getAttribute('data-del-alias')));
    });
  } catch (err) {
    box.innerHTML = `<p style="color:#f0a0a0;">${err.message || 'Error'}</p>`;
  }
}

async function saveAdminClubAlias(e) {
  e.preventDefault();
  const st = document.getElementById('clubAliasFormStatus');
  const payload = {
    alias: document.getElementById('aliasRaw').value.trim(),
    canonical: document.getElementById('aliasCanonical').value.trim(),
  };
  if (!payload.alias || !payload.canonical) return;
  try {
    if (st) { st.textContent = 'Guardando…'; st.className = 'admin-form-status'; }
    await apiFetch('/api/admin/club-aliases', { method: 'POST', body: JSON.stringify(payload) });
    if (st) { st.textContent = 'Alias guardado.'; st.className = 'admin-form-status is-ok'; }
    showToast({ title: 'Alias', body: 'Alias de club registrado correctamente.' });
    document.getElementById('aliasRaw').value = '';
    document.getElementById('aliasCanonical').value = '';
    await loadAdminClubAliases();
  } catch (err) {
    if (st) { st.textContent = err.message || 'Error'; st.className = 'admin-form-status is-error'; }
  }
}

async function deleteAdminClubAlias(id) {
  if (!confirm('¿Eliminar este alias de club?')) return;
  try {
    await apiFetch(`/api/admin/club-aliases?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast({ title: 'Alias', body: 'Eliminado.' });
    await loadAdminClubAliases();
  } catch (err) {
    alert(err.message || 'Error al eliminar alias');
  }
}


document.addEventListener('DOMContentLoaded', () => {
  recalculateRankingFromTournaments();
  spawnDominoField();
  setupPlayerModal();
  setupInAppNotifications();
  restoreSession().finally(() => {
    updateAuthUI();
  });
  showPage('home');
  refreshMotionTargets();
  updateDominoParallax();
  // Backend: hidratar ranking/torneos desde Prisma; si falla, data.js local
  hydrateFromApi().then((ok) => {
    if (ok) {
      const active = document.querySelector('.page.active');
      const id = active && active.id ? active.id.replace(/^page-/, '') : '';
      if (id === 'ranking') renderRanking();
      if (id === 'torneos') renderTorneosList();
    } else {
      checkConnection();
    }
  });

  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      showPage(el.dataset.page);
    });
  });

  document.getElementById('navToggle')?.addEventListener('click', () => {
    document.getElementById('mobileNav')?.classList.toggle('open');
  });

  document.getElementById('btnSaveApiBase')?.addEventListener('click', () => {
    const input = document.getElementById('apiBaseInput');
    setApiBase(input?.value || DEFAULT_API_BASE);
    checkConnection();
  });

  document.getElementById('btnAutoResolve')?.addEventListener('click', () => autoResolvePreview());
  document.getElementById('btnConfirmImport')?.addEventListener('click', () => confirmImport());
  document.getElementById('btnLogout')?.addEventListener('click', () => logout());

  document.getElementById('btnEnablePush')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnEnablePush');
    if (btn) { btn.disabled = true; btn.textContent = 'Activando…'; }
    const ok = await enablePushNotifications();
    if (btn) {
      btn.disabled = false;
      btn.textContent = ok ? 'Activado ✓' : 'Activar';
    }
  });
  document.getElementById('btnDismissPush')?.addEventListener('click', () => {
    try { localStorage.setItem('cn_push_dismissed', '1'); } catch (_) {}
    hidePushBanner();
  });
  document.getElementById('btnTestPush')?.addEventListener('click', () => sendTestPush());
  maybeShowPushBanner();
  // Si ya había permiso, asegurar suscripción registrada en backend
  if (pushSupported() && Notification.permission === 'granted') {
    try {
      if (localStorage.getItem('cn_push_enabled')) {
        enablePushNotifications().catch(() => {});
      }
    } catch (_) {}
  }

  let scrollFrame = null;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      updateNavbarOnScroll();
      updateDominoParallax();
      scrollFrame = null;
    });
  }, { passive: true });
  updateNavbarOnScroll();

  window.addEventListener('online', () => checkConnection());
  window.addEventListener('offline', () => setConnUI(false));
});
