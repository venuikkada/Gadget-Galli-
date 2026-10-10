-- Brand palette "Peacock Teal + Marigold" (docs/DECISIONS.md #37).
-- New banners default to peacock teal, and banners saved with the old indigo palette move to the matching new
-- colours. The apps would map the old colours anyway (bannerStyle in packages/shared/src/palette.ts); this keeps
-- the stored data tidy.
alter table public.banners alter column bg_color set default '#0B7A80';

update public.banners
set bg_color = case upper(bg_color)
    when '#4F46E5' then '#0B7A80'
    when '#0F172A' then '#03282C'
    when '#FF6B35' then '#FFB300'
    when '#16A34A' then '#237A2E'
  end
where upper(bg_color) in ('#4F46E5', '#0F172A', '#FF6B35', '#16A34A');
