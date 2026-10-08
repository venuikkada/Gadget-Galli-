import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type {
  CatalogLookupItem,
  DemandItem,
  DocType,
  Listing,
  MyShop,
  Order,
  Paged,
  PaymentMethod,
  PhotoKind,
  ReviewsResult,
  ShopDashboard,
  ShopInsights,
  ShopOrderFilter,
  ShopOrdersResult,
  ShopProductDetail,
} from '@gg/shared';

import { rpc } from '@/shared/api/rpc';
import { refreshProfile } from '@/shared/hooks/profile';
import { useSession } from '@/shared/hooks/session';
import { queryClient } from '@/shared/lib/queryClient';

export const shopKey = ['partner', 'shop'] as const;

export function useMyShop() {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({ queryKey: [...shopKey, userId], queryFn: () => rpc<MyShop | null>('my_shop'), enabled: !!userId });
}

function setShop(shop: MyShop) {
  queryClient.setQueriesData({ queryKey: shopKey }, shop);
}

export async function shopUpsert(patch: Record<string, unknown>) {
  const shop = await rpc<MyShop>('shop_upsert', { p_patch: patch });
  setShop(shop);
  refreshProfile();
  return shop;
}

export async function setDeliveryAreas(shopId: string, zoneIds: number[], areaIds: number[]) {
  setShop(await rpc<MyShop>('shop_set_delivery_areas', { p_shop_id: shopId, p_zone_ids: zoneIds, p_area_ids: areaIds }));
}

export async function addShopPhoto(shopId: string, kind: PhotoKind, path: string) {
  setShop(await rpc<MyShop>('shop_add_photo', { p_shop_id: shopId, p_kind: kind, p_path: path }));
}

export async function removeShopPhoto(photoId: string) {
  setShop(await rpc<MyShop>('shop_remove_photo', { p_photo_id: photoId }));
}

export async function addShopDocument(shopId: string, type: DocType, path: string, number?: string) {
  setShop(await rpc<MyShop>('shop_add_document', { p_shop_id: shopId, p_doc_type: type, p_path: path, p_doc_number: number ?? null }));
}

export async function submitShop(shopId: string) {
  const res = await rpc<{ ok: boolean; missing: string[]; shop: MyShop }>('shop_submit', { p_shop_id: shopId });
  setShop(res.shop);
  refreshProfile();
  return res;
}

export async function setShopOpen(shopId: string, open: boolean) {
  await rpc('shop_set_open', { p_shop_id: shopId, p_open: open });
  queryClient.invalidateQueries({ queryKey: ['partner'] });
}

// ---------------------------------------------------------------------------
// Dashboard, orders
// ---------------------------------------------------------------------------
export function useDashboard(shopId: string | undefined) {
  return useQuery({
    queryKey: ['partner', 'dashboard', shopId],
    queryFn: () => rpc<ShopDashboard>('shop_dashboard', { p_shop_id: shopId }),
    enabled: !!shopId,
    refetchInterval: 60_000,
  });
}

export function useShopOrders(shopId: string | undefined, filter: ShopOrderFilter) {
  return useQuery({
    queryKey: ['partner', 'orders', shopId, filter],
    queryFn: () => rpc<ShopOrdersResult>('shop_orders', { p_shop_id: shopId, p_filter: filter, p_limit: 60, p_offset: 0 }),
    enabled: !!shopId,
    refetchInterval: 45_000,
  });
}

function orderChanged(order: Order) {
  queryClient.setQueryData(['order', order.id], order);
  queryClient.invalidateQueries({ queryKey: ['partner'] });
}

