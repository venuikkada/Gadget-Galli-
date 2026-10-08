import { Platform } from 'react-native';

import { compressImage, makeThumb } from '../lib/images';
import { supabase } from './supabase';

export type Bucket = 'shop-media' | 'product-photos' | 'review-photos' | 'banners' | 'shop-documents' | 'order-media';
const PUBLIC: Bucket[] = ['shop-media', 'product-photos', 'review-photos', 'banners'];

/** Public URL for a stored path (paths that are already URLs are returned as-is). */
export function publicUrl(bucket: Bucket, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Thumbnail URL (uploaded next to the image as name_thumb.jpg); falls back to the full image. */
export function thumbUrl(bucket: Bucket, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return publicUrl(bucket, path.replace(/(\.[a-z0-9]+)$/i, '_thumb$1'));
}

export async function signedUrl(bucket: Bucket, path: string | null | undefined, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  const { File } = await import('expo-file-system');
  return new File(uri).arrayBuffer();
}

function randomName() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Compresses (under 300 KB) and uploads an image, plus a small thumbnail for lists.
 * Returns the storage path, e.g. "<folder>/k3j2h1x.jpg".
 */
export async function uploadImage(bucket: Bucket, folder: string, localUri: string, opts: { thumb?: boolean } = {}): Promise<string> {
  const { thumb = PUBLIC.includes(bucket) } = opts;
  const name = randomName();
  const path = `${folder}/${name}.jpg`;
  const main = await compressImage(localUri);
  const { error } = await supabase.storage.from(bucket).upload(path, await readBytes(main.uri), {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  if (thumb) {
    const t = await makeThumb(main.uri);
    await supabase.storage
      .from(bucket)
      .upload(`${folder}/${name}_thumb.jpg`, await readBytes(t.uri), { contentType: 'image/jpeg', upsert: true })
      .catch(() => undefined);
  }
  return path;
}

/** Uploads a document (image or PDF) to a private bucket without compression of PDFs. */
export async function uploadDocument(bucket: Bucket, folder: string, localUri: string, mimeType: string): Promise<string> {
  const isImage = mimeType.startsWith('image/');
  if (isImage) return uploadImage(bucket, folder, localUri, { thumb: false });
  const path = `${folder}/${randomName()}.pdf`;
  const { error } = await supabase.storage.from(bucket).upload(path, await readBytes(localUri), { contentType: mimeType });
  if (error) throw error;
  return path;
}
