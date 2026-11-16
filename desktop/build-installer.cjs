const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const version = require('./package.json').version;
const directory = path.join(__dirname, 'release/win-unpacked');
if (!fs.existsSync(path.join(directory, 'TunnelSight.exe'))) throw new Error('Package the Windows application first.');
const compiler = process.env.MAKENSIS || (process.platform === 'win32' ? 'makensis.exe' : 'makensis');
const prefix = process.platform === 'win32' ? '/' : '-';
execFileSync(compiler, [`${prefix}V3`, `${prefix}DAPP_DIR=${directory}`, `${prefix}DPROJECT_DIR=${__dirname}`, `${prefix}DVERSION=${version}`, path.join(__dirname, 'installer.nsi')], { stdio: 'inherit', windowsHide: true });
