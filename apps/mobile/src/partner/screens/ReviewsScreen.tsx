import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatDateIST, type Review } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { thumbUrl } from '@/shared/api/storage';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Chip, EmptyState, ErrorState, Header, Input, Loading, Rating, Row, Screen, Sheet, toast } from '@/shared/ui';

import { replyReview, useMyShop, useMyShopReviews } from '../api';

function ReviewCard({ r, onReply }: { r: Review; onReply: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 8 }} testID={`review-${r.id}`}>
      <Row justify="space-between">
        <Row gap={8} style={{ flex: 1 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="label" color="primary">{(r.customer_name || 'C')[0]}</AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{r.customer_name}</AppText>
            <AppText variant="caption" color="textSubtle">{formatDateIST(r.created_at)}</AppText>
          </View>
        </Row>
        <Rating value={r.rating} />
      </Row>
      {r.items ? <AppText variant="caption" color="textMuted" numberOfLines={2}>{r.items}</AppText> : null}
      {r.body ? <AppText variant="bodySmall">{r.body}</AppText> : null}
      {r.photos?.length ? (
        <Row gap={6}>
          {r.photos.slice(0, 4).map((p) => (
            <Image key={p} source={{ uri: thumbUrl('review-photos', p) ?? undefined }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surfaceAlt }} />
          ))}
        </Row>
      ) : null}
      {r.shop_reply ? (
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 10, gap: 2 }}>
          <Row justify="space-between">
            <AppText variant="caption" color="primary" weight="semibold">{t('p.reviews.yourReply')}</AppText>
            <AppText variant="caption" color="primary" onPress={onReply}>{t('p.reviews.editReply')}</AppText>
          </Row>
          <AppText variant="bodySmall">{r.shop_reply}</AppText>
        </View>
      ) : (
        <Button title={t('p.reviews.reply')} icon="chatbubble-ellipses-outline" variant="secondary" size="sm" onPress={onReply} style={{ alignSelf: 'flex-start' }} testID={`reply-${r.id}`} />
      )}
    </Card>
  );
}

/** Shop owner's reviews with a star breakdown and replies. */
export default function ReviewsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const q = useMyShopReviews(shop?.id);
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const [replying, setReplying] = useState<Review | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const items = useMemo(() => (q.data?.items ?? []).filter((r) => filter === 'all' || !r.shop_reply), [q.data, filter]);
  const unreplied = (q.data?.items ?? []).filter((r) => !r.shop_reply).length;
  const summary = q.data?.summary;

  const send = async () => {
    if (!replying || !text.trim()) return;
    setSending(true);
    try {
      await replyReview(replying.id, text.trim());
      setReplying(null);
      toast(t('common.saved'), 'success');
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen header={<Header title={t('p.reviews.title')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isError ? <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /> : null}
      {q.isLoading ? <Loading /> : null}
      {summary && summary.count ? (
        <Card>
          <Row gap={18}>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <AppText variant="display">{Number(summary.avg).toFixed(1)}</AppText>
              <Row gap={2}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons key={s} name={s <= Math.round(summary.avg) ? 'star' : 'star-outline'} size={13} color={colors.star} />
                ))}
              </Row>
              <AppText variant="caption" color="textMuted">{t('p.reviews.count', { count: summary.count })}</AppText>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {(['5', '4', '3', '2', '1'] as const).map((k) => {
                const n = summary.dist[k] ?? 0;
                return (
                  <Row key={k} gap={6}>
                    <AppText variant="caption" color="textMuted" style={{ width: 10 }}>{k}</AppText>
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ width: `${(n / summary.count) * 100}%`, height: 8, backgroundColor: Number(k) >= 4 ? colors.success : Number(k) === 3 ? colors.warning : colors.error }} />
                    </View>
                    <AppText variant="caption" color="textSubtle" style={{ width: 24, textAlign: 'right' }}>{n}</AppText>
                  </Row>
                );
              })}
            </View>
          </Row>
        </Card>
      ) : null}

      {q.data && q.data.items.length ? (
        <Row gap={8}>
          <Chip label={t('p.reviews.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={t('p.reviews.notReplied')} count={unreplied} selected={filter === 'open'} onPress={() => setFilter('open')} />
        </Row>
      ) : null}

      {q.data && !q.data.items.length ? <EmptyState icon="star-outline" title={t('p.reviews.empty')} body={t('p.reviews.emptyBody')} /> : null}
      {items.map((r) => (
        <ReviewCard
          key={r.id}
          r={r}
          onReply={() => {
            setText(r.shop_reply ?? '');
            setReplying(r);
          }}
        />
      ))}

      <Sheet
        visible={!!replying}
        onClose={() => setReplying(null)}
        title={t('p.reviews.reply')}
        footer={<Button testID="send-reply" title={t('p.reviews.send')} icon="send" full loading={sending} disabled={!text.trim()} onPress={send} />}
      >
        {replying ? (
          <View style={{ gap: 4 }}>
            <Row gap={8}>
              <AppText variant="label">{replying.customer_name}</AppText>
              <Rating value={replying.rating} />
            </Row>
            {replying.body ? <AppText variant="bodySmall" color="textMuted" numberOfLines={4}>{replying.body}</AppText> : null}
          </View>
        ) : null}
        <Input testID="reply-input" placeholder={t('p.reviews.replyPh')} value={text} onChangeText={setText} multiline maxLength={500} hint={t('p.reviews.replyHint')} autoFocus />
      </Sheet>
    </Screen>
  );
}
