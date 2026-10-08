import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface RecentState {
  products: string[];
  searches: string[];
  addProduct: (id: string) => void;
  addSearch: (q: string) => void;
  clearSearches: () => void;
}

/** Recently viewed products and recent searches, kept on the device. */
export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      products: [],
      searches: [],
      addProduct: (id) => set((s) => ({ products: [id, ...s.products.filter((p) => p !== id)].slice(0, 12) })),
      addSearch: (q) => {
        const query = q.trim();
        if (!query) return;
        set((s) => ({ searches: [query, ...s.searches.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8) }));
      },
      clearSearches: () => set({ searches: [] }),
    }),
    { name: 'gg.recent', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
