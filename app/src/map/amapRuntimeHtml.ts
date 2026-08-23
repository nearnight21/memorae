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
  <meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' 'unsafe-eval' https://webapi.amap.com https://*.amap.com; style-src 'unsafe-inline' https://*.amap.com; img-src https://*.amap.com https://*.autonavi.com https://*.amapauto.com data: blob:; connect-src https://*.amap.com https://*.autonavi.com https://*.amapauto.com; worker-src blob:; font-src https://*.amap.com data:;">
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: transparent; }
    .notice { position: fixed; top: 12px; left: 12px; right: 12px; z-index: 2; padding: 10px 12px; border: 1px solid rgba(92,78,61,.22); border-radius: 12px; background: rgba(250,248,241,.94); color: #423b32; font: 13px/1.4 sans-serif; }
    .marker { display: block; display: flex; width: 56px; height: 66px; align-items: flex-end; justify-content: center; position: relative; filter: drop-shadow(0 2px 3px rgba(38,41,38,.12)); }
    .marker.selected { filter: drop-shadow(0 3px 5px rgba(181,129,75,.32)); }
    .photo-stack { width: 52px; height: 56px; position: relative; transform-origin: 50% 100%; }
    .photo { position: absolute; width: 28px; height: 28px; border: 2px solid #fff; border-radius: 4px; object-fit: cover; background: #dfe4df; box-shadow: 0 2px 6px rgba(31,33,31,.18); }
    .photo.back-left { left: 5px; top: 14px; transform: rotate(20deg); }
    .photo.back-right { right: 5px; top: 13px; transform: rotate(-20deg); }
    .photo.front { left: 12px; top: 8px; }
    .photo.single { left: 12px; top: 8px; }
    .photo.fallback { border-radius: 50%; width: 15px; height: 15px; left: 18px; top: 24px; border-width: 3px; background: #b5814b; }
    .anchor { position: absolute; bottom: 2px; left: 25px; width: 6px; height: 6px; border-radius: 50%; background: #b5814b; border: 1px solid rgba(255,255,255,.85); }
    .marker.selected .anchor { background: #8f6034; box-shadow: 0 0 0 5px rgba(181,129,75,.22); }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="notice" class="notice">正在加载地图…</div>
  <script>
    (() => {
      if (window.__MEMORY_RUNTIME_STARTED__) return;
      window.__MEMORY_RUNTIME_STARTED__ = true;
      const apiKey = ${key};
      const securityJsCode = ${security};
      window._AMapSecurityConfig = { securityJsCode };
      const markers = new Map();
      let map = null;
      let cluster = null;
      let selectedId = null;
      let hasInitialFit = false;
      let tileTimeout = null;
      const notice = document.getElementById('notice');
      const post = (message) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
      post({ type: 'runtimeStarted' });
      const setNotice = (message, visible = true) => {
        notice.textContent = message;
        notice.style.display = visible ? 'block' : 'none';
      };
      const safeDataUri = (value) => typeof value === 'string' && /^data:image\\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
      const safeMarker = (value) => value && typeof value.id === 'string'
        && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
        && Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180;
      const postCameraIdle = () => {
        if (!map) return;
        const center = map.getCenter?.();
        if (!center) return;
        const lat = typeof center.getLat === 'function' ? center.getLat() : center[1];
        const lng = typeof center.getLng === 'function' ? center.getLng() : center[0];
        const zoom = map.getZoom?.();
        if (Number.isFinite(lat) && Number.isFinite(lng)) post({ type: 'cameraIdle', lat, lng, zoom });
      };
      const markerHtml = (value) => {
        const refs = Array.isArray(value.thumbnailRefs) ? value.thumbnailRefs.filter(safeDataUri).slice(0, 3) : [];
        const photoCount = Number.isFinite(value.photoCount) ? Math.max(0, value.photoCount) : refs.length;
        const photos = refs.length === 0
          ? '<span class="photo fallback"></span>'
          : refs.map((src, index) => '<img class="photo ' + (refs.length === 1 ? 'single' : index === refs.length - 1 ? 'front' : index === 0 ? 'back-left' : 'back-right') + '" src="' + src + '" />').join('');
        const scale = Number.isFinite(value.scale) ? Math.max(.72, Math.min(1.35, value.scale)) : Math.min(1.15, .82 + Math.min(photoCount, 3) * .11);
        return '<span class="marker' + (value.id === selectedId ? ' selected' : '') + '" style="transform:scale(' + scale + ')"><span class="photo-stack">' + photos + '</span><span class="anchor"></span></span>';
      };
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
            extData: { id: value.id },
            content: markerHtml(value),
          });
          marker.on('click', () => post({ type: 'markerPressed', id: value.id }));
          markers.set(value.id, marker);
        });
        const list = Array.from(markers.values());
        if (AMap.MarkerCluster && list.length > 40) {
          cluster = new AMap.MarkerCluster(map, list, { gridSize: 80, maxZoom: 16 });
          if (cluster.on) {
            cluster.on('click', (event) => {
              const point = event?.lnglat || event?.target?.getPosition?.();
              const clusterData = Array.isArray(event?.clusterData) ? event.clusterData : [];
              const first = clusterData[0];
              if (!point) return;
              const lat = typeof point.getLat === 'function' ? point.getLat() : point[1];
              const lng = typeof point.getLng === 'function' ? point.getLng() : point[0];
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
              map.setZoomAndCenter(Math.min(17, map.getZoom() + 3), [lng, lat], false, 300);
              post({ type: 'clusterPressed', id: first?.getExtData?.()?.id, lat, lng });
            });
          }
        } else {
          list.forEach((marker) => marker.setMap(map));
        }
        if (!hasInitialFit && list.length > 0 && map.setFitView) {
          map.setFitView(list, false, [80, 80, 180, 80]);
          hasInitialFit = true;
        }
      };
      const handleMessage = (event) => {
        let message;
        try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        if (!message || typeof message !== 'object') return;
        if (message.type === 'setMarkers' && Array.isArray(message.markers)) {
          window.__MEMORY_MARKERS__ = message.markers.filter(safeMarker).map((value) => ({
            id: value.id,
            lat: value.lat,
            lng: value.lng,
            photoCount: Number.isFinite(value.photoCount) ? Math.max(0, value.photoCount) : 0,
            thumbnailRefs: Array.isArray(value.thumbnailRefs) ? value.thumbnailRefs.filter(safeDataUri).slice(0, 3) : [],
            scale: Number.isFinite(value.scale) ? value.scale : undefined,
          }));
          render();
          post({ type: 'markersApplied', count: window.__MEMORY_MARKERS__.length });
        } else if (message.type === 'setSelected' && (message.id === null || typeof message.id === 'string')) {
          selectedId = message.id;
          render();
        } else if (
          message.type === 'setCamera'
          && Number.isFinite(message.lat) && message.lat >= -90 && message.lat <= 90
          && Number.isFinite(message.lng) && message.lng >= -180 && message.lng <= 180
        ) {
          const zoom = Number.isFinite(message.zoom) ? Math.max(2, Math.min(19, message.zoom)) : map.getZoom();
          const center = map.getCenter?.();
          const currentLat = center && (typeof center.getLat === 'function' ? center.getLat() : center[1]);
          const currentLng = center && (typeof center.getLng === 'function' ? center.getLng() : center[0]);
          const currentZoom = map.getZoom?.();
          if (
            Number.isFinite(currentLat) && Number.isFinite(currentLng)
            && Math.abs(currentLat - message.lat) < 0.000001
            && Math.abs(currentLng - message.lng) < 0.000001
            && Number.isFinite(currentZoom) && Math.abs(currentZoom - zoom) < 0.001
          ) return;
          map.setZoomAndCenter(zoom, [message.lng, message.lat], false, 300);
        } else if (message.type === 'clearSensitiveData') {
          window.__MEMORY_MARKERS__ = [];
          selectedId = null;
          hasInitialFit = false;
          render();
        }
      };
      // Android dispatches WebView postMessage events on document; iOS uses window.
      window.addEventListener('message', handleMessage);
      document.addEventListener('message', handleMessage);
      if (!apiKey || !securityJsCode) {
        setNotice('缺少高德 JS API 配置。');
        post({ type: 'error', message: '缺少高德 JS API Key 或 securityJsCode。' });
        return;
      }
      window.addEventListener('error', (event) => {
        const message = event?.message;
        if (message) post({ type: 'error', message: '地图脚本错误：' + message });
      });
      const script = document.createElement('script');
      script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(apiKey) + '&plugin=AMap.MarkerCluster';
      const scriptTimeout = window.setTimeout(() => {
        setNotice('高德脚本加载超时，请检查网络或代理。');
        post({ type: 'error', message: '高德脚本加载超时。' });
      }, 12000);
      script.onload = () => {
        window.clearTimeout(scriptTimeout);
        try {
          map = new AMap.Map('map', { center: [116.397428, 39.90923], zoom: 5, viewMode: '2D', features: ['bg', 'road', 'point'] });
          map.on('click', (event) => { const p = event?.lnglat; if (p) post({ type: 'mapPressed', lat: p.getLat(), lng: p.getLng() }); });
          map.on('moveend', postCameraIdle);
          map.on('complete', () => {
            if (tileTimeout) window.clearTimeout(tileTimeout);
            setNotice('', false);
          });
          tileTimeout = window.setTimeout(() => {
            setNotice('底图瓦片加载超时，请检查高德 Key、安全密钥和网络。');
            post({ type: 'error', message: '底图瓦片加载超时，请检查高德 Key、安全密钥和网络。' });
          }, 12000);
          setNotice('', false);
          render();
          post({ type: 'ready' });
          postCameraIdle();
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
