import { useSearchParams } from 'react-router';

import { PageHeader, Tabs } from '@/components/ui';

import { ProductsTab } from './catalog/ProductsTab';
import { BrandsTab, CategoriesTab, SynonymsTab } from './catalog/ReferenceTabs';

type Tab = 'products' | 'categories' | 'brands' | 'synonyms';

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'products';
  return (
    <div className="space-y-5">
      <PageHeader title="Catalog" subtitle="One master catalog keeps names standard, so the same product from many shops shows up together in search." />
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        options={[
          { value: 'products', label: 'Products' },
          { value: 'categories', label: 'Categories' },
          { value: 'brands', label: 'Brands' },
          { value: 'synonyms', label: 'Search synonyms' },
        ]}
      />
      {tab === 'products' ? <ProductsTab /> : tab === 'categories' ? <CategoriesTab /> : tab === 'brands' ? <BrandsTab /> : <SynonymsTab />}
    </div>
  );
}
