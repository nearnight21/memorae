function jsString(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function buildAmapRuntimeHtml(apiKey: string, securityJsCode: string): string {
  const key = jsString(apiKey.trim());
  const security = jsString(securityJsCode.trim());
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://webapi.amap.com https://*.amap.com; style-src 'unsafe-inline'; img-src https://*.amap.com https://*.autonavi.com data:; connect-src https://*.amap.com https://*.autonavi.com;">
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #e7e3d9; }
    .notice { position: fixed; top: 12px; left: 12px; right: 12px; z-index: 2; padding: 10px 12px; border: 1px solid rgba(92,78,61,.22); border-radius: 12px; background: rgba(250,248,241,.94); color: #423b32; font: 13px/1.4 sans-serif; }
    .marker { width: 18px; height: 18px; border-radius: 50%; background: #536f5b; border: 3px solid #f8f4e9; box-shadow: 0 2px 8px rgba(25,35,28,.3); }
    .marker.selected { background: #ad5f42; transform: scale(1.25); }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="notice" class="notice">正在加载地图…</div>
  <script>
    (() => {
      const apiKey = ${key};
      const securityJsCode = ${security};
      window._AMapSecurityConfig = { securityJsCode };
      const markers = new Map();
      let map = null;
      let cluster = null;
      let selectedId = null;
      const notice = document.getElementById('notice');
      const post = (message) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
      const setNotice = (message, visible = true) => {
        notice.textContent = message;
        notice.style.display = visible ? 'block' : 'none';
      };
      const safeMarker = (value) => value && typeof value.id === 'string'
        && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
        && Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180;
      const render = () => {
        if (!map || !window.AMap) return;
        if (cluster?.setMap) cluster.setMap(null);
        markers.forEach((marker) => marker.setMap(null));
        markers.clear();
        const values = window.__MEMORY_MARKERS__ || [];
        values.filter(safeMarker).forEach((value) => {
          const marker = new AMap.Marker({
            position: [value.lng, value.lat],
            anchor: 'center',
            content: '<span class="marker' + (value.id === selectedId ? ' selected' : '') + '"></span>',
          });
          marker.on('click', () => post({ type: 'markerPressed', id: value.id }));
          markers.set(value.id, marker);
        });
        const list = Array.from(markers.values());
        if (AMap.MarkerCluster && list.length > 40) {
          cluster = new AMap.MarkerCluster(map, list, { gridSize: 80, maxZoom: 16 });
        } else {
          list.forEach((marker) => marker.setMap(map));
        }
      };
      window.addEventListener('message', (event) => {
        let message;
        try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        if (!message || typeof message !== 'object') return;
        if (message.type === 'setMarkers' && Array.isArray(message.markers)) {
          window.__MEMORY_MARKERS__ = message.markers.filter(safeMarker).map(({ id, lat, lng }) => ({ id, lat, lng }));
          render();
        } else if (message.type === 'setSelected' && (message.id === null || typeof message.id === 'string')) {
          selectedId = message.id;
          render();
        } else if (message.type === 'clearSensitiveData') {
          window.__MEMORY_MARKERS__ = [];
          selectedId = null;
          render();
        }
      });
      if (!apiKey || !securityJsCode) {
        setNotice('缺少高德 JS API 配置。');
        post({ type: 'error', message: '缺少高德 JS API Key 或 securityJsCode。' });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(apiKey) + '&plugin=AMap.MarkerCluster';
      script.onload = () => {
        try {
          map = new AMap.Map('map', { center: [116.397428, 39.90923], zoom: 5, viewMode: '2D', mapStyle: 'amap://styles/whitesmoke', features: ['bg', 'road', 'point'] });
          map.on('click', (event) => { const p = event?.lnglat; if (p) post({ type: 'mapPressed', lat: p.getLat(), lng: p.getLng() }); });
          map.on('moveend', () => post({ type: 'cameraIdle' }));
          setNotice('', false);
          render();
          post({ type: 'ready' });
        } catch (error) {
          setNotice('高德地图无法启动。');
          post({ type: 'error', message: error instanceof Error ? error.message : '高德地图无法启动。' });
        }
      };
      script.onerror = () => { setNotice('高德地图加载失败。'); post({ type: 'error', message: '高德地图脚本加载失败。' }); };
      document.head.appendChild(script);
    })();
  </script>
</body>
</html>`;
}

export function createAmapRuntimeConfig(): { apiKey: string; securityJsCode: string } {
  return {
    apiKey: process.env.EXPO_PUBLIC_AMAP_WEB_KEY?.trim() ?? '',
    securityJsCode: process.env.EXPO_PUBLIC_AMAP_WEB_SECURITY_CODE?.trim() ?? '',
  };
}

export const AMAP_RUNTIME_LOCAL_ORIGIN = 'https://memorae.cn/';
