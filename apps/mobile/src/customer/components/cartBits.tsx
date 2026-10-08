import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { fonts, shadow } from '@/shared/theme/tokens';
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
  const { colors, dark } = useTheme();
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
      <Pressable
        testID="sticky-cart"
        onPress={() => router.push('/cart')}
        style={({ pressed }) => [
          { backgroundColor: pressed ? colors.actionPressed : colors.action, borderRadius: 16, paddingHorizontal: 16, height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
          shadow(3, dark),
        ]}
      >
        <View>
          <AppText variant="title" color="#FFFFFF" style={{ fontFamily: fonts.bodyBold }}>
            {count === 1 ? t('cart.barOne', { amount: formatINR(data?.totals.grand_total) }) : t('cart.bar', { count, amount: formatINR(data?.totals.grand_total) })}
          </AppText>
          {data?.shop ? <AppText variant="caption" color="#FFFFFFD0" numberOfLines={1}>{t('cart.from', { shop: data.shop.name })}</AppText> : null}
        </View>
        <Row gap={4}>
          <AppText variant="title" color="#FFFFFF">{t('cart.view')}</AppText>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Row>
      </Pressable>
    </View>
  );
}
