// Package the existing logo on an opaque white canvas; never redraw its artwork.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const directory = path.join(root, 'assets/branding');
const artwork = path.join(root, 'desktop/resources/artwork');
const logo = path.join(root, 'public/favicon.webp');
fs.mkdirSync(directory, { recursive: true });
const embeddedLogo = fs.readFileSync(logo).toString('base64');
fs.writeFileSync(path.join(directory, 'tunnelsight-app-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#fff"/><image x="64" y="64" width="896" height="896" preserveAspectRatio="xMidYMid meet" href="data:image/webp;base64,${embeddedLogo}"/></svg>\n`);
const master = path.join(directory, 'tunnelsight-app-icon.png');
execFileSync('convert', [logo, '-resize', '896x896', '-background', 'white', '-gravity', 'center', '-extent', '1024x1024', '-alpha', 'remove', '-alpha', 'off', master]);
execFileSync('convert', [master, '-resize', '256x256', path.join(artwork, 'icon.png')]);
execFileSync('convert', [path.join(artwork, 'icon.png'), '-define', 'icon:auto-resize=256,128,64,48,32,16', path.join(artwork, 'icon.ico')]);
execFileSync('convert', ['-size', '164x314', 'xc:#171b20', '(', path.join(artwork, 'icon.png'), '-resize', '116x116', ')', '-gravity', 'North', '-geometry', '+0+48', '-composite', '-fill', '#f3f4f5', '-font', 'DejaVu-Sans-Bold', '-pointsize', '17', '-gravity', 'North', '-annotate', '+0+188', 'TunnelSight', '-fill', '#a5adb6', '-font', 'DejaVu-Sans', '-pointsize', '10', '-annotate', '+0+218', 'Desktop workstation', `BMP3:${path.join(artwork, 'sidebar.bmp')}`]);
console.log('White-background shared, desktop, taskbar and installer icons ready.');