export const orderActions = {
  confirm: (orderId: string, items: unknown[] | null, deliveryCharge: number | null, note: string | null) =>
    rpc<Order>('shop_confirm_order', { p_order_id: orderId, p_items: items, p_delivery_charge: deliveryCharge, p_note: note }).then((o) => (orderChanged(o), o)),
  reject: (orderId: string, reason: string, note: string | null) =>
    rpc<Order>('shop_reject_order', { p_order_id: orderId, p_reason: reason, p_note: note }).then((o) => (orderChanged(o), o)),
  paid: (orderId: string, method: PaymentMethod, amount: number | null, txnId: string | null, proofPath: string | null) =>
    rpc<Order>('shop_mark_paid', { p_order_id: orderId, p_method: method, p_amount: amount, p_txn_id: txnId, p_proof_path: proofPath }).then((o) => (orderChanged(o), o)),
  packed: (orderId: string, packPhoto: string | null, billPhoto: string | null) =>
    rpc<Order>('shop_mark_packed', { p_order_id: orderId, p_pack_photo: packPhoto, p_bill_photo: billPhoto }).then((o) => (orderChanged(o), o)),
  dispatch: (orderId: string, details: Record<string, unknown>) =>
    rpc<Order>('shop_dispatch_order', { p_order_id: orderId, p_details: details }).then((o) => (orderChanged(o), o)),
  updateDispatch: (orderId: string, details: Record<string, unknown>) =>
    rpc<Order>('shop_update_dispatch', { p_order_id: orderId, p_details: details }).then((o) => (orderChanged(o), o)),
};

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export function useMyListings(shopId: string | undefined, query: string) {
  return useInfiniteQuery({
    queryKey: ['partner', 'listings', shopId, query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      rpc<Paged<Listing>>('shop_catalog', { p_shop_id: shopId, p_query: query, p_category_id: null, p_limit: 50, p_offset: pageParam, p_include_inactive: true }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!shopId,
  });
}

export function useCatalogLookup(query: string, categoryId: number | null) {
  return useQuery({
    queryKey: ['catalog-lookup', query, categoryId],
    queryFn: () => rpc<CatalogLookupItem[]>('catalog_lookup', { p_query: query, p_category_id: categoryId, p_limit: 30 }),
    enabled: query.trim().length >= 2 || categoryId != null,
    placeholderData: (prev) => prev,
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ['partner', 'listing', id],
    queryFn: () => rpc<ShopProductDetail | null>('get_shop_product', { p_shop_product_id: id }),
    enabled: !!id,
  });
}

function productsChanged() {
  queryClient.invalidateQueries({ queryKey: ['partner'] });
}

export const productActions = {
  upsert: (patch: Record<string, unknown>) => rpc<ShopProductDetail>('shop_upsert_product', { p_patch: patch }).then((r) => (productsChanged(), r)),
  quick: (id: string, price: number | null, inStock: boolean | null, qty: number | null) =>
    rpc<{ id: string; price: number; in_stock: boolean; stock_qty: number | null }>('shop_quick_update', { p_id: id, p_price: price, p_in_stock: inStock, p_stock_qty: qty }).then((r) => (productsChanged(), r)),
  remove: (id: string) => rpc('shop_delete_product', { p_id: id }).then(productsChanged),
  createCustom: (patch: Record<string, unknown>) => rpc<{ id: string; name: string; status: string }>('shop_create_custom_product', { p_patch: patch }),
  bulk: (shopId: string, rows: Record<string, unknown>[]) =>
    rpc<{ results: { row: number; status: string; name: string; message?: string }[]; created: number; updated: number; errors: number }>('shop_bulk_upsert', { p_shop_id: shopId, p_rows: rows }).then((r) => (productsChanged(), r)),
};

// ---------------------------------------------------------------------------
// Insights, reviews
// ---------------------------------------------------------------------------
export function useInsights(shopId: string | undefined, period: 'day' | 'week' | 'month') {
  return useQuery({ queryKey: ['partner', 'insights', shopId, period], queryFn: () => rpc<ShopInsights>('shop_insights', { p_shop_id: shopId, p_period: period }), enabled: !!shopId });
}

export function useDemand(shopId: string | undefined) {
  return useQuery({ queryKey: ['partner', 'demand', shopId], queryFn: () => rpc<DemandItem[]>('shop_demand_insights', { p_shop_id: shopId, p_days: 7 }), enabled: !!shopId });
}

export function useMyShopReviews(shopId: string | undefined) {
  return useQuery({
    queryKey: ['shop-reviews', shopId, 50],
    queryFn: () => rpc<ReviewsResult>('shop_reviews', { p_shop_id: shopId, p_limit: 50, p_offset: 0 }),
    enabled: !!shopId,
  });
}

export async function replyReview(reviewId: string, reply: string) {
  await rpc('shop_reply_review', { p_review_id: reviewId, p_reply: reply });
  queryClient.invalidateQueries({ queryKey: ['shop-reviews'] });
  queryClient.invalidateQueries({ queryKey: ['partner'] });
}
