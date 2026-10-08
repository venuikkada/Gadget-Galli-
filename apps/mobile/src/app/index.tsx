import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { config } from '@/shared/config';
import { useLocationStore } from '@/shared/hooks/location';
import { useProfile } from '@/shared/hooks/profile';
import { useSession } from '@/shared/hooks/session';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { Loading } from '@/shared/ui';

/** Decides where to start: login, onboarding, location, customer home or the Shop Partner side.
 *  On the separate websites the side is fixed: shop owners can shop on the customer site too. */
export default function Index() {
  const { colors } = useTheme();
  const { session, ready } = useSession();
  const profile = useProfile();
  const location = useLocationStore((s) => s.location);
  const hydrated = useLocationStore((s) => s.hydrated);

  if (!ready || !hydrated || (session && profile.isLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <Loading />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  const user = profile.data?.user;
  if (!user?.name || !user.onboarded) return <Redirect href="/onboarding" />;
  if (config.app === 'partner' || (config.app === 'all' && user.role === 'shop_owner')) return <Redirect href="/partner" />;
  if (!location) return <Redirect href="/location" />;
  return <Redirect href="/home" />;
}
