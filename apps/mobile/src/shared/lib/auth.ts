import { router } from 'expo-router';

import { errorText, rpc } from '../api/rpc';
import { supabase } from '../api/supabase';
import { useLocationStore } from '../hooks/location';
import { confirmDialog, toast } from '../ui';
import { queryClient } from './queryClient';

export async function signOut() {
  await supabase.auth.signOut();
  queryClient.clear();
  useLocationStore.getState().clear();
  router.replace('/login');
}

export async function deleteAccount(t: (k: string) => string) {
  const ok = await confirmDialog({ title: t('profile.delete'), message: t('profile.deleteConfirm'), destructive: true, confirmText: t('common.delete'), cancelText: t('common.cancel'), icon: 'trash' });
  if (!ok) return;
  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) await rpc('delete_my_account');
    await signOut();
  } catch (e) {
    toast(errorText(e, t), 'error');
  }
}
