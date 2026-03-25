'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Load .env manually ────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key   = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const express = require('express');
const jwt     = require('jsonwebtoken');

const PORT     = parseInt(process.env.PORT  || '3001', 10);
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SECRET   = process.env.JWT_SECRET     || 'bus-brussels-secret-2025';

const POSTS_FILE    = path.join(__dirname, '..', 'data', 'posts.json');
const BLOG_OUTPUT   = path.join(__dirname, '..', 'blog.html');
const TEMPLATE_FILE = path.join(__dirname, 'templates', 'blog-template.html');

// ── Category map ──────────────────────────────────────────────────────────────
const CATEGORY_MAP = {
  actus:      { label: 'Actualités',          catClass: 'cat-actus',      imgClass: 'img-actus',      icon: 'fa-bolt',           catIcon: 'fa-bolt' },
  guide:      { label: 'Guide pratique',       catClass: 'cat-guide',      imgClass: 'img-guide',      icon: 'fa-book-open',      catIcon: 'fa-book-open' },
  prix:       { label: 'Prix & Tarifs',        catClass: 'cat-prix',       imgClass: 'img-prix',       icon: 'fa-tag',            catIcon: 'fa-tag' },
  scolaire:   { label: 'Transport scolaire',   catClass: 'cat-scolaire',   imgClass: 'img-scolaire',   icon: 'fa-graduation-cap', catIcon: 'fa-school' },
  events:     { label: 'Événements',           catClass: 'cat-events',     imgClass: 'img-events',     icon: 'fa-calendar-alt',   catIcon: 'fa-calendar-alt' },
  entreprise: { label: 'Transport entreprise', catClass: 'cat-entreprise', imgClass: 'img-entreprise', icon: 'fa-briefcase',      catIcon: 'fa-building' },
  conseils:   { label: 'Conseils',             catClass: 'cat-conseils',   imgClass: 'img-conseils',   icon: 'fa-lightbulb',      catIcon: 'fa-lightbulb' }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readPosts() {
  if (!fs.existsSync(POSTS_FILE)) {
    return { meta: { version: '1.0', last_updated: new Date().toISOString() }, posts: [] };
  }
  return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
}

function writePosts(data) {
  data.meta.last_updated = new Date().toISOString();
  const tmp = POSTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, POSTS_FILE);
}

// ── HTML render helpers ───────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFeaturedCard(post) {
  const cat  = CATEGORY_MAP[post.content.category] || CATEGORY_MAP.guide;
  const slug = post.slug;
  const imgUrl = post.content.image_url || '';
  const imgAlt = escHtml(post.content.image_alt || post.content.title);
  const views  = post.views || 0;
  return `<a href="blog/${slug}.html" class="featured-post" aria-label="Lire l'article : ${escHtml(post.content.title)}">
  <div class="featured-img ${cat.imgClass}">
    <img src="${escHtml(imgUrl)}" alt="${imgAlt}" onerror="this.style.display='none'">
    <div class="featured-img-overlay"></div>
    <span class="featured-badge"><i class="fas fa-star"></i> À la une</span>
  </div>
  <div class="featured-content">
    <span class="post-cat-tag ${cat.catClass}"><i class="fas ${cat.catIcon}"></i> ${cat.label}</span>
    <h2>${escHtml(post.content.title)}</h2>
    <p>${escHtml(post.content.excerpt)}</p>
    <div class="post-meta">
      <span><i class="fas fa-calendar"></i> ${escHtml(post.content.date_display)}</span>
      <span><i class="fas fa-clock"></i> ${post.content.read_time} min</span>
      <span><i class="fas fa-eye"></i> ${views} vues</span>
    </div>
    <a class="read-more-link" tabindex="-1">Lire le guide complet <i class="fas fa-arrow-right"></i></a>
  </div>
</a>`;
}

