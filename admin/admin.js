/* ============================================================
   bus.brussels — Admin Dashboard JS
   ============================================================ */

'use strict';

// ── Config ────────────────────────────────────────────────
const API_BASE = '';   // same origin

// ── State ─────────────────────────────────────────────────
let TOKEN         = null;
let currentScreen = 'dashboard';
let currentPost   = null;   // post being edited
let allPosts      = [];
let dirtyFlag     = false;
let autoSaveTimer = null;
let currentTags   = [];

// ── DOM references ─────────────────────────────────────────
const loginScreen    = document.getElementById('login-screen');
const adminLayout    = document.getElementById('admin-layout');
const loginForm      = document.getElementById('login-form');
const loginError     = document.getElementById('login-error');
const toastContainer = document.getElementById('toast-container');
const loadingOverlay = document.getElementById('loading-overlay');
const sidebarEl      = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  TOKEN = sessionStorage.getItem('admin_token');
  if (TOKEN) {
    showAdmin();
    navigate('dashboard');
  } else {
    showLogin();
  }
  bindEvents();
});

// ── Auth ───────────────────────────────────────────────────
function showLogin() {
  loginScreen.style.display = 'flex';
  adminLayout.style.display = 'none';
}

function showAdmin() {
  loginScreen.style.display = 'none';
  adminLayout.style.display = 'flex';
}

loginForm && loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('login-password').value;
  loginError.style.display = 'none';
  try {
    const data = await api('POST', '/api/auth/login', { password: pw });
    TOKEN = data.token;
    sessionStorage.setItem('admin_token', TOKEN);
    showAdmin();
    navigate('dashboard');
  } catch (err) {
    loginError.style.display = 'block';
    loginError.textContent = err.message || 'Mot de passe incorrect';
  }
});

document.getElementById('btn-logout') && document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('admin_token');
  TOKEN = null;
  showLogin();
});

// ── API helper ─────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body)  opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) {
    sessionStorage.removeItem('admin_token');
    TOKEN = null;
    showLogin();
    throw new Error('Session expirée');
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  if (!res.ok) throw new Error(json.error || 'Erreur serveur');
  return json;
}

// ── Router ─────────────────────────────────────────────────
function navigate(screen, data) {
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector('.nav-item[data-screen="' + screen + '"]');
  if (navEl) navEl.classList.add('active');

  // Update topbar
  updateTopbar(screen);

  // Close sidebar on mobile
  closeMobileSidebar();

  // Load screen data
  switch (screen) {
    case 'dashboard': loadDashboard(); break;
    case 'articles':  loadArticles();  break;
    case 'editor':
      if (data && data.id) {
        openEditor(data.id);
      } else {
        newPost();
      }
      break;
    case 'settings': break;
  }
}

const SCREEN_LABELS = {
  dashboard: { title: 'Tableau de bord', crumb: 'Admin / Tableau de bord' },
  articles:  { title: 'Articles',         crumb: 'Admin / Articles' },
  editor:    { title: 'Éditeur',           crumb: 'Admin / Éditeur' },
  settings:  { title: 'Paramètres',        crumb: 'Admin / Paramètres' }
};

function updateTopbar(screen) {
  const info = SCREEN_LABELS[screen] || { title: screen, crumb: 'Admin' };
  const titleEl = document.getElementById('topbar-title');
  const crumbEl = document.getElementById('topbar-crumb');
  if (titleEl) titleEl.textContent = info.title;
  if (crumbEl) crumbEl.textContent = info.crumb;
}

// ── Event bindings ─────────────────────────────────────────
function bindEvents() {
  // Nav items
  document.querySelectorAll('.nav-item[data-screen]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.screen));
  });

  // "Nouveau article" buttons
  document.querySelectorAll('[data-action="new-post"]').forEach(btn => {
    btn.addEventListener('click', () => navigate('editor'));
  });

  // Generate blog buttons
  document.querySelectorAll('[data-action="generate"]').forEach(btn => {
    btn.addEventListener('click', generateBlog);
  });

  // Export buttons
  document.querySelectorAll('[data-action="export"]').forEach(btn => {
    btn.addEventListener('click', exportPosts);
  });

  // Hamburger
  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.addEventListener('click', openMobileSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeMobileSidebar);

  // Editor events
  bindEditorEvents();

  // Change password
  const changePwForm = document.getElementById('change-pw-form');
  if (changePwForm) changePwForm.addEventListener('submit', handleChangePassword);
}

function openMobileSidebar() {
  sidebarEl && sidebarEl.classList.add('open');
  sidebarOverlay && sidebarOverlay.classList.add('visible');
}

