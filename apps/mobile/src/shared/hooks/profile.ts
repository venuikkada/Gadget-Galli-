import { useMutation, useQuery } from '@tanstack/react-query';

import type { Language, Profile, UserRole } from '@gg/shared';

import { rpc } from '../api/rpc';
import { queryClient } from '../lib/queryClient';
import { useSession } from './session';

export const profileKey = ['profile'] as const;

export function useProfile() {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: [...profileKey, userId],
    queryFn: () => rpc<Profile>('my_profile'),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function refreshProfile() {
  return queryClient.invalidateQueries({ queryKey: profileKey });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (patch: Partial<{ name: string; email: string; language: Language; role: UserRole; last_area_id: number; onboarded: boolean }>) =>
      rpc<Profile>('update_my_profile', { p_patch: patch }),
    onSuccess: (data) => {
      queryClient.setQueriesData({ queryKey: profileKey }, data);
    },
  });
}
