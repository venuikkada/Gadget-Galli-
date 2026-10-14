import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';

import { marigold, teal } from '@gg/shared';

import { CAPTIONS, type Lang } from './captions';
import { Background, Badge, BrandChip, Caption, HEADING, Logo, Phone, SceneFade, usePop } from './ui';

export const FPS = 30;

/**
 * Scene boundaries in frames. They follow the voiceover (public/audio/voiceover-en.mp3): each scene starts just
 * before its line, found from the pauses with ffmpeg silencedetect (see README.md).
 */
const SCENES = [0, 108, 300, 387, 489, 645, 786, 894, 1080] as const;
export const DURATION = SCENES[SCENES.length - 1];
/** The voiceover ends at 32.6 s; the music comes up after it. */
const VO_END = 980;

function scene(i: number) {
  return { from: SCENES[i], durationInFrames: SCENES[i + 1] - SCENES[i] };
}

export function Promo({ lang }: { lang: Lang }) {
  const c = CAPTIONS[lang];
  const b = c.badges;
  const s = scene;
  return (
    <AbsoluteFill style={{ backgroundColor: teal[950] }}>
      <Background />

      <Sequence {...s(0)}>
        <SceneFade duration={s(0).durationInFrames}>
          <Hook text={c.hook} />
        </SceneFade>
      </Sequence>

      <Sequence {...s(1)}>
        <SceneFade duration={s(1).durationInFrames}>
          <BrandChip />
          <Caption lines={c.compare} />
          <Phone shots={lang === 'te' ? ['c-telugu', 'o-03-compare'] : ['o-02-search', 'o-03-compare']} switchAt={[70]} />
          <Badge text={b.best} at={80} side="left" y={980} />
          <Badge text={b.fastest} at={100} side="right" y={1180} tone="white" />
        </SceneFade>
      </Sequence>

      <Sequence {...s(2)}>
        <SceneFade duration={s(2).durationInFrames}>
          <BrandChip />
          <Caption lines={[c.order]} />
          <Phone shots={['o-04-cart', 'o-05-requested']} switchAt={[45]} delay={0} />
        </SceneFade>
      </Sequence>

      <Sequence {...s(3)}>
        <SceneFade duration={s(3).durationInFrames}>
          <BrandChip />
          <Caption lines={[c.shop]} />
          <Phone shots={['o-06-alarm', 'o-08-accept']} switchAt={[55]} />
          <Badge text={b.newOrder} at={8} side="right" y={860} />
          <Badge text={b.accepted} at={60} side="left" y={1260} tone="green" />
        </SceneFade>
        <Sequence durationInFrames={45}>
          <Audio src={staticFile('audio/new_order.wav')} volume={0.3} />
        </Sequence>
      </Sequence>

      <Sequence {...s(4)}>
        <SceneFade duration={s(4).durationInFrames}>
          <BrandChip />
          <Caption lines={c.pay} />
          <Phone shots={['o-09-pay', 'o-12-on-the-way']} switchAt={[90]} />
          <Badge text={b.cod} at={20} side="left" y={960} />
          <Badge text={b.upi} at={34} side="right" y={1110} tone="white" />
          <Badge text={b.onTheWay} at={96} side="right" y={1360} tone="green" />
        </SceneFade>
      </Sequence>

      <Sequence {...s(5)}>
        <SceneFade duration={s(5).durationInFrames}>
          <BrandChip />
          <Caption lines={c.trust} />
          <Phone shots={['o-13-delivered']} />
          <Badge text={b.bill} at={24} side="left" y={1000} />
          <Badge text={b.verified} at={44} side="right" y={1240} tone="white" />
        </SceneFade>
      </Sequence>

      <Sequence {...s(6)}>
        <SceneFade duration={s(6).durationInFrames}>
          <BrandChip />
          <Caption lines={c.partner} />
          <Phone shots={['p-dashboard', 'p-qr']} switchAt={[54]} />
          <Badge text={b.free} at={14} side="left" y={980} />
          <Badge text={b.qr} at={60} side="right" y={1260} tone="white" />
        </SceneFade>
      </Sequence>

      <Sequence {...s(7)}>
        <SceneFade duration={s(7).durationInFrames}>
          <CallToAction title={c.cta[0]} tagline={c.cta[1]} play={c.play} />
        </SceneFade>
      </Sequence>

      <Audio src={staticFile('audio/voiceover-en.mp3')} volume={1} />
      <Audio
        src={staticFile('audio/music.mp3')}
        volume={(f) =>
          interpolate(f, [0, 10, VO_END - 10, VO_END + 15, DURATION - 45, DURATION - 2], [0, 0.22, 0.22, 0.7, 0.7, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
    </AbsoluteFill>
  );
}

function Hook({ text }: { text: string }) {
  const logo = usePop(2, 10);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 440, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${logo}) rotate(${(1 - logo) * -20}deg)` }}>
        <Logo size={330} tile />
      </div>
      <div style={{ position: 'absolute', top: 820, left: 0, right: 0, textAlign: 'center', fontFamily: HEADING, fontWeight: 700, fontSize: 64, letterSpacing: 6, color: marigold[400], opacity: logo }}>GADGET GALLI</div>
      <Caption lines={[text]} top={980} delay={14} />
    </AbsoluteFill>
  );
}

function CallToAction({ title, tagline, play }: { title: string; tagline: string; play: string }) {
  const logo = usePop(0, 11);
  const button = usePop(22, 12);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${logo})` }}>
        <Logo size={300} tile />
      </div>
      <div style={{ position: 'absolute', top: 650, left: 0, right: 0, textAlign: 'center', fontFamily: HEADING, fontWeight: 700, fontSize: 92, letterSpacing: 6, color: '#fff', opacity: logo }}>GADGET GALLI</div>
      <Caption lines={[title, tagline]} top={800} delay={8} />
      <div style={{ position: 'absolute', top: 1260, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${button})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, background: '#fff', borderRadius: 999, padding: '30px 56px', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
          <div style={{ width: 0, height: 0, borderTop: '26px solid transparent', borderBottom: '26px solid transparent', borderLeft: `42px solid ${teal[700]}` }} />
          <span style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 52, color: teal[800] }}>{play}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
