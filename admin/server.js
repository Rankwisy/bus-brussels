'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Load .env manually (dev only) ─────────────────────────────────────────────
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

const PORT           = parseInt(process.env.PORT           || '3001', 10);
const PASSWORD       = process.env.ADMIN_PASSWORD          || 'admin123';
const SECRET         = process.env.JWT_SECRET              || 'bus-brussels-secret-2025';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN            || '';
const GITHUB_OWNER   = process.env.GITHUB_OWNER            || 'Rankwisy';
const GITHUB_REPO    = process.env.GITHUB_REPO             || 'bus-brussels';
const GITHUB_BRANCH  = process.env.GITHUB_BRANCH           || 'main';

// Local paths (fallback for dev without GitHub token)
const POSTS_FILE    = path.join(__dirname, '..', 'data', 'posts.json');
const BLOG_OUTPUT   = path.join(__dirname, '..', 'blog.html');
const TEMPLATE_FILE = path.join(__dirname, 'templates', 'blog-template.html');

const USE_GITHUB = !!GITHUB_TOKEN;

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

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── GitHub API ────────────────────────────────────────────────────────────────
function githubRequest(method, filePath, body) {
  return new Promise((resolve, reject) => {
    const apiPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'bus-brussels-admin/1.0',
        'Content-Type': 'application/json',
      }
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ghGetFile(filePath) {
  const res = await githubRequest('GET', filePath);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`GitHub GET ${filePath} → ${res.status}`);
  const content = Buffer.from(res.data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return { content, sha: res.data.sha };
}

async function ghPutFile(filePath, content, sha, message) {
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;
  const res = await githubRequest('PUT', filePath, body);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`GitHub PUT ${filePath} → ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

// ── Data access (GitHub or local) ────────────────────────────────────────────
async function readPosts() {
  if (USE_GITHUB) {
    const file = await ghGetFile('data/posts.json');
    if (!file) return { meta: { version: '1.0', last_updated: new Date().toISOString(), _sha: null }, posts: [] };
    const data = JSON.parse(file.content);
    data.meta._sha = file.sha;  // stash sha for update
    return data;
  }
  // Local fallback
  if (!fs.existsSync(POSTS_FILE)) {
    return { meta: { version: '1.0', last_updated: new Date().toISOString() }, posts: [] };
  }
  return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
}

async function writePosts(data, commitMsg) {
  data.meta.last_updated = new Date().toISOString();
  if (USE_GITHUB) {
    const sha = data.meta._sha;
    delete data.meta._sha;
    const content = JSON.stringify(data, null, 2);
    const result = await ghPutFile('data/posts.json', content, sha, commitMsg || 'chore: update posts.json via admin');
    // Update sha for next call
    data.meta._sha = result.content ? result.content.sha : undefined;
    return;
  }
  // Local fallback
  const tmp = POSTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, POSTS_FILE);
}

async function readTemplate() {
  if (USE_GITHUB) {
    const file = await ghGetFile('admin/templates/blog-template.html');
    if (!file) throw new Error('Template not found on GitHub: admin/templates/blog-template.html');
    return { content: file.content, sha: file.sha };
  }
  // Local fallback
  if (!fs.existsSync(TEMPLATE_FILE)) throw new Error('Template file not found locally');
  return { content: fs.readFileSync(TEMPLATE_FILE, 'utf8'), sha: null };
}

async function writeBlogHtml(html, blogSha) {
  if (USE_GITHUB) {
    await ghPutFile('blog.html', html, blogSha, 'feat: regenerate blog.html via admin');
    return;
  }
  // Local fallback
  const tmp = BLOG_OUTPUT + '.tmp';
  fs.writeFileSync(tmp, html, 'utf8');
  fs.renameSync(tmp, BLOG_OUTPUT);
}

// ── HTML render helpers ───────────────────────────────────────────────────────
function renderFeaturedCard(post) {
  const cat    = CATEGORY_MAP[post.content.category] || CATEGORY_MAP.guide;
  const imgUrl = post.content.image_url || '';
  const imgAlt = escHtml(post.content.image_alt || post.content.title);
  const views  = post.views || 0;
  return `<a href="blog/${post.slug}.html" class="featured-post" aria-label="Lire l'article : ${escHtml(post.content.title)}">
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
  return `<li><a href="#"><span><i class="fas ${cat.icon} cat-icon" style="color:${colorMap[catKey]}"></i>${cat.label}</span><span class="cat-count">${count}</span></a></li>`;
}

function renderPopularItem(post) {
  const cat   = CATEGORY_MAP[post.content.category] || CATEGORY_MAP.guide;
  const views = post.views || 0;
  return `<a href="blog/${post.slug}.html" class="popular-item">
  <div class="popular-thumb ${cat.imgClass}"><i class="fas ${cat.icon}"></i></div>
  <div>
    <div class="popular-title">${escHtml(post.content.title)}</div>
    <div class="popular-date"><i class="fas fa-eye"></i> ${views} vues</div>
  </div>
</a>`;
}

// ── generateBlog (async) ──────────────────────────────────────────────────────
async function generateBlog() {
  const data      = await readPosts();
  const published = data.posts
    .filter(p => p.status === 'published')
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  if (published.length === 0) throw new Error('Aucun article publié trouvé');

  const featuredPost  = published.find(p => p.featured) || published[0];
  const remaining     = published.filter(p => p.id !== featuredPost.id);
  const latestGrid    = remaining.slice(0, 4);
  const guidesList    = remaining.slice(4, 9);
  const secondaryGrid = remaining.slice(9);

  // Category counts for sidebar
  const catCounts = {};
  for (const p of published) {
    catCounts[p.content.category] = (catCounts[p.content.category] || 0) + 1;
  }

  // Tags cloud
  const tagSet = new Set();
  for (const p of published) {
    if (Array.isArray(p.content.tags)) p.content.tags.forEach(t => tagSet.add(t));
  }

  // Schema BlogPosting list
  const schemaItems = published.slice(0, 10).map(p => ({
    '@type': 'BlogPosting',
    headline: p.content.title,
    url: `https://bus.brussels/blog/${p.slug}.html`,
    datePublished: p.published_at,
    dateModified: p.updated_at,
    description: p.content.excerpt
  }));

  // Read template + current blog.html sha (for update)
  const [templateFile, currentBlog] = await Promise.all([
    readTemplate(),
    USE_GITHUB ? ghGetFile('blog.html') : null
  ]);

  let html = templateFile.content;

  // Replace all markers
  html = html.replace('<!-- {{FEATURED_POST}} -->',    renderFeaturedCard(featuredPost));
  html = html.replace('<!-- {{LATEST_GRID}} -->',      latestGrid.map(renderArticleCard).join('\n'));
  html = html.replace('<!-- {{GUIDES_LIST}} -->',      guidesList.map(renderListItem).join('\n'));
  html = html.replace('<!-- {{SECONDARY_GRID}} -->',   secondaryGrid.map(renderArticleCard).join('\n'));
  html = html.replace('<!-- {{SIDEBAR_CATEGORIES}} -->', Object.keys(CATEGORY_MAP).filter(k => catCounts[k]).map(k => renderSidebarCategory(k, catCounts[k])).join('\n'));
  html = html.replace('<!-- {{SIDEBAR_POPULAR}} -->',  [...published].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5).map(renderPopularItem).join('\n'));
  html = html.replace('<!-- {{SIDEBAR_TAGS}} -->',     [...tagSet].slice(0,20).map(t=>`<a href="#">${escHtml(t)}</a>`).join('\n'));
  html = html.replace('<!-- {{SCHEMA_BLOG_LIST}} -->', `<script type="application/ld+json">\n${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog bus.brussels',
    description: 'Actualités, guides et conseils sur le transport de bus à Bruxelles',
    url: 'https://bus.brussels/blog.html',
    publisher: { '@type': 'Organization', name: 'bus.brussels', url: 'https://bus.brussels' },
    blogPost: schemaItems
  }, null, 2)}\n</script>`);

  const blogSha = currentBlog ? currentBlog.sha : null;
  await writeBlogHtml(html, blogSha);

  return { posts_published: published.length };
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve admin/ directory as static files
app.use(express.static(__dirname));

// ── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const auth  = req.headers['authorization'] || '';
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mode: USE_GITHUB ? 'github' : 'local',
    repo: USE_GITHUB ? `${GITHUB_OWNER}/${GITHUB_REPO}` : null,
    branch: GITHUB_BRANCH
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD && password !== PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = jwt.sign({ admin: true }, SECRET, { expiresIn: '8h', algorithm: 'HS256' });
  res.json({ token, mode: USE_GITHUB ? 'github' : 'local' });
});

