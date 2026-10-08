import { Redirect, Stack } from 'expo-router';

import { useMyShop } from '@/partner/api';
import { NewOrderAlert } from '@/partner/components/NewOrderAlert';
import { config } from '@/shared/config';
import { useSession } from '@/shared/hooks/session';

export default function PartnerLayout() {
  const { session, ready } = useSession();
  const { data: shop } = useMyShop();
  if (config.app === 'customer') return <Redirect href="/home" />;
  if (ready && !session) return <Redirect href="/login" />;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      <NewOrderAlert shopId={shop?.status && shop.status !== 'draft' ? shop.id : undefined} />
    </>
  );
}
