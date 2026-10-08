import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { MAX_IMAGE_BYTES } from '@gg/shared';

async function sizeOf(uri: string): Promise<number> {
  try {
    if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
    const { File } = await import('expo-file-system');
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

async function render(uri: string, width: number, compress: number) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  return ref.saveAsync({ compress, format: SaveFormat.JPEG });
}

/** Resizes to max 1280 px wide and lowers JPEG quality until the file is under 300 KB. */
export async function compressImage(uri: string, maxWidth = 1280): Promise<{ uri: string; width: number; height: number }> {
  let width = maxWidth;
  let quality = 0.72;
  let out = await render(uri, width, quality);
  for (let i = 0; i < 6; i++) {
    const bytes = await sizeOf(out.uri);
    if (bytes > 0 && bytes <= MAX_IMAGE_BYTES) break;
    if (quality > 0.45) quality -= 0.12;
    else width = Math.round(width * 0.8);
    out = await render(uri, width, quality);
  }
  return out;
}

export async function makeThumb(uri: string) {
  return render(uri, 320, 0.6);
}

/** Opens the camera or gallery and returns the chosen image URI (or null). */
export async function pickImage(source: 'camera' | 'gallery', opts: { square?: boolean } = {}): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: !!opts.square, aspect: opts.square ? [1, 1] : undefined });
    return res.canceled ? null : res.assets[0]?.uri ?? null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
  });
  return res.canceled ? null : res.assets[0]?.uri ?? null;
}

export async function pickImages(limit: number): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  return res.canceled ? [] : res.assets.map((a) => a.uri);
}
