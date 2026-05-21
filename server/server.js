const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 10 * 1024 * 1024 }); // 10MB max
const PORT = 3000;

// ══════════════════════════════════════════
//  PATHS & DIRS
// ══════════════════════════════════════════
const dataDir    = path.join(__dirname, '../data');
const uploadsDir = path.join(__dirname, '../uploads');
const sessionsDir = path.join(__dirname, '../uploads/sessions');
[dataDir, uploadsDir, sessionsDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const sectorSavePath  = path.join(dataDir, 'sectors.json');
const sectorStructurePath = path.join(dataDir, 'sector-structure.json');
const historyPath     = path.join(dataDir, 'history.json');
const sessionsMetaPath = path.join(dataDir, 'sessions.json');
const MAX_HISTORY = 5;

// ── Sessions (library folders) ──
function loadSessions() {
  try { if (fs.existsSync(sessionsMetaPath)) return JSON.parse(fs.readFileSync(sessionsMetaPath, 'utf8')); } catch(e) {}
  return [{ id: 'default', name: 'General', created: Date.now() }];
}
function saveSessions() {
  fs.writeFileSync(sessionsMetaPath, JSON.stringify(librarySessions, null, 2));
}
let librarySessions = loadSessions();

// Ensure each session has a folder
librarySessions.forEach(s => {
  const d = path.join(sessionsDir, s.id);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── History ──
function loadHistory() {
  try { if (fs.existsSync(historyPath)) return JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch(e) {}
  return {};
}
function saveHistory() { try { fs.writeFileSync(historyPath, JSON.stringify(sectorHistory, null, 2)); } catch(e) {} }
function addToHistory(sectorId, s1, s2) {
  if (!sectorHistory[sectorId]) sectorHistory[sectorId] = [];
  const entry = { s1, s2, timestamp: Date.now() };
  sectorHistory[sectorId] = sectorHistory[sectorId].filter(e =>
    !(e.s1?.url === s1?.url && e.s2?.url === s2?.url && e.s1?.type === s1?.type && e.s2?.type === s2?.type)
  );
  sectorHistory[sectorId].unshift(entry);
  sectorHistory[sectorId] = sectorHistory[sectorId].slice(0, MAX_HISTORY);
  saveHistory();
}

// ── Sector data ──
function loadSectorData() {
  try { if (fs.existsSync(sectorSavePath)) return JSON.parse(fs.readFileSync(sectorSavePath, 'utf8')); } catch(e) {}
  return {};
}
function saveSectorData() {
  try {
    const data = {};
    theaterState.sectors.forEach(s => { data[s.id] = { s1: s.screens[0].content, s2: s.screens[1].content }; });
    fs.writeFileSync(sectorSavePath, JSON.stringify(data, null, 2));
  } catch(e) {}
}

const savedSectors  = loadSectorData();
const sectorHistory = loadHistory();

// ── Load saved sector structure (includes add/delete changes) ──
function loadSectorStructure() {
  try {
    if (fs.existsSync(sectorStructurePath)) {
      const saved = JSON.parse(fs.readFileSync(sectorStructurePath, 'utf8'));
      if (Array.isArray(saved) && saved.length > 0) return saved;
    }
  } catch(e) {}
  // Default sectors if no saved structure
  return [
    { id:'A', name:'Sector A', theme:'crimson', screens:[{id:'A1',label:'Screen A-Left',content:null},{id:'A2',label:'Screen A-Right',content:null}] },
    { id:'B', name:'Sector B', theme:'ocean',   screens:[{id:'B1',label:'Screen B-Left',content:null},{id:'B2',label:'Screen B-Right',content:null}] },
    { id:'C', name:'Sector C', theme:'forest',  screens:[{id:'C1',label:'Screen C-Left',content:null},{id:'C2',label:'Screen C-Right',content:null}] },
    { id:'D', name:'Sector D', theme:'amber',   screens:[{id:'D1',label:'Screen D-Left',content:null},{id:'D2',label:'Screen D-Right',content:null}] },
    { id:'E', name:'Sector E', theme:'violet',  screens:[{id:'E1',label:'Screen E-Left',content:null},{id:'E2',label:'Screen E-Right',content:null}] },
    { id:'F', name:'Sector F', theme:'slate',   screens:[{id:'F1',label:'Screen F-Left',content:null},{id:'F2',label:'Screen F-Right',content:null}] },
    { id:'G', name:'Sector G', theme:'rose',    screens:[{id:'G1',label:'Screen G-Left',content:null},{id:'G2',label:'Screen G-Right',content:null}] },
  ];
}

function saveSectorStructure() {
  try {
    fs.writeFileSync(sectorStructurePath, JSON.stringify(theaterState.sectors, null, 2));
  } catch(e) {}
}

// ══════════════════════════════════════════
//  THEATER STATE
// ══════════════════════════════════════════
const theaterState = { sectors: loadSectorStructure() };

// Restore saved content into sectors
theaterState.sectors.forEach(sector => {
  const saved = savedSectors[sector.id];
  if (saved) { sector.screens[0].content = saved.s1||null; sector.screens[1].content = saved.s2||null; }
  // Reset screens array to ensure correct structure
  sector.screens.forEach(sc => { if (!sc.content) sc.content = null; });
});
console.log(`[+] Restored ${theaterState.sectors.length} sectors`);

// ══════════════════════════════════════════
//  AUTH — two accounts: admin + user
// ══════════════════════════════════════════
let ADMIN_USER = '', ADMIN_PASS = '', VIEWER_USER = '', VIEWER_PASS = '';
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
// sessions map: token → { username, role }
const sessions = new Map();

function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token && sessions.has(token)) { req.session = sessions.get(token); return next(); }
  res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token && sessions.has(token) && sessions.get(token).role === 'admin') {
    req.session = sessions.get(token); return next();
  }
  res.status(403).json({ error: 'Admin only' });
}


async function promptCredentials() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║    Theater Control Server — Setup        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const ask = (question) => new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    process.stdout.write(question);
    rl.once('line', answer => { rl.close(); resolve(answer.trim()); });
  });

  console.log(' ─── Admin Account ───');
  ADMIN_USER = await ask(' Admin username: ');
  if (!ADMIN_USER) { console.log('[!] Cannot be empty'); process.exit(1); }
  ADMIN_PASS = await ask(' Admin password: ');
  if (!ADMIN_PASS) { console.log('[!] Cannot be empty'); process.exit(1); }

  console.log('\n ─── Viewer Account ───');
  VIEWER_USER = await ask(' Viewer username: ');
  if (!VIEWER_USER) { console.log('[!] Cannot be empty'); process.exit(1); }
  VIEWER_PASS = await ask(' Viewer password: ');
  if (!VIEWER_PASS) { console.log('[!] Cannot be empty'); process.exit(1); }

  console.log('\n[+] Credentials set. Starting server...\n');
}

