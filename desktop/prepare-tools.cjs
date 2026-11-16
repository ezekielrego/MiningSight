// Download official, hash-pinned Windows runtime tools without installing services.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const packages = [
  { name: 'scrcpy', url: 'https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-win64-v5.0.1.zip', sha256: 'b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5', directory: 'scrcpy-win64-v5.0.1' },
  { name: 'ffmpeg', url: 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip', sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba', directory: 'ffmpeg-9.0.2-essentials_build' }
];
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tunnelsight-runtime-'));
  try {
    const destination = path.join(__dirname, 'resources/tools');
    await fs.mkdir(destination, { recursive: true });
    for (const item of packages) {
      console.log(`Preparing ${item.name} from its official distribution…`);
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`${item.name} download failed (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`${item.name} checksum mismatch. No tool was installed.`);
      const archive = path.join(temp, `${item.name}.zip`);
      await fs.writeFile(archive, bytes);
      if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', archive, temp], { windowsHide: true });
      else execFileSync('unzip', ['-q', archive, '-d', temp]);
      const source = path.join(temp, item.directory);
      if (item.name === 'scrcpy') await fs.cp(source, path.join(destination, 'scrcpy'), { recursive: true });
      else {
        const target = path.join(destination, 'ffmpeg');
        await fs.mkdir(target, { recursive: true });
        await fs.copyFile(path.join(source, 'bin/ffmpeg.exe'), path.join(target, 'ffmpeg.exe'));
        await fs.copyFile(path.join(source, 'LICENSE'), path.join(target, 'LICENSE.txt'));
        await fs.copyFile(path.join(source, 'README.txt'), path.join(target, 'README.txt'));
      }
    }
    await fs.copyFile(path.join(__dirname, 'THIRD-PARTY-NOTICES.txt'), path.join(destination, 'THIRD-PARTY-NOTICES.txt'));
    console.log('Runtime tools ready. No server or service was started.');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
