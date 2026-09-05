function jsString(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export const AMAP_JS_MAP_STYLE = 'amap://styles/86c653c12a194bd61f7e37008e400725';

export function buildAmapRuntimeHtml(apiKey: string, securityJsCode: string): string {
  const key = jsString(apiKey.trim());
  const security = jsString(securityJsCode.trim());
  const mapStyle = jsString(AMAP_JS_MAP_STYLE);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' 'unsafe-eval' https://webapi.amap.com https://*.amap.com; style-src 'unsafe-inline' https://*.amap.com; img-src https://*.amap.com https://*.autonavi.com https://*.amapauto.com data: blob:; connect-src https://*.amap.com https://*.autonavi.com https://*.amapauto.com; worker-src blob:; font-src https://*.amap.com data:;">
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: transparent; }
    .notice { position: fixed; top: 12px; left: 12px; right: 12px; z-index: 2; padding: 10px 12px; border: 1px solid rgba(92,78,61,.22); border-radius: 12px; background: rgba(250,248,241,.94); color: #423b32; font: 13px/1.4 sans-serif; }
    .marker { display: block; width: 58.5px; height: 58.5px; position: relative; overflow: visible; cursor: pointer; transform-origin: center; }
    .marker.enter-pending { opacity: 0; }
    .marker.entering { animation: map-bubble-enter 360ms cubic-bezier(0.2, 0.9, 0.25, 1.08) both; }
    .photo-shell { position: absolute; left: 4.6px; top: 0; width: 49.3px; height: 49.3px; overflow: visible; }
    .photo { display: block; width: 49.3px; height: 49.3px; box-sizing: border-box; border: 2.3px solid #f8f3e8; border-radius: 50%; outline: .8px solid rgba(139,111,57,.72); object-fit: cover; background: #dfe4df; box-shadow: 0 5.4px 13.1px rgba(61,54,44,.28); transition: transform 180ms ease, outline 180ms ease; }
    .photo.fallback { background: #b5814b; }
    .memory-count { position: absolute; right: .8px; top: -3.9px; z-index: 2; min-width: 15.4px; height: 15.4px; padding: 0 3.9px; box-sizing: border-box; border: 1.5px solid #f8f3e8; border-radius: 999px; background: #8f6034; color: #fff; text-align: center; font: 600 8.5px/12.3px sans-serif; }
    .marker-label { position: absolute; top: 52.4px; left: 50%; transform: translateX(-50%); max-width: 86.2px; padding: 1.5px 5.4px; box-sizing: border-box; border: .8px solid rgba(139,111,57,.38); border-radius: 999px; background: rgba(248,243,232,.94); color: #51483d; box-shadow: 0 2.3px 6.2px rgba(61,54,44,.16); font: 500 8.5px/1.25 'Songti SC', STSong, serif; letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .anchor { position: absolute; bottom: 2.3px; left: 27px; width: 4.6px; height: 4.6px; box-sizing: border-box; border: .8px solid rgba(255,255,255,.85); border-radius: 50%; background: #b5814b; }
    .marker.selected .photo { transform: scale(1.2); outline: 3.1px solid rgba(181,129,75,.42); }
    .marker.selected .marker-label { border-color: rgba(181,129,75,.72); }
    .marker.selected .anchor { background: #8f6034; box-shadow: 0 0 0 3.9px rgba(181,129,75,.22); }
    @keyframes map-bubble-enter {
      from { opacity: 0; transform: translateY(9px) scale(0.72); }
      72% { opacity: 1; transform: translateY(-2px) scale(1.07); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .marker.entering { animation: none; }
    }
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
      const CAMERA_FOCUS_OFFSET_X = 200;
      const markers = new Map();
      let renderedGroupSignatures = new Map();
      let renderedScreenSignature = null;
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
      const textFingerprint = (value) => {
        if (typeof value !== 'string' || !value) return '';
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
          hash ^= value.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return value.length + ':' + (hash >>> 0).toString(36);
      };
      const groupSignature = (group) => JSON.stringify({
        scope: group.scope,
        label: group.label,
        lat: group.lat,
        lng: group.lng,
        values: group.values.map((value) => ({
          id: value.id,
          lat: value.lat,
          lng: value.lng,
          thumbnail: textFingerprint(value.thumbnailRef),
          country: clean(value.country),
          province: clean(value.province),
          city: clean(value.city),
        })).sort((left, right) => left.id.localeCompare(right.id)),
      });
      const updateSelectedMarkers = () => {
        markers.forEach(({ element, ids }) => {
          element.classList.toggle('selected', ids.includes(selectedId));
        });
      };
      const cameraCenter = () => map?.getCenter?.() || null;
      const setCamera = (zoom, lng, lat) => {
        if (!map) return;
        map.setZoomAndCenter(zoom, [lng, lat], true);
      };
      const postCameraIdle = () => {
        if (!map) return;
        const center = cameraCenter();
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
      const fallbackPhoto = () => {
        const fallback = document.createElement('span');
        fallback.className = 'photo fallback';
        return fallback;
      };
      const markerContent = (group, ids, shouldEnter) => {
        const element = document.createElement('span');
        element.className = 'marker' + (ids.includes(selectedId) ? ' selected' : '');
        let entered = false;
        const enter = () => {
          if (!shouldEnter || entered) return;
          entered = true;
          element.classList.remove('enter-pending');
          element.classList.add('entering');
        };
        if (shouldEnter) element.classList.add('enter-pending');

        const photoShell = document.createElement('span');
        photoShell.className = 'photo-shell';
        if (safeDataUri(group.value.thumbnailRef)) {
          const image = document.createElement('img');
          image.className = 'photo';
          image.alt = '';
          image.decoding = 'async';
          image.addEventListener('load', enter, { once: true });
          image.addEventListener('error', () => {
            image.replaceWith(fallbackPhoto());
            enter();
          }, { once: true });
          image.src = group.value.thumbnailRef;
          photoShell.appendChild(image);
        } else {
          photoShell.appendChild(fallbackPhoto());
          enter();
        }
        element.appendChild(photoShell);

        if (ids.length > 1) {
          const badge = document.createElement('span');
          badge.className = 'memory-count';
          badge.textContent = String(ids.length);
          element.appendChild(badge);
        }
        const label = clean(group.label);
        if (label) {
          const labelElement = document.createElement('span');
          labelElement.className = 'marker-label';
          labelElement.textContent = label;
          element.appendChild(labelElement);
        }
        const anchor = document.createElement('span');
        anchor.className = 'anchor';
        element.appendChild(anchor);
        return element;
      };
      const average = (values, field) => values.reduce((sum, value) => sum + value[field], 0) / values.length;
      const centeredGroup = (values) => {
        const centerLat = average(values, 'lat');
        const centerLng = average(values, 'lng');
        const longitudeScale = Math.max(.2, Math.cos(centerLat * Math.PI / 180));
        const distanceFromCenter = (value) => Math.pow(value.lat - centerLat, 2)
          + Math.pow((value.lng - centerLng) * longitudeScale, 2);
        const value = values.reduce((nearest, candidate) => {
          const distanceDifference = distanceFromCenter(candidate) - distanceFromCenter(nearest);
          if (Math.abs(distanceDifference) > Number.EPSILON) {
            return distanceDifference < 0 ? candidate : nearest;
          }
          return candidate.id.localeCompare(nearest.id) < 0 ? candidate : nearest;
        });
        return { value, lat: value.lat, lng: value.lng, centerLat, centerLng };
      };
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
          return {
            key,
            values: group.values,
            ...centeredGroup(group.values),
            scope: group.descriptor?.scope,
            label: group.descriptor?.label,
          };
        });
      };
      const PROVINCE_COLLISION_DISTANCE = 60;
      const mergeNearbyProvinceGroups = (groups, map, zoom) => {
        if (zoom >= 6) return groups;
        const provinceGroups = groups.filter((group) => group.scope === 'province');
        if (provinceGroups.length < 2 || typeof map.lngLatToContainer !== 'function') return groups;
        const otherGroups = groups.filter((group) => group.scope !== 'province');
        const working = provinceGroups.map((group) => ({ ...group, screenCluster: false }));
        const screenPoint = (group) => map.lngLatToContainer([
          group.centerLng ?? group.lng,
          group.centerLat ?? group.lat,
        ]);
        const closeEnough = (left, right) => {
          const leftPoint = screenPoint(left);
          const rightPoint = screenPoint(right);
          if (!leftPoint || !rightPoint) return false;
          return Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y)
            < PROVINCE_COLLISION_DISTANCE;
        };
        // Merge display groups recursively; the underlying memory records stay unchanged.
        let changed = true;
        while (changed) {
          changed = false;
          for (let leftIndex = 0; leftIndex < working.length; leftIndex += 1) {
            let merged = false;
            for (let rightIndex = leftIndex + 1; rightIndex < working.length; rightIndex += 1) {
              if (!closeEnough(working[leftIndex], working[rightIndex])) continue;
              const left = working[leftIndex];
              const right = working[rightIndex];
              const values = [...left.values, ...right.values];
              const labels = [left.label, right.label].filter(Boolean);
              working[leftIndex] = {
                key: 'screen:' + [left.key, right.key].sort().join('|'),
                values,
                ...centeredGroup(values),
                label: labels.join('、') || undefined,
                screenCluster: true,
              };
              working.splice(rightIndex, 1);
              changed = true;
              merged = true;
              break;
            }
            if (merged) break;
          }
        }
        return [...otherGroups, ...working];
      };
      const render = () => {
        if (!map || !window.AMap) return;
        const values = window.__MEMORY_MARKERS__ || [];
        const zoom = map.getZoom?.() || 5;
        const groups = mergeNearbyProvinceGroups(groupedMarkers(values.filter(safeMarker), zoom), map, zoom);
        const previousGroupSignatures = renderedGroupSignatures;
        const nextGroupSignatures = new Map();
        const signedGroups = groups.map((group) => ({ group, signature: groupSignature(group) }));
        const screenSignature = JSON.stringify(signedGroups
          .map(({ group, signature }) => [group.key, signature])
          .sort(([left], [right]) => left.localeCompare(right)));
        if (renderedScreenSignature === screenSignature) {
          updateSelectedMarkers();
          return;
        }
        const screenChanged = renderedScreenSignature !== null && renderedScreenSignature !== screenSignature;
        markers.forEach(({ marker }) => marker.setMap(null));
        markers.clear();
        signedGroups.forEach(({ group, signature }) => {
          const ids = group.values.map((value) => value.id);
          const count = ids.length;
          const shouldEnter = screenChanged || previousGroupSignatures.get(group.key) !== signature;
          nextGroupSignatures.set(group.key, signature);
          const element = markerContent(group, ids, shouldEnter);
          const marker = new AMap.Marker({
            position: [group.lng, group.lat],
            anchor: 'bottom-center',
            extData: { ids, count, scope: group.scope, label: group.label },
            content: element,
          });
          marker.on('click', () => {
            if (count === 1) {
              post({ type: 'markerPressed', id: ids[0] });
              return;
            }
            const cities = Array.from(new Set(group.values.map((value) => clean(value.city)).filter(Boolean)));
            const provinceHasSingleCity = group.scope === 'province'
              && cities.length === 1
              && group.values.every((value) => Boolean(clean(value.city)));
            const nextZoom = group.screenCluster
              ? 6
              : group.scope === 'province'
              ? (provinceHasSingleCity ? 9 : 6)
              : group.scope === 'city' ? 9 : Math.min(14, zoom + 2);
            const centerLat = group.centerLat ?? group.lat;
            const centerLng = group.centerLng ?? group.lng;
            setCamera(nextZoom, centerLng, centerLat);
            post({ type: 'clusterPressed', ids, count, scope: group.scope, label: group.label, lat: centerLat, lng: centerLng });
          });
          marker.setMap(map);
          markers.set(group.key, { marker, element, ids });
        });
        renderedGroupSignatures = nextGroupSignatures;
        renderedScreenSignature = screenSignature;
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
          updateSelectedMarkers();
        } else if (
          message.type === 'setCamera'
          && Number.isFinite(message.lat) && message.lat >= -90 && message.lat <= 90
          && Number.isFinite(message.lng) && message.lng >= -180 && message.lng <= 180
        ) {
          const zoom = Number.isFinite(message.zoom) ? Math.max(3.5, Math.min(14, message.zoom)) : map.getZoom();
          const center = cameraCenter();
          const currentLat = center && (typeof center.getLat === 'function' ? center.getLat() : center[1]);
          const currentLng = center && (typeof center.getLng === 'function' ? center.getLng() : center[0]);
          const currentZoom = map.getZoom?.();
          if (
            Number.isFinite(currentLat) && Number.isFinite(currentLng)
            && Math.abs(currentLat - message.lat) < 0.000001
            && Math.abs(currentLng - message.lng) < 0.000001
            && Number.isFinite(currentZoom) && Math.abs(currentZoom - zoom) < 0.001
          ) return;
          setCamera(zoom, message.lng, message.lat);
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
        if (!window.AMap || typeof window.AMap.Map !== 'function') {
          setNotice('高德 JS Key 无效、已回收或没有 JS API 权限。');
          post({ type: 'error', message: '高德脚本未初始化 AMap；请检查 JS API Key 状态与权限。' });
          return;
        }
        try {
          map = new AMap.Map('map', { center: [104.1954, 35.8617], zoom: 3.5, zooms: [3.5, 14], viewMode: '2D', mapStyle: ${mapStyle}, features: ['bg', 'road', 'point'] });
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
          setCamera(3.5, 104.1954, 35.8617);
          render();
          post({ type: 'ready' });
          postCameraIdle();
        } catch (error) {
          setNotice('高德地图无法启动。');
          post({ type: 'error', message: error instanceof Error ? error.message : '高德地图无法启动。' });
        }
      };
      script.onerror = () => {
        window.clearTimeout(scriptTimeout);
        setNotice('高德地图脚本加载失败，请检查网络、代理或 JS API Key。');
        post({ type: 'error', message: '高德地图脚本加载失败，请检查网络、代理或 JS API Key。' });
      };
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
