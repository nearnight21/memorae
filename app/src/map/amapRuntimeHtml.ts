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
    .marker { display: block; width: 52px; height: 60px; position: relative; filter: drop-shadow(0 2px 3px rgba(38,41,38,.14)); }
    .marker.selected { filter: drop-shadow(0 3px 5px rgba(181,129,75,.32)); }
    .photo-shell { position: absolute; left: 4px; top: 2px; width: 44px; height: 44px; border: 2px solid #fff; border-radius: 7px; overflow: hidden; background: #dfe4df; box-shadow: 0 2px 6px rgba(31,33,31,.18); }
    .photo { width: 100%; height: 100%; object-fit: cover; }
    .photo.fallback { display: block; background: #b5814b; }
    .memory-count { position: absolute; right: -3px; top: -4px; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border: 2px solid #fff; border-radius: 10px; background: #8f6034; color: #fff; text-align: center; font: 600 11px/16px sans-serif; }
    .anchor { position: absolute; bottom: 2px; left: 23px; width: 6px; height: 6px; border-radius: 50%; background: #b5814b; border: 1px solid rgba(255,255,255,.85); }
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
      let selectedId = null;
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
      const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
      const shortAdministrativeName = (value) => value.replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/u, '');
      const countryFor = (value) => {
        const country = clean(value.country);
        if (country && /^(中国|中华人民共和国|China|CN)$/i.test(country)) return '中国';
        if (country) return country;
        return clean(value.province) || clean(value.city) ? '中国' : '未标注地区';
      };
      const postCameraIdle = () => {
        if (!map) return;
        const center = map.getCenter?.();
        if (!center) return;
        const lat = typeof center.getLat === 'function' ? center.getLat() : center[1];
        const lng = typeof center.getLng === 'function' ? center.getLng() : center[0];
        const zoom = map.getZoom?.();
        const bounds = map.getBounds?.();
        const northEast = bounds?.getNorthEast?.();
        const southWest = bounds?.getSouthWest?.();
        const cameraBounds = northEast && southWest ? {
          north: northEast.getLat(),
          south: southWest.getLat(),
          east: northEast.getLng(),
          west: southWest.getLng(),
        } : undefined;
        if (Number.isFinite(lat) && Number.isFinite(lng)) post({ type: 'cameraIdle', lat, lng, zoom, bounds: cameraBounds });
      };
      const markerHtml = (value, count, ids) => {
        const photo = safeDataUri(value.thumbnailRef)
          ? '<img class="photo" src="' + value.thumbnailRef + '" />'
          : '<span class="photo fallback"></span>';
        const badge = count > 1 ? '<span class="memory-count">' + count + '</span>' : '';
        const selected = ids.includes(selectedId) ? ' selected' : '';
        return '<span class="marker' + selected + '"><span class="photo-shell">' + photo + '</span>' + badge + '<span class="anchor"></span></span>';
      };
      const average = (values, field) => values.reduce((sum, value) => sum + value[field], 0) / values.length;
      const groupDescriptor = (value, zoom) => {
        const country = countryFor(value);
        const province = clean(value.province);
        const city = clean(value.city);
        if (zoom < 6) {
          if (country === '中国' && province) return { key: 'province:' + province, scope: 'province', label: shortAdministrativeName(province) };
          return { key: 'country:' + country, scope: 'country', label: country };
        }
        if (zoom < 9) {
          if (city) return { key: 'city:' + country + ':' + (province || '') + ':' + city, scope: 'city', label: shortAdministrativeName(city) };
          if (province) return { key: 'province:' + province, scope: 'province', label: shortAdministrativeName(province) };
          return { key: 'country:' + country, scope: 'country', label: country };
        }
        return null;
      };
      const groupedMarkers = (values, zoom) => {
        if (zoom >= 9) {
          const byPosition = new Map();
          values.forEach((value) => {
            const key = value.lat.toFixed(7) + ':' + value.lng.toFixed(7);
            const group = byPosition.get(key) || [];
            group.push(value);
            byPosition.set(key, group);
          });
          const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));
          return Array.from(byPosition.values()).flatMap((samePosition) => samePosition.map((value, index) => {
            if (samePosition.length === 1) return { key: value.id, values: [value], value, lat: value.lat, lng: value.lng };
            const angle = (Math.PI * 2 * index / samePosition.length) - Math.PI / 2;
            const radius = 30 * degreesPerPixel;
            const longitudeScale = Math.max(.2, Math.cos(value.lat * Math.PI / 180));
            return {
              key: value.id,
              values: [value],
              value,
              lat: value.lat + Math.sin(angle) * radius,
              lng: value.lng + Math.cos(angle) * radius / longitudeScale,
            };
          }));
        }
        const groups = new Map();
        values.forEach((value) => {
          const descriptor = groupDescriptor(value, zoom);
          const key = descriptor?.key || value.id;
          const group = groups.get(key) || { descriptor, values: [] };
          group.values.push(value);
          groups.set(key, group);
        });
        return Array.from(groups.entries()).map(([key, group]) => {
          const value = group.values.find((item) => safeDataUri(item.thumbnailRef)) || group.values[0];
          return {
            key,
            values: group.values,
            value,
            lat: average(group.values, 'lat'),
            lng: average(group.values, 'lng'),
            scope: group.descriptor?.scope,
            label: group.descriptor?.label,
          };
        });
      };
      const render = () => {
        if (!map || !window.AMap) return;
        markers.forEach((marker) => marker.setMap(null));
        markers.clear();
        const values = window.__MEMORY_MARKERS__ || [];
        const zoom = map.getZoom?.() || 4;
        groupedMarkers(values.filter(safeMarker), zoom).forEach((group) => {
          const ids = group.values.map((value) => value.id);
          const count = ids.length;
          const marker = new AMap.Marker({
            position: [group.lng, group.lat],
            anchor: 'bottom-center',
            extData: { ids, count, scope: group.scope, label: group.label },
            content: markerHtml(group.value, count, ids),
          });
          marker.on('click', () => {
            if (count === 1) {
              post({ type: 'markerPressed', id: ids[0] });
              return;
            }
            const nextZoom = group.scope === 'province' ? 6 : group.scope === 'city' ? 9 : Math.min(14, zoom + 2);
            map.setZoomAndCenter(nextZoom, [group.lng, group.lat], false, 300);
            post({ type: 'clusterPressed', ids, count, scope: group.scope, label: group.label, lat: group.lat, lng: group.lng });
          });
          marker.setMap(map);
          markers.set(group.key, marker);
        });
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
            thumbnailRef: safeDataUri(value.thumbnailRef) ? value.thumbnailRef : undefined,
            country: clean(value.country),
            province: clean(value.province),
            city: clean(value.city),
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
          const zoom = Number.isFinite(message.zoom) ? Math.max(4, Math.min(14, message.zoom)) : map.getZoom();
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
      script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(apiKey);
      const scriptTimeout = window.setTimeout(() => {
        setNotice('高德脚本加载超时，请检查网络或代理。');
        post({ type: 'error', message: '高德脚本加载超时。' });
      }, 12000);
      script.onload = () => {
        window.clearTimeout(scriptTimeout);
        try {
          map = new AMap.Map('map', { center: [104.1954, 35.8617], zoom: 4, zooms: [4, 14], viewMode: '2D', features: ['bg', 'road', 'point'] });
          map.on('click', (event) => { const p = event?.lnglat; if (p) post({ type: 'mapPressed', lat: p.getLat(), lng: p.getLng() }); });
          map.on('moveend', postCameraIdle);
          map.on('zoomend', () => { render(); postCameraIdle(); });
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
