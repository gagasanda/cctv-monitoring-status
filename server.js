const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Pastikan folder yang dibutuhkan ada
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ floorplan: null, cameras: [] }, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- Upload floor plan (PDF) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, 'floorplan' + ext);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Hanya file PDF yang diperbolehkan'));
    }
    cb(null, true);
  }
});

app.post('/api/floorplan', upload.single('floorplan'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file yang diunggah' });
  const db = readDB();
  db.floorplan = '/uploads/' + req.file.filename;
  writeDB(db);
  res.json({ floorplan: db.floorplan });
});

app.get('/api/floorplan', (req, res) => {
  const db = readDB();
  res.json({ floorplan: db.floorplan });
});

// --- CRUD kamera ---
app.get('/api/cameras', (req, res) => {
  res.json(readDB().cameras);
});

app.post('/api/cameras', (req, res) => {
  const { name, ip, x, y, streamUrl } = req.body;
  if (!name || !ip || x === undefined || y === undefined) {
    return res.status(400).json({ error: 'name, ip, x, dan y wajib diisi' });
  }
  const db = readDB();
  const camera = {
    id: Date.now().toString(),
    name,
    ip,
    x,   // posisi relatif 0-1 terhadap lebar denah
    y,   // posisi relatif 0-1 terhadap tinggi denah
    streamUrl: streamUrl || '',
    status: 'unknown',
    lastChecked: null
  };
  db.cameras.push(camera);
  writeDB(db);
  res.json(camera);
});

app.put('/api/cameras/:id', (req, res) => {
  const db = readDB();
  const cam = db.cameras.find(c => c.id === req.params.id);
  if (!cam) return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  const { name, ip, streamUrl } = req.body;
  if (!name || !ip) {
    return res.status(400).json({ error: 'name dan ip wajib diisi' });
  }
  cam.name = name.trim();
  cam.ip = ip.trim();
  cam.streamUrl = typeof streamUrl === 'string' ? streamUrl.trim() : '';
  writeDB(db);
  res.json(cam);
});

app.delete('/api/cameras/:id', (req, res) => {
  const db = readDB();
  const exists = db.cameras.some(c => c.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  db.cameras = db.cameras.filter(c => c.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// --- Ping status ---
function pingHost(ip) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? `ping -n 1 -w 2000 ${ip}` : `ping -c 1 -W 2 ${ip}`;
    exec(cmd, (error) => resolve(!error));
  });
}

app.get('/api/ping-status', async (req, res) => {
  const db = readDB();
  const results = await Promise.all(
    db.cameras.map(async (cam) => {
      const alive = await pingHost(cam.ip);
      cam.status = alive ? 'online' : 'offline';
      cam.lastChecked = new Date().toISOString();
      return cam;
    })
  );
  writeDB(db);
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`CCTV Monitor berjalan di http://localhost:${PORT}`);
});