function renderArticleCard(post) {
  const cat = CATEGORY_MAP[post.content.category] || CATEGORY_MAP.guide;
  return `<a href="blog/${post.slug}.html" class="article-card">
  <div class="article-img ${cat.imgClass}">
    <div class="article-img-icon"><i class="fas ${cat.icon}"></i></div>
    <div class="article-img-overlay"></div>
  </div>
  <div class="article-body">
    <span class="post-cat-tag ${cat.catClass}"><i class="fas ${cat.catIcon}"></i> ${cat.label}</span>
    <h3>${escHtml(post.content.title)}</h3>
    <p>${escHtml(post.content.excerpt)}</p>
    <div class="article-footer">
      <div class="post-meta">
        <span><i class="fas fa-calendar"></i> ${escHtml(post.content.date_display)}</span>
        <span><i class="fas fa-clock"></i> ${post.content.read_time} min</span>
      </div>
      <span class="read-link">Lire <i class="fas fa-arrow-right"></i></span>
    </div>
  </div>
</a>`;
}

function renderListItem(post) {
  const cat = CATEGORY_MAP[post.content.category] || CATEGORY_MAP.guide;
  return `<a href="blog/${post.slug}.html" class="article-list-item">
  <div class="article-list-img ${cat.imgClass}"><i class="fas ${cat.icon}"></i></div>
  <div class="article-list-body">
    <span class="post-cat-tag ${cat.catClass}" style="font-size:0.68rem; padding:3px 10px; margin-bottom:6px"><i class="fas ${cat.catIcon}"></i> ${cat.label}</span>
    <h4>${escHtml(post.content.title)}</h4>
    <div class="post-meta">
      <span><i class="fas fa-calendar"></i> ${escHtml(post.content.date_display)}</span>
      <span><i class="fas fa-clock"></i> ${post.content.read_time} min</span>
    </div>
  </div>
</a>`;
}

function renderSidebarCategory(catKey, count) {
  const cat = CATEGORY_MAP[catKey];
  if (!cat) return '';
  const colorMap = {
    actus: '#b45309', guide: '#1e40af', prix: '#065f46',
    scolaire: '#5b21b6', events: '#9d174d', entreprise: '#0c4a6e', conseils: '#9a3412'
  };
  const color = colorMap[catKey] || '#333';
  return `<li><a href="#"><span><i class="fas ${cat.icon} cat-icon" style="color:${color}"></i>${cat.label}</span><span class="cat-count">${count}</span></a></li>`;
}

function renderPopularItem(post) {
  const cat = CATEGORY_MAP[post.content.category] || CATEGORY_MAP.guide;
  const views = post.views || 0;
  return `<a href="blog/${post.slug}.html" class="popular-item">
  <div class="popular-thumb ${cat.imgClass}"><i class="fas ${cat.icon}"></i></div>
  <div>
    <div class="popular-title">${escHtml(post.content.title)}</div>
    <div class="popular-date"><i class="fas fa-eye"></i> ${views} vues</div>
  </div>
</a>`;
}

