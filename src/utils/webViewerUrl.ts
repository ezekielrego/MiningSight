const WEB_VIEWER_PROXY_PREFIX = '/api/reconstruction/ai/webviewer/p';

export function toEmbeddedWebViewerUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `https://www.tunnelsight.applications.co.zw${WEB_VIEWER_PROXY_PREFIX}/${parsed.protocol.slice(0, -1)}/${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}

