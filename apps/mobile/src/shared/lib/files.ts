import { Platform } from 'react-native';

/**
 * Saves text as a file and opens the share sheet (Android/iOS) or downloads it (web).
 * Used for the bulk-upload CSV template.
 */
export async function shareTextFile(fileName: string, content: string, mimeType = 'text/csv') {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
}

/** Reads a file chosen with expo-document-picker as text. */
export async function readPickedText(asset: { uri: string; file?: Blob }): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text();
    return (await fetch(asset.uri)).text();
  }
  const { File } = await import('expo-file-system');
  return new File(asset.uri).text();
}

/**
 * Turns HTML into a PDF and opens the share sheet (Android/iOS); on web it opens the
 * browser's print dialog so the page can be printed or saved as PDF.
 */
export async function shareHtmlAsPdf(html: string, fileName: string) {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    return;
  }
  const [Print, Sharing] = await Promise.all([import('expo-print'), import('expo-sharing')]);
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName });
}