// GET all posts
app.get('/api/posts', authMiddleware, async (req, res) => {
  try {
    const data = await readPosts();
    let posts = data.posts.filter(p => p.status !== 'deleted');
    if (req.query.status) posts = posts.filter(p => p.status === req.query.status);
    if (req.query.category) posts = posts.filter(p => p.content.category === req.query.category);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single post
app.get('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const data = await readPosts();
    const post = data.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new post
app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const body  = req.body || {};
    const data  = await readPosts();
    const now   = new Date().toISOString();
    const id    = generateId();
    const title = (body.content && body.content.title) || 'Sans titre';
    const slug  = body.slug || slugify(title);
    const post  = {
      id, slug,
      status:       body.status    || 'draft',
      featured:     body.featured  || false,
      views:        0,
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
    await writePosts(data, `feat: add article "${title}"`);
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update post
app.put('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const data = await readPosts();
    const idx  = data.posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    const now      = new Date().toISOString();
    const existing = data.posts[idx];
    const updated  = {
      ...existing,
      slug:       body.slug     !== undefined ? body.slug     : existing.slug,
      status:     body.status   !== undefined ? body.status   : existing.status,
      featured:   body.featured !== undefined ? body.featured : existing.featured,
      updated_at: now,
      content: { ...existing.content, ...(body.content || {}) },
      seo:     { ...existing.seo,     ...(body.seo     || {}) }
    };
    if (body.status === 'published' && !existing.published_at) {
      updated.published_at = now;
    }
    data.posts[idx] = updated;
    await writePosts(data, `chore: update article "${existing.content.title}"`);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE post (soft)
app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const data = await readPosts();
    const idx  = data.posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    data.posts.splice(idx, 1);
    await writePosts(data, `chore: delete article`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish
app.post('/api/posts/:id/publish', authMiddleware, async (req, res) => {
  try {
    const data = await readPosts();
    const idx  = data.posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    const now = new Date().toISOString();
    data.posts[idx].status     = 'published';
    data.posts[idx].updated_at = now;
    if (!data.posts[idx].published_at) data.posts[idx].published_at = now;
    await writePosts(data, `feat: publish article "${data.posts[idx].content.title}"`);
    res.json(data.posts[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unpublish
app.post('/api/posts/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    const data = await readPosts();
    const idx  = data.posts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    data.posts[idx].status     = 'draft';
    data.posts[idx].updated_at = new Date().toISOString();
    await writePosts(data, `chore: unpublish article`);
    res.json(data.posts[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate blog.html
app.post('/api/generate', authMiddleware, async (req, res) => {
  try {
    const result = await generateBlog();
    res.json({ ok: true, message: 'blog.html régénéré avec succès', ...result });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export posts.json
app.get('/api/export', authMiddleware, async (req, res) => {
  try {
    const data = await readPosts();
    delete data.meta._sha;
    res.setHeader('Content-Disposition', `attachment; filename="posts-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
// Bind to 0.0.0.0 so Railway/cloud platforms can reach it
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ bus.brussels admin server running on port ${PORT}`);
  console.log(`   Mode: ${USE_GITHUB ? '🐙 GitHub API → ' + GITHUB_OWNER + '/' + GITHUB_REPO : '📁 Local filesystem'}`);
  if (!USE_GITHUB) {
    console.log('   ⚠️  Set GITHUB_TOKEN env var to enable online mode');
  }
});
