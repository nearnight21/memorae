import { createClient } from '@supabase/supabase-js';
import { Memory } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL?.trim() || '';

export const backendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// 原型默认使用不可用的占位地址，避免误读写现有 ThinkPad 线上数据。
export const supabase = createClient(
  SUPABASE_URL || 'https://prototype-not-configured.invalid',
  SUPABASE_ANON_KEY || 'prototype-not-configured',
);

export async function uploadImage(file: File, prefix: string = 'camp_'): Promise<string> {
  if (!R2_WORKER_URL) {
    throw new Error('照片上传后端尚未配置；VMK 原型不会上传到现有 R2。');
  }

  const ext = file.name.split('.').pop() || 'png';
  const key = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('key', key);

  const res = await fetch(`${R2_WORKER_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error((errData as { error?: string }).error || res.statusText);
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}

export function mapMemory(db: any): Memory {
  return {
    id: db.id,
    title: db.title,
    date: db.date,
    year: db.year,
    category: db.category,
    tag: db.tag,
    image: db.image,
    gallery: db.gallery || [],
    pastSelf: db.past_self,
    presentSelf: db.present_self,
    pinnedBy: db.pinned_by,
    px: db.px,
    py: db.py,
    rotation: db.rotation,
    location: db.location_name
      ? {
          name: db.location_name,
          mx: db.location_mx,
          my: db.location_my,
        }
      : undefined,
    country: db.country || undefined,
    city: db.city || undefined,
    lat: db.lat ?? undefined,
    lng: db.lng ?? undefined,
    detailLocation: db.detail_location || undefined,
  };
}

export function memoryToDb(m: Memory): Record<string, any> {
  return {
    id: m.id,
    title: m.title,
    date: m.date,
    year: m.year,
    category: m.category,
    tag: m.tag,
    image: m.image,
    gallery: m.gallery,
    past_self: m.pastSelf,
    present_self: m.presentSelf,
    pinned_by: m.pinnedBy,
    px: m.px,
    py: m.py,
    rotation: m.rotation,
    location_name: m.location?.name || null,
    location_mx: m.location?.mx || null,
    location_my: m.location?.my || null,
    country: m.country || null,
    city: m.city || null,
    lat: m.lat ?? null,
    lng: m.lng ?? null,
    detail_location: m.detailLocation || null,
  };
}
