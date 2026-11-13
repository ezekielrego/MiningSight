import type { Express, Request, Response } from 'express';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const WEB_VIEWER_PROXY_PREFIX = '/api/reconstruction/ai/webviewer/p';
const WEB_VIEWER_INTERNAL_PREFIX = '/api/ai/webviewer/p';

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return true;
}

export async function validatePublicViewerUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Enter a complete model or world URL, including https://.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Only public HTTP or HTTPS viewer URLs are supported.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Local and private network URLs cannot be connected.');
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('The viewer URL must resolve only to a public internet address.');
  }
  parsed.hash = '';
  return parsed;
}

export function toWebViewerProxyPath(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  return `${WEB_VIEWER_PROXY_PREFIX}/${parsed.protocol.slice(0, -1)}/${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function fromProxyPath(pathWithQuery: string): string | null {
  const matchedPrefix = [WEB_VIEWER_PROXY_PREFIX, WEB_VIEWER_INTERNAL_PREFIX]
    .find((prefix) => pathWithQuery.startsWith(`${prefix}/`));
  if (!matchedPrefix) return null;
  const rest = pathWithQuery.slice(matchedPrefix.length + 1);
  const protocolEnd = rest.indexOf('/');
  if (protocolEnd < 1) return null;
  const protocol = rest.slice(0, protocolEnd).toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') return null;
  const afterProtocol = rest.slice(protocolEnd + 1);
  const pathStart = afterProtocol.search(/[/?]/);
  const host = pathStart < 0 ? afterProtocol : afterProtocol.slice(0, pathStart);
  const tail = pathStart < 0 ? '/' : afterProtocol.slice(pathStart);
  if (!host) return null;
  return `${protocol}://${host}${tail.startsWith('?') ? `/${tail}` : tail}`;
}

function proxyOriginPrefix(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  return `${WEB_VIEWER_PROXY_PREFIX}/${parsed.protocol.slice(0, -1)}/${parsed.host}`;
}

function rewriteAssetUrl(rawUrl: string, targetOrigin: string, proxyPrefix: string): string {
  const value = rawUrl.trim();
  if (!value || /^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(value) || value.startsWith(`${WEB_VIEWER_PROXY_PREFIX}/`)) return rawUrl;
  if (value === targetOrigin || value.startsWith(`${targetOrigin}/`)) return `${proxyPrefix}${value.slice(targetOrigin.length) || '/'}`;
  if (value.startsWith('/') && !value.startsWith('//')) return `${proxyPrefix}${value}`;
  return rawUrl;
}

function buildViewerShim(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  const config = JSON.stringify({
    targetOrigin: parsed.origin,
    proxyPrefix: proxyOriginPrefix(targetUrl),
    proxyRoot: WEB_VIEWER_PROXY_PREFIX,
    initialPath: `${parsed.pathname}${parsed.search}`,
  }).replace(/</g, '\\u003c');
  return `<script data-tunnelsight-viewer="1">(function(){
var c=${config},o=c.targetOrigin,p=c.proxyPrefix,r=c.proxyRoot;
function u(v){if(typeof v!=="string")return v;var s=v.trim();if(!s||s.indexOf(r+"/")===0||/^(blob:|data:|javascript:|mailto:|tel:|#)/i.test(s))return v;try{var x=new URL(s,o+location.pathname);if(x.hostname==="cdn.marble.worldlabs.ai"&&x.protocol==="https:")return x.href;if(x.origin===o)return p+x.pathname+x.search+x.hash;if(x.origin===location.origin){if(x.pathname.indexOf(r+"/")===0)return x.pathname+x.search+x.hash;return p+x.pathname+x.search+x.hash;}if(x.protocol==="https:"||x.protocol==="http:")return r+"/"+x.protocol.slice(0,-1)+"/"+x.host+x.pathname+x.search+x.hash;}catch(e){}return v;}
try{history.replaceState(history.state,"",c.initialPath+(location.hash||""));}catch(e){}
if(window.fetch){var f=window.fetch;window.fetch=function(i,n){try{if(typeof i==="string")i=u(i);else if(i instanceof URL)i=u(i.toString());else if(i&&typeof i.url==="string"){var q=u(i.url);if(q!==i.url)i=new Request(q,i);}}catch(e){}return f.call(this,i,n);};}
var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,v){var a=Array.prototype.slice.call(arguments);a[1]=u(String(v));return xo.apply(this,a);};
if(window.Worker){var W=window.Worker;window.Worker=function(v,n){return new W(u(v instanceof URL?v.toString():v),n);};window.Worker.prototype=W.prototype;}
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if((String(n).toLowerCase()==="src"||String(n).toLowerCase()==="href")&&typeof v==="string"&&this.tagName!=="A")v=u(v);return sa.call(this,n,v);};
document.addEventListener("click",function(e){var a=e.target;while(a&&a.tagName!=="A")a=a.parentElement;if(!a)return;var h=a.getAttribute("href");if(!h||/^(#|javascript:|mailto:|tel:)/i.test(h))return;try{var x=new URL(h,o+location.pathname);if(x.protocol==="http:"||x.protocol==="https:"){e.preventDefault();location.assign(r+"/"+x.protocol.slice(0,-1)+"/"+x.host+x.pathname+x.search+x.hash);}}catch(z){}},false);
var stable=0,reported=false;
var readiness=setInterval(function(){
  var waiting=Array.prototype.some.call(document.querySelectorAll('[class*="animate-spin"],[role="progressbar"],[aria-busy="true"]'),function(e){return e.getClientRects().length>0;});
  var hasViewer=!!document.querySelector('canvas,model-viewer');
  var marble=o==='https://marble.worldlabs.ai';
  if(document.readyState==='complete'&&!waiting&&(hasViewer||!marble))stable++;else stable=0;
  if(stable>=2&&!reported){reported=true;clearInterval(readiness);window.parent.postMessage({type:'tunnelsight:viewer-ready'},'https://tunnelsight.applications.co.zw');}
},500);
window.addEventListener('pagehide',function(){clearInterval(readiness);});
})();</script>`;
}

