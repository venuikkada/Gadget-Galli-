import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/shared/hooks/session';

export default function CustomerLayout() {
  const { session, ready } = useSession();
  if (ready && !session) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