function closeMobileSidebar() {
  sidebarEl && sidebarEl.classList.remove('open');
  sidebarOverlay && sidebarOverlay.classList.remove('visible');
}

// ── Dashboard ──────────────────────────────────────────────
async function loadDashboard() {
  try {
    allPosts = await api('GET', '/api/posts');
    const total     = allPosts.length;
    const published = allPosts.filter(p => p.status === 'published').length;
    const drafts    = allPosts.filter(p => p.status !== 'published').length;
    const lastPost  = allPosts.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    const lastDate  = lastPost ? new Date(lastPost.updated_at).toLocaleDateString('fr-BE') : '—';

    setEl('stat-total',    total);
    setEl('stat-published', published);
    setEl('stat-drafts',   drafts);
    setEl('stat-lastpub',  lastDate);

    // Recent posts table
    const recent = [...allPosts]
      .sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);
    const tbody = document.getElementById('recent-posts-body');
    if (tbody) {
      tbody.innerHTML = recent.map(p => `
        <tr>
          <td><strong>${escHtml(p.content.title)}</strong></td>
          <td><span class="badge badge-${p.content.category}">${getCatLabel(p.content.category)}</span></td>
          <td><span class="badge ${p.status === 'published' ? 'badge-published' : 'badge-draft'}">${p.status === 'published' ? 'Publié' : 'Brouillon'}</span></td>
          <td>${new Date(p.updated_at).toLocaleDateString('fr-BE')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="navigate('editor', {id:'${p.id}'})"><i class="fas fa-pen"></i></button>
          </td>
        </tr>
      `).join('');
    }

    // SEO health
    const missingTitle  = allPosts.filter(p => !p.seo.meta_title || p.seo.meta_title.length < 1).length;
    const missingDesc   = allPosts.filter(p => !p.seo.meta_description || p.seo.meta_description.length < 1).length;
    const lowScore      = allPosts.filter(p => computeSEOScore(p) < 50).length;
    setEl('health-missing-title', missingTitle);
    setEl('health-missing-desc',  missingDesc);
    setEl('health-low-score',     lowScore);

    if (missingTitle === 0) document.getElementById('health-missing-title')?.classList.add('good');
    if (missingDesc  === 0) document.getElementById('health-missing-desc')?.classList.add('good');
    if (lowScore     === 0) document.getElementById('health-low-score')?.classList.add('good');

  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Articles screen ────────────────────────────────────────
async function loadArticles() {
  try {
    allPosts = await api('GET', '/api/posts');
    renderArticlesTable(allPosts);
    bindArticleFilters();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

function renderArticlesTable(posts) {
  const tbody = document.getElementById('articles-tbody');
  if (!tbody) return;
  if (posts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:32px">Aucun article trouvé</td></tr>';
    return;
  }
  tbody.innerHTML = posts.map(p => {
    const score     = computeSEOScore(p);
    const scoreClass = score >= 70 ? 'score-green' : score >= 40 ? 'score-amber' : 'score-red';
    return `
      <tr>
        <td><input type="checkbox" class="row-check" value="${p.id}" onchange="updateBulkBar()"></td>
        <td><strong>${escHtml(p.content.title.substring(0,60))}${p.content.title.length > 60 ? '…' : ''}</strong></td>
        <td><span class="badge badge-${p.content.category}">${getCatLabel(p.content.category)}</span></td>
        <td><span class="badge ${p.status === 'published' ? 'badge-published' : 'badge-draft'}">${p.status === 'published' ? 'Publié' : 'Brouillon'}</span></td>
        <td><div class="seo-score-circle ${scoreClass}">${score}</div></td>
        <td>${new Date(p.updated_at).toLocaleDateString('fr-BE')}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-icon btn-sm" title="Modifier" onclick="navigate('editor',{id:'${p.id}'})"><i class="fas fa-pen"></i></button>
            <a href="../blog/${p.slug}.html" target="_blank" class="btn btn-ghost btn-icon btn-sm" title="Aperçu"><i class="fas fa-eye"></i></a>
            <button class="btn btn-ghost btn-icon btn-sm" title="${p.status === 'published' ? 'Dépublier' : 'Publier'}" onclick="togglePublish('${p.id}','${p.status}')">
              <i class="fas ${p.status === 'published' ? 'fa-eye-slash' : 'fa-check-circle'}"></i>
            </button>
            <button class="btn btn-danger btn-icon btn-sm" title="Supprimer" onclick="deletePost('${p.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function bindArticleFilters() {
  const searchInput  = document.getElementById('filter-search');
  const statusSelect = document.getElementById('filter-status');
  const catSelect    = document.getElementById('filter-cat');

  function applyFilters() {
    const q      = (searchInput?.value  || '').toLowerCase();
    const status = statusSelect?.value  || '';
    const cat    = catSelect?.value     || '';
    const filtered = allPosts.filter(p => {
      const matchQ      = !q      || p.content.title.toLowerCase().includes(q) || (p.content.excerpt || '').toLowerCase().includes(q);
      const matchStatus = !status || p.status === status;
      const matchCat    = !cat    || p.content.category === cat;
      return matchQ && matchStatus && matchCat;
    });
    renderArticlesTable(filtered);
  }

  searchInput?.addEventListener('input',  applyFilters);
  statusSelect?.addEventListener('change', applyFilters);
  catSelect?.addEventListener('change',   applyFilters);
}

function updateBulkBar() {
  const checked = document.querySelectorAll('.row-check:checked').length;
  const bulkBar = document.getElementById('bulk-bar');
  if (!bulkBar) return;
  if (checked > 0) {
    bulkBar.classList.add('visible');
    const countEl = document.getElementById('bulk-count');
    if (countEl) countEl.textContent = checked;
  } else {
    bulkBar.classList.remove('visible');
  }
}

async function deletePost(id) {
  if (!confirm('Supprimer cet article définitivement ?')) return;
  try {
    await api('DELETE', '/api/posts/' + id);
    showToast('Article supprimé', 'success');
    loadArticles();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

async function togglePublish(id, currentStatus) {
  try {
    const endpoint = currentStatus === 'published' ? '/api/posts/' + id + '/unpublish' : '/api/posts/' + id + '/publish';
    await api('POST', endpoint);
    showToast(currentStatus === 'published' ? 'Article dépublié' : 'Article publié', 'success');
    loadArticles();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

// ── Editor ─────────────────────────────────────────────────
function bindEditorEvents() {
  // Title → auto slug
  const titleInput = document.getElementById('ed-title');
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      dirtyFlag = true;
      updateCharCounter('ed-title', 'counter-title', 100);
      if (!document.getElementById('slug-edited')?.checked) {
        const slug = generateSlug(titleInput.value);
        document.getElementById('ed-slug').value = slug;
        updateSlugPreview(slug);
        document.getElementById('seo-canonical').value = 'https://bus.brussels/blog/' + slug + '.html';
        document.getElementById('seo-meta-title').value = titleInput.value.substring(0, 60);
        updateSEOPanel();
      }
    });
  }

  const slugInput = document.getElementById('ed-slug');
  if (slugInput) {
    slugInput.addEventListener('input', () => {
      dirtyFlag = true;
      document.getElementById('slug-edited').checked = true;
      updateSlugPreview(slugInput.value);
    });
  }

  const excerptInput = document.getElementById('ed-excerpt');
  if (excerptInput) {
    excerptInput.addEventListener('input', () => {
      dirtyFlag = true;
      updateCharCounter('ed-excerpt', 'counter-excerpt', 200);
      updateSEOPanel();
    });
  }

  // SEO fields
  ['seo-meta-title', 'seo-meta-desc', 'seo-focus-kw', 'seo-canonical',
   'seo-og-title', 'seo-og-desc', 'seo-og-image', 'seo-schema',
   'ed-body'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { dirtyFlag = true; updateSEOPanel(); });
  });

  // Meta title char counter
  const metaTitleInput = document.getElementById('seo-meta-title');
  if (metaTitleInput) {
    metaTitleInput.addEventListener('input', () => {
      updateCharCounter('seo-meta-title', 'counter-meta-title', 60);
      updateProgressBar('pb-meta-title', metaTitleInput.value.length, 60, 30, 60);
    });
  }

  const metaDescInput = document.getElementById('seo-meta-desc');
  if (metaDescInput) {
    metaDescInput.addEventListener('input', () => {
      updateCharCounter('seo-meta-desc', 'counter-meta-desc', 160);
      updateProgressBar('pb-meta-desc', metaDescInput.value.length, 160, 120, 160);
    });
  }

  // Image preview
  const imgUrlInput = document.getElementById('ed-img-url');
  if (imgUrlInput) {
    imgUrlInput.addEventListener('input', () => {
      const preview = document.getElementById('ed-img-preview');
      if (preview) {
        preview.src = imgUrlInput.value;
        preview.style.display = imgUrlInput.value ? 'block' : 'none';
      }
    });
  }

  // Toolbar buttons
  document.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
    btn.addEventListener('click', () => applyFormat(btn.dataset.format));
  });

  // Preview toggle
  const previewBtn = document.getElementById('btn-preview-body');
  const previewPane = document.getElementById('preview-pane');
  if (previewBtn && previewPane) {
    previewBtn.addEventListener('click', () => {
      const body = document.getElementById('ed-body')?.value || '';
      previewPane.innerHTML = body;
      previewPane.style.display = previewPane.style.display === 'block' ? 'none' : 'block';
      previewBtn.textContent = previewPane.style.display === 'block' ? 'Masquer aperçu' : 'Aperçu';
    });
  }

  // Tags input
  const tagsInputEl = document.getElementById('tags-input');
  if (tagsInputEl) {
    tagsInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagsInputEl.value.trim().replace(/,$/, '');
        if (val && !currentTags.includes(val)) {
          currentTags.push(val);
          renderTags();
        }
        tagsInputEl.value = '';
      }
    });
  }

  // SEO tabs
  document.querySelectorAll('.seo-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.seo-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.seo-tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById('seo-tab-' + tab.dataset.tab);
      if (content) content.classList.add('active');
    });
  });

  // Copy meta links
  document.getElementById('copy-meta-og-title')?.addEventListener('click', () => {
    const v = document.getElementById('seo-meta-title')?.value || '';
    document.getElementById('seo-og-title').value = v;
    updateSEOPanel();
  });
  document.getElementById('copy-meta-og-desc')?.addEventListener('click', () => {
    const v = document.getElementById('seo-meta-desc')?.value || '';
    document.getElementById('seo-og-desc').value = v;
    updateSEOPanel();
  });

  // Icon picker
  const iconPickerBtn  = document.getElementById('icon-picker-btn');
  const iconPickerPop  = document.getElementById('icon-picker-popup');
  if (iconPickerBtn && iconPickerPop) {
    iconPickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      iconPickerPop.classList.toggle('open');
    });
    document.addEventListener('click', () => iconPickerPop.classList.remove('open'));
    iconPickerPop.addEventListener('click', (e) => {
      const item = e.target.closest('.icon-picker-item');
      if (item) {
        document.getElementById('ed-icon').value = item.dataset.icon;
        iconPickerPop.classList.remove('open');
      }
    });
  }

  // Save / Publish
  document.getElementById('btn-save-draft')?.addEventListener('click', () => savePost('draft'));
  document.getElementById('btn-publish')?.addEventListener('click',    () => savePost('published'));

  // Auto-save every 30s
  autoSaveTimer = setInterval(() => {
    if (dirtyFlag && currentPost) {
      savePost(currentPost.status, true);
    }
  }, 30000);
}

function newPost() {
  currentPost  = null;
  currentTags  = [];
  dirtyFlag    = false;
  resetEditorForm();
  navigate('editor');
}

async function openEditor(id) {
  try {
    const post    = await api('GET', '/api/posts/' + id);
    currentPost   = post;
    currentTags   = post.content.tags || [];
    dirtyFlag     = false;
    populateEditorForm(post);
    updateSEOPanel();
  } catch (err) {
    showToast('Erreur chargement: ' + err.message, 'error');
  }
}

function resetEditorForm() {
  document.getElementById('ed-title')?.setAttribute('value', '');
  setFormVal('ed-title',       '');
  setFormVal('ed-slug',        '');
  setFormVal('ed-excerpt',     '');
  setFormVal('ed-category',    'guide');
  setFormVal('ed-icon',        'fa-book-open');
  setFormVal('ed-date',        '');
  setFormVal('ed-read-time',   5);
  setFormVal('ed-body',        '<p>Contenu à venir.</p>');
  setFormVal('ed-img-url',     '');
  setFormVal('ed-img-alt',     '');
  setFormVal('seo-meta-title', '');
  setFormVal('seo-meta-desc',  '');
  setFormVal('seo-canonical',  '');
  setFormVal('seo-focus-kw',   '');
  setFormVal('seo-og-title',   '');
  setFormVal('seo-og-desc',    '');
  setFormVal('seo-og-image',   '');
  setFormVal('seo-schema',     '');

  const statusDraft = document.getElementById('status-draft');
  if (statusDraft) statusDraft.checked = true;

  const featuredCb = document.getElementById('ed-featured');
  if (featuredCb) featuredCb.checked = false;

  const slugEdited = document.getElementById('slug-edited');
  if (slugEdited) slugEdited.checked = false;

  updateSlugPreview('');
  renderTags();
  updateSEOPanel();

  const imgPreview = document.getElementById('ed-img-preview');
  if (imgPreview) imgPreview.style.display = 'none';
}

function populateEditorForm(post) {
  setFormVal('ed-title',    post.content.title     || '');
  setFormVal('ed-slug',     post.slug              || '');
  setFormVal('ed-excerpt',  post.content.excerpt   || '');
  setFormVal('ed-category', post.content.category  || 'guide');
  setFormVal('ed-icon',     post.content.icon      || 'fa-book-open');
  setFormVal('ed-date',     post.content.date_display || '');
  setFormVal('ed-read-time',post.content.read_time || 5);
  setFormVal('ed-body',     post.content.body_html || '');
  setFormVal('ed-img-url',  post.content.image_url || '');
  setFormVal('ed-img-alt',  post.content.image_alt || '');
  setFormVal('seo-meta-title', post.seo.meta_title   || '');
  setFormVal('seo-meta-desc',  post.seo.meta_description || '');
  setFormVal('seo-canonical',  post.seo.canonical    || '');
  setFormVal('seo-focus-kw',   post.seo.focus_keyword || '');
  setFormVal('seo-og-title',   post.seo.og_title     || '');
  setFormVal('seo-og-desc',    post.seo.og_description || '');
  setFormVal('seo-og-image',   post.seo.og_image     || '');
  setFormVal('seo-schema',     post.seo.schema_json  || '');

  const statusEl = document.getElementById('status-' + (post.status === 'published' ? 'published' : 'draft'));
  if (statusEl) statusEl.checked = true;

  const featuredCb = document.getElementById('ed-featured');
  if (featuredCb) featuredCb.checked = !!post.featured;

  updateSlugPreview(post.slug || '');

  const imgPreview = document.getElementById('ed-img-preview');
  if (imgPreview && post.content.image_url) {
    imgPreview.src = post.content.image_url;
    imgPreview.style.display = 'block';
  }

  renderTags();
}

function setFormVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'SELECT') el.value = val;
  else el.value = val;
}

function collectFormData(status) {
  const title    = document.getElementById('ed-title')?.value    || '';
  const slug     = document.getElementById('ed-slug')?.value     || generateSlug(title);
  const excerpt  = document.getElementById('ed-excerpt')?.value  || '';
  const category = document.getElementById('ed-category')?.value || 'guide';
  const icon     = document.getElementById('ed-icon')?.value     || 'fa-book-open';
  const date     = document.getElementById('ed-date')?.value     || '';
  const readTime = parseInt(document.getElementById('ed-read-time')?.value || '5', 10);
  const bodyHtml = document.getElementById('ed-body')?.value     || '';
  const imgUrl   = document.getElementById('ed-img-url')?.value  || '';
  const imgAlt   = document.getElementById('ed-img-alt')?.value  || '';
  const featured = document.getElementById('ed-featured')?.checked || false;

  const metaTitle = document.getElementById('seo-meta-title')?.value || '';
  const metaDesc  = document.getElementById('seo-meta-desc')?.value  || '';
  const canonical = document.getElementById('seo-canonical')?.value  || '';
  const focusKw   = document.getElementById('seo-focus-kw')?.value   || '';
  const ogTitle   = document.getElementById('seo-og-title')?.value   || '';
  const ogDesc    = document.getElementById('seo-og-desc')?.value    || '';
  const ogImage   = document.getElementById('seo-og-image')?.value   || '';
  const schema    = document.getElementById('seo-schema')?.value     || '';

  return {
    slug,
    status: status || (document.querySelector('input[name="status"]:checked')?.value || 'draft'),
    featured,
    content: { title, excerpt, body_html: bodyHtml, category, icon, image_url: imgUrl, image_alt: imgAlt, read_time: readTime, date_display: date, tags: currentTags },
    seo: { meta_title: metaTitle, meta_description: metaDesc, canonical, focus_keyword: focusKw, og_title: ogTitle, og_description: ogDesc, og_image: ogImage, schema_json: schema }
  };
}

async function savePost(status, silent) {
  const data = collectFormData(status);
  try {
    let saved;
    if (currentPost && currentPost.id) {
      saved = await api('PUT', '/api/posts/' + currentPost.id, data);
    } else {
      saved = await api('POST', '/api/posts', data);
    }
    currentPost = saved;
    dirtyFlag = false;
    if (!silent) showToast(status === 'published' ? 'Article publié !' : 'Brouillon enregistré', 'success');
    const labelEl = document.getElementById('autosave-label');
    if (labelEl) labelEl.textContent = 'Sauvegardé à ' + new Date().toLocaleTimeString('fr-BE');
  } catch (err) {
    if (!silent) showToast('Erreur: ' + err.message, 'error');
  }
}

// Tags
function renderTags() {
  const wrap = document.getElementById('tags-wrap');
  if (!wrap) return;
  const input = document.getElementById('tags-input');
  const pills = currentTags.map(t => `<span class="tag-pill" onclick="removeTag('${escHtml(t)}')">${escHtml(t)} <span class="remove">×</span></span>`).join('');
  const inputEl = input ? input.outerHTML : '<input id="tags-input" class="tags-input" placeholder="Ajouter un tag…">';
  wrap.innerHTML = pills + inputEl;
  const newInput = document.getElementById('tags-input');
  if (newInput) {
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = newInput.value.trim().replace(/,$/, '');
        if (val && !currentTags.includes(val)) {
          currentTags.push(val);
          renderTags();
        }
        const latestInput = document.getElementById('tags-input');
        if (latestInput) latestInput.value = '';
      }
    });
  }
}

function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderTags();
}

// ── Slug ───────────────────────────────────────────────────
function generateSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function updateSlugPreview(slug) {
  const el = document.getElementById('slug-preview');
  if (el) el.textContent = slug ? 'https://bus.brussels/blog/' + slug + '.html' : '';
}

// ── Char counters ──────────────────────────────────────────
function updateCharCounter(inputId, counterId, max) {
  const input   = document.getElementById(inputId);
  const counter = document.getElementById(counterId);
  if (!input || !counter) return;
  const len = input.value.length;
  counter.textContent = len + '/' + max;
  counter.className = 'char-counter';
  if (len === 0) counter.classList.add('error');
  else if (len > max) counter.classList.add('error');
  else if (len < max * 0.5) counter.classList.add('warn');
  else counter.classList.add('ok');
}

function updateProgressBar(barId, len, maxLen, optMin, optMax) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const pct = Math.min(100, (len / maxLen) * 100);
  bar.style.width = pct + '%';
  bar.className = 'progress-bar-fill';
  if (len === 0) bar.classList.add('red');
  else if (len >= optMin && len <= optMax) bar.classList.add('green');
  else if (len < optMin) bar.classList.add('amber');
  else bar.classList.add('red');
}

// ── Rich text toolbar ──────────────────────────────────────
function applyFormat(format) {
  const ta = document.getElementById('ed-body');
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.substring(start, end) || 'texte';
  let replacement = sel;
  switch (format) {
    case 'bold':    replacement = `<strong>${sel}</strong>`; break;
    case 'italic':  replacement = `<em>${sel}</em>`; break;
    case 'h2':      replacement = `<h2>${sel}</h2>`; break;
    case 'h3':      replacement = `<h3>${sel}</h3>`; break;
    case 'ul':      replacement = `<ul>\n  <li>${sel}</li>\n</ul>`; break;
    case 'ol':      replacement = `<ol>\n  <li>${sel}</li>\n</ol>`; break;
    case 'link': {
      const url = prompt('URL du lien:', 'https://');
      if (!url) return;
      replacement = `<a href="${url}">${sel}</a>`;
      break;
    }
    case 'quote':   replacement = `<blockquote>${sel}</blockquote>`; break;
  }
  ta.value = ta.value.substring(0, start) + replacement + ta.value.substring(end);
  ta.selectionStart = start;
  ta.selectionEnd   = start + replacement.length;
  ta.focus();
  dirtyFlag = true;
  updateSEOPanel();
}

// ── SEO Score ──────────────────────────────────────────────
function computeSEOScore(post) {
  let score = 0;
  const kw   = (post.seo.focus_keyword || '').toLowerCase();
  const t    = (post.content.title || '').toLowerCase();
  const md   = (post.seo.meta_description || '');
  const mt   = (post.seo.meta_title || '');
  const body = stripHtml((post.content.body_html || '')).toLowerCase();
  const slug = (post.slug || '');
  const exc  = (post.content.excerpt || '');

  // 1. focus keyword set
  if (kw.length > 0) score += 5;
  // 2. keyword in meta_title
  if (kw && mt.toLowerCase().includes(kw)) score += 10;
  // 3. keyword in meta_description
  if (kw && md.toLowerCase().includes(kw)) score += 10;
  // 4. keyword in title
  if (kw && t.includes(kw)) score += 10;
  // 5. keyword in body >= 3x
  if (kw) {
    const count = (body.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count >= 3) score += 5;
  }
  // 6. keyword in slug
  if (kw && slug.includes(generateSlug(kw))) score += 5;
  // 7. meta_title length
  const mtLen = mt.length;
  if (mtLen >= 30 && mtLen <= 60)  score += 10;
  else if (mtLen >= 1 && mtLen < 30) score += 3;
  // 8. meta_description length
  const mdLen = md.length;
  if (mdLen >= 120 && mdLen <= 160)  score += 10;
  else if (mdLen >= 50 && mdLen < 120) score += 3;
  // 9. body word count > 300
  const wc = body.split(/\s+/).filter(Boolean).length;
  if (wc > 300) score += 10;
  // 10. og_image set
  if (post.seo.og_image) score += 5;
  // 11. schema_json valid JSON
  if (post.seo.schema_json) {
    try { JSON.parse(post.seo.schema_json); score += 5; } catch {}
  }
  // 12. image_alt set
  if (post.content.image_alt) score += 5;
  // 13. canonical set
  if (post.seo.canonical) score += 5;
  // 14. excerpt 50-200 chars
  if (exc.length >= 50 && exc.length <= 200) score += 5;

  return Math.min(100, score);
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── SEO Panel update ───────────────────────────────────────
function updateSEOPanel() {
  const postData = buildTempPost();
  const score     = computeSEOScore(postData);
  const scoreClass = score >= 70 ? 'score-green' : score >= 40 ? 'score-amber' : 'score-red';

  // Big circle
  const bigCircle = document.getElementById('seo-score-big');
  if (bigCircle) {
    bigCircle.textContent = score;
    bigCircle.className = 'seo-score-big ' + scoreClass;
  }
  const subtitleEl = document.getElementById('seo-score-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = score >= 70 ? 'Bon score SEO' : score >= 40 ? 'Score moyen' : 'Score faible';
  }

  // Progress bars
  const mtLen = (postData.seo.meta_title || '').length;
  const mdLen = (postData.seo.meta_description || '').length;
  updateProgressBar('pb-meta-title', mtLen, 60, 30, 60);
  updateProgressBar('pb-meta-desc',  mdLen, 160, 120, 160);
  document.getElementById('counter-mt-live') && (document.getElementById('counter-mt-live').textContent = mtLen + '/60');
  document.getElementById('counter-md-live') && (document.getElementById('counter-md-live').textContent = mdLen + '/160');

  // Keyword analysis
  const kw   = (postData.seo.focus_keyword || '').toLowerCase();
  const inTitle = kw && (postData.content.title || '').toLowerCase().includes(kw);
  const inDesc  = kw && (postData.seo.meta_description || '').toLowerCase().includes(kw);
  const inBody  = kw && stripHtml(postData.content.body_html || '').toLowerCase().includes(kw);
  renderKwPill('kw-pill-title', 'Titre', inTitle);
  renderKwPill('kw-pill-desc',  'Méta desc', inDesc);
  renderKwPill('kw-pill-body',  'Contenu', inBody);

  // Checklist
  updateChecklist(postData, score);

  // SERP preview
  updateSerpPreview(postData);
}

function renderKwPill(id, label, found) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent  = label;
  el.className    = 'kw-pill' + (found ? ' found' : '');
}

function buildTempPost() {
  const title    = document.getElementById('ed-title')?.value    || '';
  const slug     = document.getElementById('ed-slug')?.value     || '';
  const excerpt  = document.getElementById('ed-excerpt')?.value  || '';
  const category = document.getElementById('ed-category')?.value || 'guide';
  const icon     = document.getElementById('ed-icon')?.value     || 'fa-book-open';
  const bodyHtml = document.getElementById('ed-body')?.value     || '';
  const imgUrl   = document.getElementById('ed-img-url')?.value  || '';
  const imgAlt   = document.getElementById('ed-img-alt')?.value  || '';
  const metaTitle= document.getElementById('seo-meta-title')?.value || '';
  const metaDesc = document.getElementById('seo-meta-desc')?.value  || '';
  const canonical= document.getElementById('seo-canonical')?.value  || '';
  const focusKw  = document.getElementById('seo-focus-kw')?.value   || '';
  const ogImage  = document.getElementById('seo-og-image')?.value   || '';
  const schema   = document.getElementById('seo-schema')?.value     || '';
  return {
    slug,
    content: { title, excerpt, body_html: bodyHtml, category, icon, image_url: imgUrl, image_alt: imgAlt, tags: currentTags },
    seo: { meta_title: metaTitle, meta_description: metaDesc, canonical, focus_keyword: focusKw, og_image: ogImage, schema_json: schema }
  };
}

function updateChecklist(post, score) {
  const kw   = (post.seo.focus_keyword || '').toLowerCase();
  const t    = (post.content.title || '').toLowerCase();
  const md   = (post.seo.meta_description || '');
  const mt   = (post.seo.meta_title || '');
  const body = stripHtml(post.content.body_html || '').toLowerCase();
  const slug = (post.slug || '');
  const exc  = (post.content.excerpt || '');

  const kwCount = kw ? (body.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 0;
  let schemaValid = false;
  if (post.seo.schema_json) { try { JSON.parse(post.seo.schema_json); schemaValid = true; } catch {} }

  const checks = [
    { label: 'Mot-clé focus défini',                  pass: kw.length > 0 },
    { label: 'Mot-clé dans le méta titre',             pass: kw && mt.toLowerCase().includes(kw) },
    { label: 'Mot-clé dans la méta description',       pass: kw && md.toLowerCase().includes(kw) },
    { label: 'Mot-clé dans le titre H1',               pass: kw && t.includes(kw) },
    { label: 'Mot-clé ≥ 3× dans le corps',             pass: kwCount >= 3 },
    { label: 'Mot-clé dans le slug',                   pass: kw && slug.includes(generateSlug(kw)) },
    { label: 'Méta titre 30–60 caractères',            pass: mt.length >= 30 && mt.length <= 60 },
    { label: 'Méta description 120–160 caractères',    pass: md.length >= 120 && md.length <= 160 },
    { label: 'Corps > 300 mots',                       pass: body.split(/\s+/).filter(Boolean).length > 300 },
    { label: 'Image OG définie',                       pass: !!post.seo.og_image },
    { label: 'Schema JSON-LD valide',                  pass: schemaValid },
    { label: 'Texte alternatif image défini',          pass: !!post.content.image_alt },
    { label: 'URL canonique définie',                  pass: !!post.seo.canonical },
    { label: 'Extrait 50–200 caractères',              pass: exc.length >= 50 && exc.length <= 200 }
  ];

  const list = document.getElementById('seo-checklist');
  if (!list) return;
  list.innerHTML = checks.map(c => `
    <div class="checklist-item">
      <span class="check-icon ${c.pass ? 'pass' : 'fail'}">${c.pass ? '✅' : '❌'}</span>
      <span>${c.label}</span>
    </div>
  `).join('');
}

function updateSerpPreview(post) {
  const slug     = post.slug || '';
  const title    = (post.seo.meta_title || post.content.title || '').substring(0, 60);
  const desc     = (post.seo.meta_description || '').substring(0, 160);
  const ogImage  = post.seo.og_image || '';
  const ogTitle  = document.getElementById('seo-og-title')?.value || title;
  const ogDesc   = document.getElementById('seo-og-desc')?.value  || desc;

  const urlEl   = document.getElementById('serp-url');
  const titleEl = document.getElementById('serp-title');
  const descEl  = document.getElementById('serp-desc');
  if (urlEl)   urlEl.textContent   = 'bus.brussels › blog › ' + (slug || '…');
  if (titleEl) titleEl.textContent = title || 'Titre non défini';
  if (descEl)  descEl.textContent  = desc  || 'Description non définie…';

  // OG preview
  const ogImgEl   = document.getElementById('og-preview-img');
  const ogTitleEl = document.getElementById('og-preview-title');
  const ogDescEl  = document.getElementById('og-preview-desc');
  if (ogImgEl) {
    if (ogImage) { ogImgEl.src = ogImage; ogImgEl.style.display = 'block'; }
    else           ogImgEl.style.display = 'none';
  }
  if (ogTitleEl) ogTitleEl.textContent = ogTitle;
  if (ogDescEl)  ogDescEl.textContent  = ogDesc;
}

// ── Generate blog ──────────────────────────────────────────
async function generateBlog() {
  setLoading(true);
  try {
    const res = await api('POST', '/api/generate');
    showToast(res.message || 'blog.html régénéré !', 'success');
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── Export ─────────────────────────────────────────────────
async function exportPosts() {
  try {
    const res  = await fetch(API_BASE + '/api/export', {
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'posts.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export téléchargé', 'success');
  } catch (err) {
    showToast('Erreur export: ' + err.message, 'error');
  }
}

// ── Settings ───────────────────────────────────────────────
async function handleChangePassword(e) {
  e.preventDefault();
  const current = document.getElementById('pw-current')?.value || '';
  const newPw   = document.getElementById('pw-new')?.value     || '';
  const confirm = document.getElementById('pw-confirm')?.value || '';
  if (newPw !== confirm) { showToast('Les mots de passe ne correspondent pas', 'error'); return; }
  try {
    await api('POST', '/api/auth/change-password', { current, newPassword: newPw });
    showToast('Mot de passe modifié', 'success');
    e.target.reset();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

// ── Toasts ─────────────────────────────────────────────────
function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${escHtml(message)}`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Loading overlay ────────────────────────────────────────
function setLoading(active) {
  if (loadingOverlay) {
    loadingOverlay.style.display = active ? 'flex' : 'none';
  }
}

// ── Utils ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CAT_LABELS = {
  actus: 'Actualités', guide: 'Guide', prix: 'Prix & Tarifs',
  scolaire: 'Scolaire', events: 'Événements', entreprise: 'Entreprise', conseils: 'Conseils'
};

function getCatLabel(cat) {
  return CAT_LABELS[cat] || cat;
}
