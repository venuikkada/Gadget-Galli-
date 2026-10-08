import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import type {
  AppNotification,
  Cart,
  CartAddResult,
  ContactMethod,
  HomeFeed,
  IssueType,
  Listing,
  Order,
  OrderCard,
  Paged,
  ProductCard,
  ProductPage,
  ResolvedLocation,
  ReviewsResult,
  SearchFilters,
  SearchResult,
  SearchSort,
  ShopCard,
  ShopPage,
  ShopProductDetail,
  Suggestions,
} from '@gg/shared';

import { rpc } from '@/shared/api/rpc';
import { refreshProfile } from '@/shared/hooks/profile';
import { useLocArgs } from '@/shared/hooks/location';
import { useSession } from '@/shared/hooks/session';
import { queryClient } from '@/shared/lib/queryClient';

const PAGE = 20;

// ---------------------------------------------------------------------------
// Browse & search
// ---------------------------------------------------------------------------
export function useHomeFeed() {
  const loc = useLocArgs();
  return useQuery({
    queryKey: ['home', loc],
    queryFn: () => rpc<HomeFeed>('home_feed', loc),
    enabled: loc.p_area_id != null,
  });
}

export function useSearch(query: string, filters: SearchFilters, sort: SearchSort, enabled = true) {
  const loc = useLocArgs();
  return useInfiniteQuery({
    queryKey: ['search', query, filters, sort, loc],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      rpc<SearchResult>('search_products', {
        p_query: query,
        ...loc,
        p_filters: filters,
        p_sort: sort,
        p_limit: PAGE,
        p_offset: pageParam,
        p_log: pageParam === 0 && query.trim().length > 0,
      }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useSuggest(q: string) {
  return useQuery({
    queryKey: ['suggest', q],
    queryFn: () => rpc<Suggestions>('search_suggest', { p_query: q, p_limit: 6 }),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useProductPage(id: string | undefined) {
  const loc = useLocArgs();
  return useQuery({
    queryKey: ['product', id, loc],
    queryFn: () => rpc<ProductPage | null>('get_product_page', { p_product_id: id, ...loc }),
    enabled: !!id,
  });
}

export function useProductsByIds(ids: string[]) {
  const loc = useLocArgs();
  return useQuery({
    queryKey: ['products-by-ids', ids, loc],
    queryFn: () => rpc<ProductCard[]>('products_by_ids', { p_ids: ids, ...loc }),
    enabled: ids.length > 0,
  });
}

export function useShopsNear(onlyDelivering = true) {
  const loc = useLocArgs();
  return useQuery({
    queryKey: ['shops-near', loc, onlyDelivering],
    queryFn: () => rpc<ShopCard[]>('shops_near', { ...loc, p_limit: 50, p_offset: 0, p_only_delivering: onlyDelivering }),
    enabled: loc.p_area_id != null,
  });
}

export function useShopPage(id: string | undefined) {
  const loc = useLocArgs();
  return useQuery({
    queryKey: ['shop', id, loc],
    queryFn: () => rpc<ShopPage | null>('get_shop_page', { p_shop_id: id, ...loc }),
    enabled: !!id,
  });
}

export function useShopCatalog(shopId: string | undefined, query: string, categoryId: number | null) {
  return useInfiniteQuery({
    queryKey: ['shop-catalog', shopId, query, categoryId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      rpc<Paged<Listing>>('shop_catalog', { p_shop_id: shopId, p_query: query, p_category_id: categoryId, p_limit: 30, p_offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!shopId,
  });
}

export function useShopReviews(shopId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['shop-reviews', shopId, limit],
    queryFn: () => rpc<ReviewsResult>('shop_reviews', { p_shop_id: shopId, p_limit: limit, p_offset: 0 }),
    enabled: !!shopId,
  });
}

export function useShopProduct(id: string | undefined) {
  const loc = useLocArgs();
  return useQuery({
    queryKey: ['shop-product', id, loc],
    queryFn: () => rpc<ShopProductDetail | null>('get_shop_product', { p_shop_product_id: id, ...loc }),
    enabled: !!id,
  });
}

export function resolveLocation(lat: number, lng: number) {
  return rpc<ResolvedLocation>('resolve_location', { p_lat: lat, p_lng: lng });
}

export const track = {
  productView: (id: string) => rpc('track_product_view', { p_product_id: id }).catch(() => undefined),
  shop: (id: string, kind: 'view' | 'share' | 'call' | 'whatsapp') => rpc('track_shop_event', { p_shop_id: id, p_kind: kind }).catch(() => undefined),
};

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
export const cartKey = ['cart'] as const;

export function useCart() {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: [...cartKey, userId],
    queryFn: () => rpc<Cart>('get_cart'),
    enabled: !!userId,
    staleTime: 15_000,
  });
}

function setCart(cart: Cart) {
  queryClient.setQueriesData({ queryKey: cartKey }, cart);
}

export async function cartAdd(shopProductId: string, qty = 1, replace = false): Promise<CartAddResult> {
  const res = await rpc<CartAddResult>('cart_add', { p_shop_product_id: shopProductId, p_qty: qty, p_replace: replace });
  if (res.status === 'ok') setCart(res.cart);
  return res;
}

export async function cartSetQty(shopProductId: string, qty: number) {
  setCart(await rpc<Cart>('cart_set_qty', { p_shop_product_id: shopProductId, p_qty: qty }));
}

export async function cartUpdate(patch: { fulfilment?: 'delivery' | 'pickup'; address_id?: string | null; note?: string | null; installation?: Record<string, boolean> }) {
  setCart(await rpc<Cart>('cart_update', { p_patch: patch }));
}

export async function cartClear() {
  setCart(await rpc<Cart>('cart_clear'));
}

export async function placeOrder(method: ContactMethod): Promise<Order> {
  const order = await rpc<Order>('place_order', { p_contact_method: method });
  queryClient.invalidateQueries({ queryKey: cartKey });
  queryClient.invalidateQueries({ queryKey: ['orders'] });
  refreshProfile();
  return order;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export function useMyOrders(scope: 'active' | 'past') {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['orders', scope, userId],
    queryFn: () => rpc<OrderCard[]>('my_orders', { p_scope: scope, p_limit: 50, p_offset: 0 }),
    enabled: !!userId,
  });
}

export { useOrder } from '@/shared/hooks/order';

function afterOrderChange(order: Order) {
  queryClient.setQueryData(['order', order.id], order);
  queryClient.invalidateQueries({ queryKey: ['orders'] });
}

export function useOrderActions(orderId: string) {
  const cancel = useMutation({
    mutationFn: (reason?: string) => rpc<Order>('customer_cancel_order', { p_order_id: orderId, p_reason: reason ?? null }),
    onSuccess: afterOrderChange,
  });
  const received = useMutation({
    mutationFn: () => rpc<Order>('customer_mark_received', { p_order_id: orderId }),
    onSuccess: afterOrderChange,
  });
  return { cancel, received };
}

export function submitReview(orderId: string, rating: number, body: string, photos: string[]) {
  return rpc('submit_review', { p_order_id: orderId, p_rating: rating, p_body: body, p_photos: photos }).then((r) => {
    queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    return r;
  });
}

export function reportIssue(orderId: string, type: IssueType, description: string, photos: string[]) {
  return rpc('report_issue', { p_order_id: orderId, p_type: type, p_description: description, p_photos: photos }).then((r) => {
    queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    return r;
  });
}

// ---------------------------------------------------------------------------
// Profile extras
// ---------------------------------------------------------------------------
export async function toggleFavourite(shopId: string) {
  const on = await rpc<boolean>('toggle_favourite', { p_shop_id: shopId });
  queryClient.invalidateQueries({ queryKey: ['shop', shopId] });
  queryClient.invalidateQueries({ queryKey: ['favourites'] });
  refreshProfile();
  return on;
}

export function useFavouriteShops() {
  return useQuery({ queryKey: ['favourites'], queryFn: () => rpc<ShopCard[]>('my_favourite_shops') });
}

export function useMyReviews() {
  return useQuery({
    queryKey: ['my-reviews'],
    queryFn: () =>
      rpc<{ id: string; order_id: string; rating: number; body: string | null; photos: string[]; shop_reply: string | null; created_at: string; shop_id: string; shop_name: string }[]>('my_reviews'),
  });
}

export function useMyReferrals() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: () => rpc<{ code: string; joined: number; ordered: number; items: { name: string; status: string; created_at: string }[] }>('my_referrals'),
  });
}

export function useNotifications(app: 'customer' | 'partner') {
  return useQuery({ queryKey: ['notifications', app], queryFn: () => rpc<AppNotification[]>('my_notifications', { p_app: app, p_limit: 60 }) });
}

export async function saveAddress(address: Record<string, unknown>) {
  const saved = await rpc<{ id: string }>('save_address', { p_address: address });
  await refreshProfile();
  queryClient.invalidateQueries({ queryKey: cartKey });
  return saved;
}

export async function deleteAddress(id: string) {
  await rpc('delete_address', { p_id: id });
  await refreshProfile();
}
