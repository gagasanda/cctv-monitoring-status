const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const STREAM_DIR = path.join(__dirname, 'streams');
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const hlsProcesses = new Map();

// Pastikan folder yang dibutuhkan ada
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(STREAM_DIR)) fs.mkdirSync(STREAM_DIR, { recursive: true });
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
app.use('/streams', express.static(STREAM_DIR));

function isRtspUrl(url) {
  return typeof url === 'string' && /^rtsps?:\/\//i.test(url);
}

function startHlsStream(camera) {
  const existing = hlsProcesses.get(camera.id);
  if (existing) return existing;

  const outputDir = path.join(STREAM_DIR, camera.id);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'index.m3u8');
  const ffmpeg = spawn(FFMPEG_PATH, [
    '-hide_banner', '-loglevel', 'warning',
    '-fflags', 'nobuffer', '-flags', 'low_delay',
    '-probesize', '32k', '-analyzeduration', '0',
    '-rtsp_transport', 'tcp',
    '-i', camera.streamUrl,
    '-an', '-c:v', 'copy',
    '-f', 'hls', '-hls_time', '0.5', '-hls_list_size', '3',
    '-hls_flags', 'delete_segments+append_list+omit_endlist',
    '-hls_segment_filename', path.join(outputDir, 'segment-%03d.ts'),
    outputFile
  ]);

  const stream = { process: ffmpeg, outputDir };
  hlsProcesses.set(camera.id, stream);
  ffmpeg.on('error', (error) => {
    console.error(`FFmpeg gagal untuk kamera ${camera.id}: ${error.message}`);
    hlsProcesses.delete(camera.id);
  });
  ffmpeg.on('exit', () => hlsProcesses.delete(camera.id));
  return stream;
}

function waitForFile(filePath, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

function stopHlsStream(cameraId) {
  const stream = hlsProcesses.get(cameraId);
  if (!stream) return;
  stream.process.kill('SIGTERM');
  hlsProcesses.delete(cameraId);
}

app.get('/api/cameras/:id/hls', async (req, res) => {
  const camera = readDB().cameras.find(c => c.id === req.params.id);
  if (!camera) return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  if (!isRtspUrl(camera.streamUrl)) {
    return res.status(400).json({ error: 'URL kamera bukan URL RTSP' });
  }
  const stream = startHlsStream(camera);
  const ready = await waitForFile(path.join(stream.outputDir, 'index.m3u8'));
  if (!ready) {
    stopHlsStream(camera.id);
    return res.status(503).json({ error: 'Stream kamera belum siap atau FFmpeg gagal membacanya' });
  }
  res.json({ url: `/streams/${camera.id}/index.m3u8` });
});

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
  const nextStreamUrl = typeof streamUrl === 'string' ? streamUrl.trim() : '';
  if (cam.streamUrl !== nextStreamUrl) stopHlsStream(cam.id);
  cam.name = name.trim();
  cam.ip = ip.trim();
  cam.streamUrl = nextStreamUrl;
  writeDB(db);
  res.json(cam);
});

app.delete('/api/cameras/:id', (req, res) => {
  const db = readDB();
  const exists = db.cameras.some(c => c.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  stopHlsStream(req.params.id);
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

process.on('SIGINT', () => {
  for (const cameraId of hlsProcesses.keys()) stopHlsStream(cameraId);
  process.exit(0);
});
