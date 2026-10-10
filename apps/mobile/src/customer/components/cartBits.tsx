import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { shadow } from '@/shared/theme/tokens';
import { AppText, confirmDialog, Row, toast } from '@/shared/ui';

import { cartAdd, cartSetQty, useCart } from '../api';

/** Adds to cart, asking "Start a new cart with Shop B?" when the cart has another shop's items. */
export function useAddToCart() {
  const { t } = useTranslation();
  return useCallback(
    async (shopProductId: string, qty = 1) => {
      try {
        const res = await cartAdd(shopProductId, qty);
        if (res.status === 'conflict') {
          const ok = await confirmDialog({
            title: t('cart.replaceTitle'),
            message: t('cart.replaceBody', { current: res.current_shop.name, next: res.new_shop.name }),
            confirmText: t('cart.replace'),
            cancelText: t('common.cancel'),
            icon: 'cart',
          });
          if (!ok) return false;
          await cartAdd(shopProductId, qty, true);
        }
        toast(t('product.added'), 'success');
        return true;
      } catch (e) {
        toast(errorText(e, t), 'error');
        return false;
      }
    },
    [t],
  );
}

/** Quantity of a listing in the cart, plus a setter (0 removes). */
export function useCartQty() {
  const { data } = useCart();
  const { t } = useTranslation();
  const qtyOf = (shopProductId: string) => data?.items.find((i) => i.shop_product_id === shopProductId)?.qty ?? 0;
  const setQty = async (shopProductId: string, qty: number) => {
    try {
      await cartSetQty(shopProductId, qty);
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };
  return { qtyOf, setQty, cart: data };
}

/** "2 items | ₹45,999 | View cart" — sticky at the bottom whenever the cart has items. */
export function StickyCartBar({ inline = false }: { inline?: boolean }) {
  const { t } = useTranslation();
  const { colors, dark, gradients } = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useCart();
  const pathname = usePathname();
  const count = data?.totals.item_count ?? 0;
  if (!count || pathname === '/cart') return null;
  return (
    <View
      style={inline ? { paddingHorizontal: 12, paddingBottom: 8 } : { position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 10 }}
      pointerEvents="box-none"
    >
      <Pressable testID="sticky-cart" onPress={() => router.push('/cart')} style={({ pressed }) => [{ borderRadius: 16, transform: [{ scale: pressed ? 0.985 : 1 }] }, shadow(3, dark)]}>
        <LinearGradient
          colors={gradients.cartBar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ borderRadius: 16, paddingHorizontal: 12, height: 60, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="bag-handle" size={20} color={colors.onAction} />
            <View style={{ position: 'absolute', top: -5, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="caption" color="onAccent" weight="bold" style={{ fontSize: 11, lineHeight: 14 }}>{count}</AppText>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" color={colors.onAction} weight="bold" numberOfLines={1}>
              {count === 1 ? t('cart.barOne', { amount: formatINR(data?.totals.grand_total) }) : t('cart.bar', { count, amount: formatINR(data?.totals.grand_total) })}
            </AppText>
            {data?.shop ? <AppText variant="caption" color={colors.onAction} numberOfLines={1} style={{ opacity: 0.82 }}>{t('cart.from', { shop: data.shop.name })}</AppText> : null}
          </View>
          <Row gap={2}>
            <AppText variant="title" color={colors.onAction} weight="bold">{t('cart.view')}</AppText>
            <Ionicons name="chevron-forward" size={18} color={colors.onAction} />
          </Row>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