// ══════════════════════════════════════════
//  EXPRESS
// ══════════════════════════════════════════
app.use(express.json());

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  let role = null;
  if (username === ADMIN_USER  && password === ADMIN_PASS)  role = 'admin';
  if (username === VIEWER_USER && password === VIEWER_PASS) role = 'viewer';
  if (!role) return setTimeout(() => res.status(401).json({ error: 'Invalid credentials' }), 1000);
  const token = generateToken();
  sessions.set(token, { username, role });
  console.log(`[+] Login: "${username}" (${role})`);
  res.json({ token, role, username });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// Public
app.use('/screen', express.static(path.join(__dirname, '../screen')));
app.get('/screen/:screenId', (req, res) => res.sendFile(path.join(__dirname, '../screen/index.html')));
app.get('/tablet/', (req, res) => res.sendFile(path.join(__dirname, '../tablet/index.html')));
app.get('/tablet/index.html', (req, res) => res.sendFile(path.join(__dirname, '../tablet/index.html')));
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}));

// ── Library Sessions API (admin only for create/delete) ──
app.get('/api/library/sessions', requireAuth, (req, res) => {
  const result = librarySessions.map(s => {
    const dir = path.join(sessionsDir, s.id);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.')).length : 0;
    return { ...s, fileCount: files };
  });
  res.json(result);
});

app.post('/api/library/sessions', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
  const session = { id, name, created: Date.now() };
  librarySessions.push(session);
  saveSessions();
  fs.mkdirSync(path.join(sessionsDir, id), { recursive: true });
  res.json(session);
});

