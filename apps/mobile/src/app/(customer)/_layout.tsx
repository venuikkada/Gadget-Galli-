import { Redirect, Stack } from 'expo-router';

import { config } from '@/shared/config';
import { useSession } from '@/shared/hooks/session';

export default function CustomerLayout() {
  const { session, ready } = useSession();
  if (config.app === 'partner') return <Redirect href="/partner" />;
  if (ready && !session) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