function rewriteHtml(html: string, targetUrl: string): string {
  const parsed = new URL(targetUrl);
  const prefix = proxyOriginPrefix(targetUrl);
  let output = html.replace(/\sintegrity\s*=\s*(["'])[^"']*\1/gi, '');
  output = output.replace(/(<(?:a|area|base|embed|form|frame|iframe|img|input|link|script|source|track|video|audio)\b[^>]*?\s(?:href|src|action|poster|data-src)\s*=\s*)(["'])([^"']*)\2/gi,
    (_match, start: string, quote: string, value: string) => `${start}${quote}${rewriteAssetUrl(value, parsed.origin, prefix)}${quote}`);
  output = output.replace(/(<(?:img|source)\b[^>]*?\ssrcset\s*=\s*)(["'])([^"']*)\2/gi, (_match, start: string, quote: string, value: string) => {
    const rewritten = value.split(',').map((candidate: string) => {
      const parts = candidate.trim().split(/\s+/);
      return [rewriteAssetUrl(parts[0], parsed.origin, prefix), ...parts.slice(1)].join(' ');
    }).join(', ');
    return `${start}${quote}${rewritten}${quote}`;
  });
  const shim = buildViewerShim(targetUrl);
  if (/<head(\s[^>]*)?>/i.test(output)) return output.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${shim}`);
  return `${shim}${output}`;
}

function rewriteCss(css: string, targetUrl: string): string {
  const parsed = new URL(targetUrl);
  const prefix = proxyOriginPrefix(targetUrl);
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, value: string) => {
    const rewritten = rewriteAssetUrl(value, parsed.origin, prefix);
    return rewritten === value ? match : `url(${quote}${rewritten}${quote})`;
  });
}

async function readBody(req: Request): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyViewerRequest(req: Request, res: Response, fallbackTarget?: string): Promise<void> {
  const rawTarget = fallbackTarget || fromProxyPath(req.originalUrl);
  if (!rawTarget) { res.status(400).send('Malformed viewer URL.'); return; }
  try {
    const target = await validatePublicViewerUrl(rawTarget);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value || ['host', 'cookie', 'authorization', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'].includes(key.toLowerCase())) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    headers.set('origin', target.origin);
    headers.set('referer', `${target.origin}/`);
    const body = await readBody(req);
    const upstream = await fetch(target, { method: req.method, headers, body: body ? new Uint8Array(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(45000) });
    if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
      const redirect = new URL(upstream.headers.get('location')!, target);
      await validatePublicViewerUrl(redirect.toString());
      res.redirect(upstream.status, toWebViewerProxyPath(redirect.toString()));
      return;
    }
    res.status(upstream.status);
    const stripped = new Set(['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy', 'strict-transport-security', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);
    upstream.headers.forEach((value, key) => { if (!stripped.has(key.toLowerCase())) res.setHeader(key, value); });
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'HEAD') { res.end(); return; }
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      res.setHeader('Set-Cookie', `__viewer_origin=${encodeURIComponent(target.origin)}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      res.type('html').send(rewriteHtml(await upstream.text(), target.toString()));
    } else if (contentType.includes('text/css')) {
      res.type('css').send(rewriteCss(await upstream.text(), target.toString()));
    } else {
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body as any), res);
      else res.end();
    }
  } catch (error: any) {
    if (res.headersSent) { res.end(); return; }
    res.status(502).type('html').send(`<div style="height:100vh;display:grid;place-items:center;background:#151515;color:#ddd;font:14px sans-serif"><div><strong>Viewer connection failed</strong><p>${String(error.message || 'The remote viewer could not be loaded.').replace(/[<>&]/g, '')}</p></div></div>`);
  }
}

export function mountWebViewerProxy(app: Express): void {
  // A dedicated origin gives provider routers, storage and workers a normal
  // browser context while keeping them separate from the signed-in application.
  app.use((req, res, next) => {
    if (req.hostname !== 'www.tunnelsight.applications.co.zw') { next(); return; }
    if (fromProxyPath(req.originalUrl)) { void proxyViewerRequest(req, res); return; }
    const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('__viewer_origin='));
    let origin = '';
    try {
      const ref = req.headers.referer ? new URL(req.headers.referer) : null;
      const refTarget = ref && fromProxyPath(ref.pathname + ref.search);
      origin = refTarget ? new URL(refTarget).origin : cookie ? decodeURIComponent(cookie.slice('__viewer_origin='.length)) : '';
      if (origin) { void proxyViewerRequest(req, res, new URL(req.originalUrl, origin).toString()); return; }
    } catch { /* Show a useful empty state for missing viewer context. */ }
    res.status(400).send('Choose a connected model in TunnelSight to open this viewer.');
  });
  app.use(WEB_VIEWER_PROXY_PREFIX, (req, res) => { void proxyViewerRequest(req, res); });
  app.use(WEB_VIEWER_INTERNAL_PREFIX, (req, res) => { void proxyViewerRequest(req, res); });
}