app.delete('/api/library/sessions/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  if (id === 'default') return res.status(400).json({ error: 'Cannot delete default session' });
  const idx = librarySessions.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  librarySessions.splice(idx, 1);
  saveSessions();
  const dir = path.join(sessionsDir, id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  res.json({ ok: true });
});

app.patch('/api/library/sessions/:id', requireAdmin, (req, res) => {
  const session = librarySessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) session.name = req.body.name;
  saveSessions();
  res.json({ ok: true });
});

// ── Library Files API ──
app.get('/api/library/sessions/:sessionId/files', requireAuth, (req, res) => {
  const dir = path.join(sessionsDir, req.params.sessionId);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      const ext = path.extname(f).toLowerCase();
      return {
        name: f,
        url: `/uploads/sessions/${req.params.sessionId}/${f}`,
        size: stat.size,
        type: /mp4|mov|webm|mkv/.test(ext) ? 'video' : 'image',
        modified: stat.mtime,
        sessionId: req.params.sessionId
      };
    }).sort((a,b) => new Date(b.modified) - new Date(a.modified));
  res.json(files);
});

// Upload to session (admin only)
const sessionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(sessionsDir, req.params.sessionId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const sessionUpload = multer({
  storage: sessionStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|webm|mkv/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only images and videos allowed'));
  }
});

