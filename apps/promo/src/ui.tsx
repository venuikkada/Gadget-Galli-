import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, continueRender, delayRender, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { marigold, teal } from '@gg/shared';

import { BRAND_MARK } from '../../mobile/src/shared/ui/brandMark';

// ---------------------------------------------------------------------------------------------------------------
// Fonts: the app's own Poppins (headings), Inter (body) and Noto Sans Telugu, loaded before the first frame.
// ---------------------------------------------------------------------------------------------------------------
const FONTS: [string, string, string][] = [
  ['Poppins', 'Poppins_700Bold.ttf', '700'],
  ['Poppins', 'Poppins_600SemiBold.ttf', '600'],
  ['Inter', 'Inter_500Medium.ttf', '500'],
  ['Noto Sans Telugu', 'NotoSansTelugu_700Bold.ttf', '700'],
  ['Noto Sans Telugu', 'NotoSansTelugu_600SemiBold.ttf', '600'],
];
if (typeof document !== 'undefined') {
  const handle = delayRender('fonts');
  Promise.all(
    FONTS.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => continueRender(handle));
}

export const HEADING = "Poppins, 'Noto Sans Telugu', sans-serif";
export const BODY = "Inter, 'Noto Sans Telugu', sans-serif";

/** Spring from 0 to 1 starting at `delay` frames. */
export function usePop(delay = 0, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } });
}

/** The teal brand background with two slowly drifting glows. */
export function Background() {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 45) * 40;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${teal[700]} 0%, ${teal[900]} 55%, ${teal[950]} 100%)` }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: 450, left: -380 + drift, top: -300, background: teal[500], opacity: 0.32, filter: 'blur(60px)' }} />
      <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: 350, right: -300 - drift, bottom: -120, background: marigold[500], opacity: 0.16, filter: 'blur(70px)' }} />
    </AbsoluteFill>
  );
}

/** The Gadget Galli mark (marigold bag, teal bolt), optionally on the rounded app-icon tile. */
export function Logo({ size, tile = false }: { size: number; tile?: boolean }) {
  const mark = (
    <>
      <path d={BRAND_MARK.handle} fill="none" stroke={marigold[600]} strokeWidth={BRAND_MARK.handleWidth} strokeLinecap="round" />
      <path d={BRAND_MARK.bag} fill="url(#gg-bag)" />
      <path d={BRAND_MARK.bolt} fill={teal[800]} stroke={teal[800]} strokeWidth={10} strokeLinejoin="round" />
    </>
  );
  return (
    <svg width={size} height={size} viewBox={BRAND_MARK.viewBox}>
      <defs>
        <linearGradient id="gg-bag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={marigold[400]} />
          <stop offset="1" stopColor={marigold[500]} />
        </linearGradient>
        <linearGradient id="gg-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={teal[500]} />
          <stop offset="0.55" stopColor={teal[700]} />
          <stop offset="1" stopColor={teal[900]} />
        </linearGradient>
      </defs>
      {tile ? (
        <>
          <rect width={1024} height={1024} rx={230} fill="url(#gg-tile)" />
          <g transform="translate(512 512) scale(1.1) translate(-512 -525)">{mark}</g>
        </>
      ) : (
        <g transform="translate(512 512) scale(1.5) translate(-512 -525)">{mark}</g>
      )}
    </svg>
  );
}

/** The small brand chip at the top of every app scene. */
export function BrandChip() {
  return (
    <div style={{ position: 'absolute', top: 92, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 26px 10px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.22)' }}>
        <Logo size={52} tile />
        <span style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 34, color: '#fff', letterSpacing: 2 }}>GADGET GALLI</span>
      </div>
    </div>
  );
}

/**
 * Big caption: the first line in white, the second in marigold. Words rise in one after another.
 * Telugu words are a bit longer, so the size steps down for long lines.
 */
export function Caption({ lines, top = 210, delay = 0 }: { lines: string[]; top?: number; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let w = 0;
  return (
    <div style={{ position: 'absolute', top, left: 70, right: 70, textAlign: 'center' }}>
      {lines.map((line, li) => {
        const size = line.length > 30 ? 62 : line.length > 22 ? 72 : 84;
        return (
          <div key={li} style={{ fontFamily: HEADING, fontWeight: li === 0 ? 700 : 600, fontSize: li === 0 ? size : size * 0.82, lineHeight: 1.22, color: li === 0 ? '#fff' : marigold[400], marginTop: li ? 14 : 0, textShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
            {line.split(' ').map((word, i) => {
              const p = spring({ frame: frame - delay - 3 * w++, fps, config: { damping: 15, mass: 0.6 } });
              return (
                <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 40}px)`, marginRight: '0.26em' }}>
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** A real app screenshot in a phone frame. Several shots cross-fade at the given frames. */
export function Phone({ shots, switchAt = [], top = 600, delay = 0 }: { shots: string[]; switchAt?: number[]; top?: number; delay?: number }) {
  const frame = useCurrentFrame();
  const enter = usePop(delay, 16);
  const width = 486;
  const height = Math.round((width - 32) * (1688 / 780)) + 32;
  const zoom = interpolate(frame, [0, 200], [1, 1.035], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: (1080 - width) / 2, top, width, height, transform: `translateY(${(1 - enter) * 700}px) scale(${zoom})`, borderRadius: 72, padding: 16, background: '#081517', boxShadow: '0 40px 90px rgba(0,0,0,0.45), 0 0 0 3px rgba(255,255,255,0.10)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 58, overflow: 'hidden', background: '#fff' }}>
        {shots.map((s, i) => {
          const start = i === 0 ? -1 : switchAt[i - 1];
          const opacity = i === 0 ? 1 : interpolate(frame, [start, start + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <Img key={s} src={staticFile(`shots/${s}.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity }} />;
        })}
      </div>
    </div>
  );
}

/** A pill callout that pops in beside the phone. */
export function Badge({ text, at, side, y, tone = 'gold' }: { text: string; at: number; side: 'left' | 'right'; y: number; tone?: 'gold' | 'white' | 'green' }) {
  const p = usePop(at, 11);
  const styles: Record<string, CSSProperties> = {
    gold: { background: marigold[400], color: teal[950] },
    white: { background: '#fff', color: teal[800] },
    green: { background: '#1F9D55', color: '#fff' },
  };
  return (
    <div style={{ position: 'absolute', [side]: 40, top: y, transform: `scale(${p}) rotate(${(1 - p) * (side === 'left' ? -8 : 8)}deg)`, opacity: Math.min(1, p * 1.5), ...styles[tone], fontFamily: HEADING, fontWeight: 700, fontSize: 38, padding: '16px 30px', borderRadius: 999, boxShadow: '0 18px 40px rgba(0,0,0,0.30)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 12 }}>
      {text}
    </div>
  );
}

/** Fades a scene in and out at its edges. */
export function SceneFade({ children, duration }: { children: ReactNode; duration: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, duration - 6, duration], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}