// ── generateBlog ──────────────────────────────────────────────────────────────
function generateBlog() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error('Template file not found: ' + TEMPLATE_FILE);
  }
  const data = readPosts();
  const published = data.posts
    .filter(p => p.status === 'published')
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  if (published.length === 0) throw new Error('No published posts found');

  // Sections
  const featuredPost = published.find(p => p.featured) || published[0];
  const remaining    = published.filter(p => p.id !== featuredPost.id);
  const latestGrid   = remaining.slice(0, 4);
  const guidesList   = remaining.slice(4, 9);
  const secondaryGrid = remaining.slice(9);

  // Featured
  const featuredHTML = renderFeaturedCard(featuredPost);

  // Latest grid
  const latestGridHTML = latestGrid.map(renderArticleCard).join('\n');

  // Guides list
  const guidesListHTML = guidesList.map(renderListItem).join('\n');

  // Secondary grid
  const secondaryGridHTML = secondaryGrid.map(renderArticleCard).join('\n');

  // Sidebar categories
  const catCounts = {};
  for (const p of published) {
    const c = p.content.category;
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const sidebarCatsHTML = Object.keys(CATEGORY_MAP)
    .filter(k => catCounts[k])
    .map(k => renderSidebarCategory(k, catCounts[k]))
    .join('\n');

  // Sidebar popular
  const sortedByViews = [...published].sort((a, b) => (b.views || 0) - (a.views || 0));
  const popularHTML = sortedByViews.slice(0, 5).map(renderPopularItem).join('\n');

  // Sidebar tags
  const tagSet = new Set();
  for (const p of published) {
    if (Array.isArray(p.content.tags)) p.content.tags.forEach(t => tagSet.add(t));
  }
  const tagsHTML = [...tagSet].slice(0, 20)
    .map(t => `<a href="#">${escHtml(t)}</a>`)
    .join('\n');

  // Schema BlogPosting list
  const schemaItems = published.slice(0, 10).map(p => ({
    '@type': 'BlogPosting',
    headline: p.content.title,
    url: `https://bus.brussels/blog/${p.slug}.html`,
    datePublished: p.published_at,
    dateModified: p.updated_at,
    description: p.content.excerpt
  }));
  const schemaJSON = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog bus.brussels',
    description: 'Actualités, guides et conseils sur le transport de bus à Bruxelles',
    url: 'https://bus.brussels/blog.html',
    publisher: { '@type': 'Organization', name: 'bus.brussels', url: 'https://bus.brussels' },
    blogPost: schemaItems
  }, null, 2);
  const schemaBlockHTML = `<script type="application/ld+json">\n${schemaJSON}\n</script>`;

  // Read template and replace markers
  let html = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  html = html.replace('<!-- {{FEATURED_POST}} -->', featuredHTML);
  html = html.replace('<!-- {{LATEST_GRID}} -->', latestGridHTML);
  html = html.replace('<!-- {{GUIDES_LIST}} -->', guidesListHTML);
  html = html.replace('<!-- {{SECONDARY_GRID}} -->', secondaryGridHTML);
  html = html.replace('<!-- {{SIDEBAR_CATEGORIES}} -->', sidebarCatsHTML);
  html = html.replace('<!-- {{SIDEBAR_POPULAR}} -->', popularHTML);
  html = html.replace('<!-- {{SIDEBAR_TAGS}} -->', tagsHTML);
  html = html.replace('<!-- {{SCHEMA_BLOG_LIST}} -->', schemaBlockHTML);

  // Atomic write
  const tmp = BLOG_OUTPUT + '.tmp';
  fs.writeFileSync(tmp, html, 'utf8');
  fs.renameSync(tmp, BLOG_OUTPUT);
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Static: serve admin/ directory
app.use(express.static(__dirname));

// ── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = jwt.sign({ admin: true }, SECRET, { expiresIn: '8h', algorithm: 'HS256' });
  res.json({ token });
});

// Change password
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { current, newPassword } = req.body || {};
  if (!current || current !== PASSWORD) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Nouveau mot de passe trop court (min 6 caractères)' });
  }
  // Update .env file
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (envContent.match(/^ADMIN_PASSWORD=.*/m)) {
    envContent = envContent.replace(/^ADMIN_PASSWORD=.*/m, `ADMIN_PASSWORD=${newPassword}`);
  } else {
    envContent += `\nADMIN_PASSWORD=${newPassword}`;
  }
  fs.writeFileSync(envPath, envContent, 'utf8');
  process.env.ADMIN_PASSWORD = newPassword;
  res.json({ ok: true });
});

// GET all posts
app.get('/api/posts', authMiddleware, (req, res) => {
  const data = readPosts();
  res.json(data.posts);
});

