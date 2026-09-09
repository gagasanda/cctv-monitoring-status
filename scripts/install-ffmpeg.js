const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');

function commandExists(command) {
  try {
    if (process.platform === 'win32') {
      execFileSync('where.exe', [command], { stdio: 'ignore' });
    } else {
      execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

if (commandExists('ffmpeg')) {
  console.log('FFmpeg sudah tersedia.');
  process.exit(0);
}

if (process.platform === 'win32') {
  let result;
  if (commandExists('winget')) {
    console.log('FFmpeg belum tersedia. Mencoba instalasi melalui winget...');
    result = spawnSync('winget', [
      'install', '--id', 'Gyan.FFmpeg.Shared', '-e',
      '--accept-source-agreements', '--accept-package-agreements'
    ], { stdio: 'inherit' });
  } else if (commandExists('choco')) {
    console.log('FFmpeg belum tersedia. Mencoba instalasi melalui Chocolatey...');
    result = spawnSync('choco', ['install', 'ffmpeg', '-y'], { stdio: 'inherit' });
  } else {
    console.warn('FFmpeg belum tersedia. Instal winget/Chocolatey atau pasang FFmpeg secara manual.');
    process.exit(0);
  }

  if (result.status !== 0) {
    console.error('FFmpeg gagal dipasang otomatis di Windows.');
    process.exit(1);
  }
  console.log('Perintah instalasi FFmpeg selesai. Buka terminal baru sebelum menjalankan server.');
  process.exit(0);
}

if (process.platform !== 'linux') {
  console.warn('FFmpeg belum tersedia. Instal FFmpeg secara manual untuk mengaktifkan RTSP live view.');
  process.exit(0);
}

if (!fs.existsSync('/etc/os-release')) {
  console.warn('Sistem Linux tidak terdeteksi sebagai distro berbasis APT. Instal FFmpeg secara manual.');
  process.exit(0);
}

const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
if (!/^ID_LIKE=.*debian|^ID=debian|^ID=ubuntu|^ID=linuxmint/m.test(osRelease)) {
  console.warn('Distro Linux ini tidak terdeteksi berbasis Debian/Ubuntu. Instal FFmpeg secara manual.');
  process.exit(0);
}

const command = process.getuid && process.getuid() === 0 ? 'apt-get' : 'sudo';
const args = command === 'apt-get'
  ? ['update']
  : ['apt-get', 'update'];

console.log('FFmpeg belum tersedia. Menjalankan instalasi paket sistem...');
let result = spawnSync(command, args, { stdio: 'inherit' });
if (result.status !== 0) {
  console.error('Gagal menjalankan apt-get update. Jalankan instalasi FFmpeg secara manual.');
  process.exit(1);
}

const installArgs = command === 'apt-get'
  ? ['install', '-y', 'ffmpeg']
  : ['apt-get', 'install', '-y', 'ffmpeg'];
result = spawnSync(command, installArgs, { stdio: 'inherit' });
if (result.status !== 0 || !commandExists('ffmpeg')) {
  console.error('FFmpeg gagal dipasang. Jalankan: sudo apt update && sudo apt install -y ffmpeg');
  process.exit(1);
}

console.log('FFmpeg berhasil dipasang.');
