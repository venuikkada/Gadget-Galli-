import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error) => {
        const code = (error as { code?: string })?.code;
        if (code && code !== 'network' && code !== 'generic') return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

// Refetch stale data when the app comes back to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}
