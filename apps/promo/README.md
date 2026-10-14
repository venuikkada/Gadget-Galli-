# Gadget Galli launch promo videos

Vertical (1080 × 1920) launch videos in English and Telugu, plus the Play Store feature graphic (1024 × 500). Made with [Remotion](https://www.remotion.dev) from the apps' real screenshots, brand colours and fonts.

```bash
pnpm --filter @gg/promo render              # out/gadget-galli-promo-en.mp4, -te.mp4, play-feature-graphic-1024x500.png
pnpm --filter @gg/promo render -- --stills  # one still per scene, to check a layout change quickly
pnpm --filter @gg/promo studio              # edit with live preview in the browser
```

## What's where

- **`src/Promo.tsx`:** the eight scenes and the soundtrack.
  - `SCENES` holds the frame where each scene starts, at 30 fps.
- **`src/captions.ts`:** all on-screen text in English and Telugu.
- **`src/ui.tsx`:** the phone frame, captions, badges, logo, background and font loading.
- **`public/shots/`:** screenshots from `pnpm screenshots` (`test-results/screenshots/`).
  - After a UI change, copy the new ones over and render again.
- **`public/fonts/`:** the app's Poppins, Inter and Noto Sans Telugu, all under the Open Font License.
- **`public/audio/`:**
  - `music.mp3`: original royalty-free background music, generated for this video with vidIQ.
  - `voiceover-en.mp3`: English AI voiceover, generated with vidIQ.
  - `new_order.wav`: the Shop Partner order alarm.

## Changing the voiceover

The scene timings follow the pauses in the voiceover. After replacing `voiceover-en.mp3`, list where each line starts:

```bash
ffmpeg -i public/audio/voiceover-en.mp3 -af silencedetect=noise=-35dB:d=0.35 -f null - 2>&1 | grep silence_
```

Then move the frames in `SCENES` so each scene starts just before its line (seconds × 30).

## Licence note

Remotion is free for individuals and companies of up to 3 people. Larger teams need a [company licence](https://www.remotion.pro).