// GET single post
app.get('/api/posts/:id', authMiddleware, (req, res) => {
  const data = readPosts();
  const post = data.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

// POST new post
app.post('/api/posts', authMiddleware, (req, res) => {
  const body = req.body || {};
  const data = readPosts();
  const now  = new Date().toISOString();
  const id   = generateId();
  const title = (body.content && body.content.title) || 'Sans titre';
  const slug  = body.slug || slugify(title);
  const post  = {
    id,
    slug,
    status:       body.status       || 'draft',
    featured:     body.featured     || false,
    created_at:   now,
    updated_at:   now,
    published_at: body.status === 'published' ? now : null,
    content: {
      title,
      excerpt:      (body.content && body.content.excerpt)      || '',
      body_html:    (body.content && body.content.body_html)    || '<p>Contenu à venir.</p>',
      category:     (body.content && body.content.category)     || 'guide',
      icon:         (body.content && body.content.icon)         || 'fa-book-open',
      image_url:    (body.content && body.content.image_url)    || '',
      image_alt:    (body.content && body.content.image_alt)    || '',
      read_time:    (body.content && body.content.read_time)    || 5,
      date_display: (body.content && body.content.date_display) || new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }),
      tags:         (body.content && body.content.tags)         || []
    },
    seo: {
      meta_title:       (body.seo && body.seo.meta_title)       || title,
      meta_description: (body.seo && body.seo.meta_description) || '',
      canonical:        (body.seo && body.seo.canonical)        || `https://bus.brussels/blog/${slug}.html`,
      focus_keyword:    (body.seo && body.seo.focus_keyword)    || '',
      og_title:         (body.seo && body.seo.og_title)         || '',
      og_description:   (body.seo && body.seo.og_description)   || '',
      og_image:         (body.seo && body.seo.og_image)         || '',
      schema_json:      (body.seo && body.seo.schema_json)      || ''
    }
  };
  data.posts.push(post);
  writePosts(data);
  res.status(201).json(post);
});

// PUT update post
app.put('/api/posts/:id', authMiddleware, (req, res) => {
  const body = req.body || {};
  const data = readPosts();
  const idx  = data.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  const now      = new Date().toISOString();
  const existing = data.posts[idx];
  const updated  = {
    ...existing,
    slug:       body.slug       !== undefined ? body.slug       : existing.slug,
    status:     body.status     !== undefined ? body.status     : existing.status,
    featured:   body.featured   !== undefined ? body.featured   : existing.featured,
    updated_at: now,
    content: { ...existing.content, ...(body.content || {}) },
    seo:     { ...existing.seo,     ...(body.seo     || {}) }
  };
  if (body.status === 'published' && !existing.published_at) {
    updated.published_at = now;
  }
  data.posts[idx] = updated;
  writePosts(data);
  res.json(updated);
});

// DELETE post
app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  const data = readPosts();
  const idx  = data.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  data.posts.splice(idx, 1);
  writePosts(data);
  res.json({ ok: true });
});

// Publish post
app.post('/api/posts/:id/publish', authMiddleware, (req, res) => {
  const data = readPosts();
  const idx  = data.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  const now = new Date().toISOString();
  data.posts[idx].status       = 'published';
  data.posts[idx].updated_at   = now;
  if (!data.posts[idx].published_at) data.posts[idx].published_at = now;
  writePosts(data);
  res.json(data.posts[idx]);
});

// Unpublish post
app.post('/api/posts/:id/unpublish', authMiddleware, (req, res) => {
  const data = readPosts();
  const idx  = data.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  data.posts[idx].status     = 'draft';
  data.posts[idx].updated_at = new Date().toISOString();
  writePosts(data);
  res.json(data.posts[idx]);
});

// Generate blog.html
app.post('/api/generate', authMiddleware, (req, res) => {
  try {
    generateBlog();
    res.json({ ok: true, message: 'blog.html régénéré avec succès' });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export posts.json
app.get('/api/export', authMiddleware, (req, res) => {
  const data = readPosts();
  res.setHeader('Content-Disposition', 'attachment; filename="posts.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`bus.brussels admin server running at http://127.0.0.1:${PORT}`);
});
