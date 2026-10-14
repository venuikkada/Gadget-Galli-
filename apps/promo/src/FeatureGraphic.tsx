import { AbsoluteFill, Img, staticFile } from 'remotion';

import { marigold, teal } from '@gg/shared';

import { BODY, HEADING, Logo } from './ui';

/** Play Store feature graphic, 1024 x 500. */
export function FeatureGraphic() {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${teal[700]} 0%, ${teal[900]} 70%, ${teal[950]} 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: 260, left: -200, top: -260, background: teal[500], opacity: 0.35, filter: 'blur(40px)' }} />
      <div style={{ position: 'absolute', left: 60, top: 92, display: 'flex', alignItems: 'center', gap: 22 }}>
        <Logo size={112} tile />
        <div style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 54, color: '#fff', letterSpacing: 3 }}>GADGET GALLI</div>
      </div>
      <div style={{ position: 'absolute', left: 62, top: 236, width: 560, fontFamily: HEADING, fontWeight: 700, fontSize: 40, lineHeight: 1.2, color: '#fff' }}>
        Compare prices from shops near you
      </div>
      <div style={{ position: 'absolute', left: 62, top: 350, fontFamily: BODY, fontWeight: 500, fontSize: 28, color: marigold[400] }}>
        Phones · Laptops · CCTV · Delivered today
      </div>
      {[
        { shot: 'o-03-compare', left: 650, top: 70, rotate: -6 },
        { shot: 'o-12-on-the-way', left: 820, top: 110, rotate: 6 },
      ].map((p) => (
        <div key={p.shot} style={{ position: 'absolute', left: p.left, top: p.top, width: 190, height: 400, borderRadius: 30, padding: 7, background: '#081517', transform: `rotate(${p.rotate}deg)`, boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}>
          <Img src={staticFile(`shots/${p.shot}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', borderRadius: 24 }} />
        </div>
      ))}
    </AbsoluteFill>
  );
}