app.post('/api/library/sessions/:sessionId/files', requireAuth, (req, res) => {
  // Viewers can only upload to the default (General) session
  if (req.session.role !== 'admin' && req.params.sessionId !== 'default') {
    return res.status(403).json({ error: 'Viewers can only upload to General session' });
  }
  sessionUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/sessions/${req.params.sessionId}/${req.file.filename}`;
    res.json({ url, name: req.file.originalname, size: req.file.size });
  });
});

app.delete('/api/library/sessions/:sessionId/files/:filename', requireAuth, (req, res) => {
  // Viewers can only delete from the default (General) session
  if (req.session.role !== 'admin' && req.params.sessionId !== 'default') {
    return res.status(403).json({ error: 'Viewers can only delete from General session' });
  }
  const file = path.join(sessionsDir, req.params.sessionId, path.basename(req.params.filename));
  if (fs.existsSync(file)) { fs.unlinkSync(file); res.json({ ok: true }); }
  else res.status(404).json({ error: 'Not found' });
});

// ── Legacy uploads (keep backward compat) ──
const legacyStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage: legacyStorage, limits: { fileSize: 4*1024*1024*1024 } });

app.post('/api/upload', requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size });
  });
});

app.get('/api/uploads', requireAuth, (req, res) => {
  const files = fs.readdirSync(uploadsDir)
    .filter(f => fs.statSync(path.join(uploadsDir, f)).isFile())
    .map(f => {
      const stat = fs.statSync(path.join(uploadsDir, f));
      const ext = path.extname(f).toLowerCase();
      return { name: f, url: `/uploads/${f}`, size: stat.size, type: /mp4|mov|webm|mkv/.test(ext)?'video':'image', modified: stat.mtime };
    }).sort((a,b) => new Date(b.modified) - new Date(a.modified));
  res.json(files);
});

app.delete('/api/uploads/:filename', requireAdmin, (req, res) => {
  const file = path.join(uploadsDir, path.basename(req.params.filename));
  if (fs.existsSync(file)) { fs.unlinkSync(file); res.json({ ok: true }); }
  else res.status(404).json({ error: 'Not found' });
});

// ── Sectors API ──
app.get('/api/sectors/saved', requireAuth, (req, res) => {
  const data = {};
  theaterState.sectors.forEach(s => { data[s.id] = { s1: s.screens[0].content, s2: s.screens[1].content }; });
  res.json(data);
});

app.post('/api/sectors', requireAdmin, (req, res) => {
  const { id, name, theme } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  if (theaterState.sectors.find(s => s.id === id)) return res.status(400).json({ error: 'ID exists' });
  const themes = ['crimson','ocean','forest','amber','violet','slate','rose'];
  const newSector = { id, name, theme: themes.includes(theme)?theme:themes[theaterState.sectors.length%themes.length],
    screens: [{id:id+'1',label:'Screen '+id+'-Left',content:null},{id:id+'2',label:'Screen '+id+'-Right',content:null}] };
  theaterState.sectors.push(newSector);
  saveSectorData(); saveSectorStructure(); notifyTablets();
  res.json({ ok: true, sector: newSector });
});

app.delete('/api/sectors/:id', requireAdmin, (req, res) => {
  const idx = theaterState.sectors.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  theaterState.sectors.splice(idx, 1);
  delete sectorHistory[req.params.id];
  saveSectorData(); saveSectorStructure(); saveHistory(); notifyTablets();
  res.json({ ok: true });
});

app.patch('/api/sectors/:id', requireAdmin, (req, res) => {
  const sector = theaterState.sectors.find(s => s.id === req.params.id);
  if (!sector) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) sector.name = req.body.name;
  if (req.body.theme) sector.theme = req.body.theme;
  saveSectorData(); saveSectorStructure(); notifyTablets();
  res.json({ ok: true });
});

app.get('/api/history', requireAuth, (req, res) => res.json(sectorHistory));
app.get('/api/state', requireAuth, (req, res) => res.json({ state: theaterState, connected: getConnectedScreens() }));

// ══════════════════════════════════════════
//  WEBSOCKET
// ══════════════════════════════════════════
const screenClients = new Map();
const tabletClients = new Map();


// ── Auto-shutdown: if no tablet connected for 5 min, shut down server ──
let shutdownTimer = null;
const SHUTDOWN_DELAY = 5 * 60 * 1000; // 5 minutes

function scheduleShutdown() {
  if (shutdownTimer) return; // already scheduled
  console.log(`\n[!] No tablet connected — server will shut down in 5 minutes.`);
  console.log(`    Reconnect the tablet to cancel.\n`);
  shutdownTimer = setTimeout(() => {
    console.log('\n[!] No tablet connected for 5 minutes. Shutting down server.\n');
    process.exit(0);
  }, SHUTDOWN_DELAY);
}

function cancelShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
    console.log('[+] Tablet reconnected — shutdown cancelled');
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const clientType = url.searchParams.get('type');
  const screenId   = url.searchParams.get('screenId');
  const token      = url.searchParams.get('token');

  if (clientType === 'screen' && screenId) {
    screenClients.set(screenId, ws);
    console.log(`[+] Screen: ${screenId}`);
    const sector = theaterState.sectors.find(s => s.screens.some(sc => sc.id === screenId));
    const screen = sector?.screens.find(sc => sc.id === screenId);
    if (screen?.content) ws.send(JSON.stringify({ action:'launch', content:screen.content, theme:sector.theme }));
    notifyTablets();
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        // Screen → Tablet: relay WebRTC answer and trickle candidates
        if (data.action === 'webrtc-answer' || data.action === 'webrtc-candidate') {
          tabletClients.forEach(tabletWs => {
            if (tabletWs.readyState === WebSocket.OPEN)
              tabletWs.send(JSON.stringify({ ...data, fromScreenId: screenId }));
          });
          console.log('[+] Screen→Tablet:', data.action, 'from', screenId);
        }
      } catch(e) {}
    });
    ws.on('close', () => { screenClients.delete(screenId); notifyTablets(); });

  } else if (clientType === 'tablet') {
    if (!token || !sessions.has(token)) { ws.send(JSON.stringify({ action:'unauthorized' })); ws.close(); return; }
    const sessionData = sessions.get(token);
    tabletClients.set(token, ws);
    cancelShutdown();
    ws.send(JSON.stringify({ action:'state', state:theaterState, connected:getConnectedScreens(), history:sectorHistory, role:sessionData.role, username:sessionData.username }));
    ws.on('message', (data, isBinary) => {
      // Binary message = screen share frame
      // Format: first 10 bytes = screenId padded with spaces, rest = JPEG data
      if (isBinary) {
        try {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const screenId = buf.slice(0, 10).toString('utf8').trim();
          const frameData = buf.slice(10);
          const client = screenClients.get(screenId);
          if (client && client.readyState === WebSocket.OPEN) {
            client.send(frameData, { binary: true });
          } else {
          }
        } catch(e) { console.log('[Share] Error:', e.message); }
        return;
      }
      // Text message = JSON control command
      try { handleTabletMessage(ws, JSON.parse(data.toString()), sessionData); }
      catch(e) { console.log('[!] Message error:', e.message); }
    });
    ws.on('close', () => { tabletClients.delete(token); if(tabletClients.size===0) scheduleShutdown(); });
  }

  ws.on('error', err => console.error('WS:', err.message));
});

function handleTabletMessage(ws, msg, sessionData) {
  // Both roles can launch/clear/broadcast
  if (msg.action === 'launch') {
    const { sectorId, screen1Content, screen2Content } = msg;
    const sector = theaterState.sectors.find(s => s.id === sectorId); if (!sector) return;
    const launchTime = Date.now();
    [{idx:0,content:screen1Content},{idx:1,content:screen2Content}].forEach(({idx,content}) => {
      sector.screens[idx].content = content || null;
      const client = screenClients.get(sector.screens[idx].id);
      if (!client || client.readyState !== WebSocket.OPEN) return;
      if (content) {
        // Add startTime for video sync across all screens
        const syncContent = (content.type === 'video') ? {...content, startTime: launchTime} : content;
        sector.screens[idx].content = syncContent; // store with startTime
        client.send(JSON.stringify({ action:'launch', content: syncContent, theme:sector.theme }));
      } else if (content === null) {
        client.send(JSON.stringify({ action:'clear' }));
      }
    });
    addToHistory(sectorId, screen1Content, screen2Content);
    saveSectorData(); notifyTablets();
  }
  if (msg.action === 'clear') {
    const sector = theaterState.sectors.find(s => s.id === msg.sectorId); if (!sector) return;
    sector.screens.forEach(screen => {
      screen.content = null;
      const client = screenClients.get(screen.id);
      if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify({ action:'clear' }));
    });
    saveSectorData(); notifyTablets();
  }
  if (msg.action === 'broadcast') {
    theaterState.sectors.forEach(sector => {
      sector.screens.forEach(screen => {
        screen.content = msg.content;
        const client = screenClients.get(screen.id);
        if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify({ action:'launch', content:msg.content, theme:sector.theme }));
      });
    });
    saveSectorData(); notifyTablets();
  }
  // ── TCP: WebSocket control relay ──
  if (msg.action === 'share-start') {
    const client = screenClients.get(msg.targetScreenId);
    if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify({ action: 'share-start' }));
  }
  if (msg.action === 'clear-screen') {
    // Clear a single specific screen without affecting the other
    const sector = theaterState.sectors.find(s => s.id === msg.sectorId);
    if (sector) {
      const screen = sector.screens.find(sc => sc.id === msg.screenId);
      if (screen) {
        screen.content = null;
        const client = screenClients.get(msg.screenId);
        if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify({ action: 'clear' }));
        saveSectorData(); notifyTablets();
      }
    }
  }
  if (msg.action === 'share-stop') {
    const client = screenClients.get(msg.targetScreenId);
    if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify({ action: 'share-stop' }));
  }

  // ── WebRTC signaling relay ──
  if (msg.action === 'webrtc-offer') {
    const client = screenClients.get(msg.targetScreenId);
    if (client?.readyState === WebSocket.OPEN)
      client.send(JSON.stringify({ action: 'webrtc-offer', offer: msg.offer }));
  }
  if (msg.action === 'webrtc-candidate') {
    const client = screenClients.get(msg.targetScreenId);
    if (client && client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify({ action: 'webrtc-candidate', candidate: msg.candidate }));
  }
}

function getConnectedScreens() {
  const c = {};
  screenClients.forEach((ws,id) => { c[id] = ws.readyState === WebSocket.OPEN; });
  return c;
}

function notifyTablets() {
  const update = JSON.stringify({ action:'state', state:theaterState, connected:getConnectedScreens(), history:sectorHistory });
  tabletClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(update); });
}

// ══════════════════════════════════════════
//  START
// ══════════════════════════════════════════
promptCredentials().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   Theater Control Server — RUNNING       ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    console.log(`\n Tablet  → http://[YOUR-IP]:${PORT}/tablet/`);
    console.log(` Screen  → http://[YOUR-IP]:${PORT}/screen/[ID]`);
    console.log(`\n Admin : ${ADMIN_USER}`);
    console.log(` Viewer: ${VIEWER_USER}\n`);
  });
});
