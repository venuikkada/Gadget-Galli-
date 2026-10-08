import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { publicUrl, uploadImage, type Bucket } from '../api/storage';
import { useTranslation } from '../i18n';
import { pickImage } from '../lib/images';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, Row, Sheet, Button, toast } from '../ui';

/** Grid of uploaded photos with an "Add photo" tile (camera or gallery). Values are storage paths. */
export function PhotoPicker({
  bucket,
  folder,
  value,
  onChange,
  max = 8,
  size = 84,
  label,
  square,
  signed,
}: {
  bucket: Bucket;
  folder: string;
  value: string[];
  onChange: (paths: string[]) => void;
  max?: number;
  size?: number;
  label?: string;
  square?: boolean;
  signed?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});

  const add = async (source: 'camera' | 'gallery') => {
    setChoose(false);
    const uri = await pickImage(source, { square });
    if (!uri) return;
    setBusy(true);
    try {
      const path = await uploadImage(bucket, folder, uri);
      setLocal((m) => ({ ...m, [path]: uri }));
      onChange([...value, path].slice(0, max));
    } catch (e) {
      toast((e as Error).message ?? t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {label ? <AppText variant="label" color="textMuted">{label}</AppText> : null}
      <Row wrap gap={10}>
        {value.map((p) => (
          <View key={p}>
            <Image source={{ uri: local[p] ?? signed?.[p] ?? publicUrl(bucket, p) ?? undefined }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.surfaceAlt }} contentFit="cover" />
            <Pressable
              onPress={() => onChange(value.filter((x) => x !== p))}
              hitSlop={6}
              style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {value.length < max ? (
          <Pressable
            testID="add-photo"
            onPress={() => setChoose(true)}
            style={{ width: size, height: size, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="camera-outline" size={24} color={colors.primary} />}
            <AppText variant="caption" color="primary">{busy ? t('common.uploading') : t('common.choosePhoto')}</AppText>
          </Pressable>
        ) : null}
      </Row>
      <Sheet visible={choose} onClose={() => setChoose(false)} title={t('common.choosePhoto')}>
        <Button title={t('common.camera')} icon="camera" variant="secondary" size="lg" full onPress={() => add('camera')} />
        <Button title={t('common.gallery')} icon="images" variant="secondary" size="lg" full onPress={() => add('gallery')} />
      </Sheet>
    </View>
  );
}
