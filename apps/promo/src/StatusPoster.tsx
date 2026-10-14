import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';

import { marigold, teal } from '@gg/shared';

import { BODY, HEADING, Logo } from './ui';

/** "Coming soon" poster for WhatsApp Status, Instagram Stories and Reels, 1080 x 1920. */
type Lang = 'en' | 'te';

const TEXT: Record<Lang, {
  soon: string;
  tagline: string;
  deliver: string;
  categories: [string, string, string, string, string, string];
  chips: [string, string, string];
  allOver: string;
  developed: string;
}> = {
  en: {
    soon: 'COMING SOON',
    tagline: "Hyderabad's electronics shops, delivered to your door",
    deliver: 'We deliver every kind of electronics',
    categories: ['Mobiles', 'Laptops', 'Computers', 'CCTV', 'Computer peripherals', 'Mobile gadgets'],
    chips: ['Compare prices', 'Call or WhatsApp', 'Pay by UPI'],
    allOver: 'All over Hyderabad',
    developed: 'Developed by',
  },
  te: {
    soon: 'త్వరలో వస్తోంది',
    tagline: 'హైదరాబాద్ ఎలక్ట్రానిక్స్ షాపులు, మీ ఇంటి వద్దకే',
    deliver: 'అన్ని రకాల ఎలక్ట్రానిక్స్ డెలివరీ',
    categories: ['మొబైల్స్', 'లాప్టాప్స్', 'కంప్యూటర్స్', 'CCTV', 'కంప్యూటర్ పెరిఫెరల్స్', 'మొబైల్ గాడ్జెట్స్'],
    chips: ['ధరలు పోల్చండి', 'కాల్ లేదా WhatsApp', 'UPI తో చెల్లింపు'],
    allOver: 'హైదరాబాద్ అంతటా',
    developed: 'డెవలప్ చేసినవారు',
  },
};

const AREAS = ['Kukatpally', 'Ameerpet', 'Madhapur', 'Secunderabad', 'LB Nagar'];

/** 24 x 24 line icons, one per category. */
const ICONS: ReactNode[] = [
  // Mobiles
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
    <path d="M10.5 18.5h3" />
  </>,
  // Laptops
  <>
    <rect x="4.5" y="5" width="15" height="10.5" rx="1.4" />
    <path d="M2.5 18.5h19" />
  </>,
  // Computers
  <>
    <rect x="3" y="3.5" width="18" height="12.5" rx="1.5" />
    <path d="M9 20.5h6M12 16v4.5" />
  </>,
  // CCTV
  <>
    <path d="M3 8.2 15.6 4.6l2 6.6L5 14.8z" />
    <path d="M17.6 8.6 21 7.7v4.4l-2.6.7" />
    <path d="M8.2 13.9 9 17.5H4.5M4.5 15.2v5.3" />
  </>,
  // Computer peripherals (keyboard)
  <>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <path d="M6.2 10h.01M9.4 10h.01M12.6 10h.01M15.8 10h.01M18 10h.01M7.5 14h9" />
  </>,
  // Mobile gadgets (headphones)
  <>
    <path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3" />
    <rect x="3" y="14" width="4.5" height="6.5" rx="1.6" />
    <rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6" />
  </>,
];

function Icon({ children, size, color, width = 1.6 }: { children: ReactNode; size: number; color: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function Sparkle({ x, y, size, opacity = 1 }: { x: number; y: number; size: number; opacity?: number }) {
  return (
    <svg style={{ position: 'absolute', left: x, top: y, opacity }} width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5-8.5-2 8.5-2z" fill={marigold[300]} />
    </svg>
  );
}

const glass = { background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.20)', boxShadow: '0 20px 50px rgba(0,0,0,0.18)' };

export function StatusPoster({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  const te = lang === 'te';
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, #2A9D9E 0%, ${teal[700]} 38%, ${teal[900]} 78%, ${teal[950]} 100%)`, overflow: 'hidden', color: '#fff' }}>
      {/* Soft glows and a fine dot pattern */}
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: 450, left: -420, top: -380, background: '#5FC0C1', opacity: 0.35, filter: 'blur(80px)' }} />
      <div style={{ position: 'absolute', width: 760, height: 760, borderRadius: 380, right: -380, top: 820, background: marigold[500], opacity: 0.14, filter: 'blur(90px)' }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1.6px, transparent 1.6px)', backgroundSize: '34px 34px', opacity: 0.6 }} />

      {/* Coming soon */}
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', background: `linear-gradient(90deg, ${marigold[300]}, ${marigold[500]})`, color: teal[950], fontFamily: HEADING, fontWeight: 700, fontSize: te ? 50 : 52, letterSpacing: te ? 2 : 12, padding: te ? '18px 54px 14px' : '20px 52px 18px 64px', borderRadius: 999, boxShadow: `0 0 60px ${marigold[500]}88, 0 18px 40px rgba(0,0,0,0.25)` }}>
          {t.soon}
        </div>
      </div>
      <Sparkle x={168} y={96} size={46} />
      <Sparkle x={862} y={176} size={34} opacity={0.85} />
      <Sparkle x={930} y={92} size={20} opacity={0.7} />
      <Sparkle x={120} y={210} size={18} opacity={0.6} />

      {/* Brand */}
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 280, height: 280, borderRadius: 76, ...glass, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Logo size={250} />
        </div>
        <div style={{ marginTop: 34, fontFamily: HEADING, fontWeight: 700, fontSize: 132, lineHeight: 1, letterSpacing: -1 }}>
          Gadget <span style={{ color: marigold[400] }}>Galli</span>
        </div>
        <div style={{ marginTop: 26, width: 860, textAlign: 'center', fontFamily: BODY, fontWeight: 500, fontSize: te ? 40 : 44, lineHeight: 1.35, color: 'rgba(255,255,255,0.92)' }}>{t.tagline}</div>
      </div>

      {/* Categories */}
      <div style={{ position: 'absolute', top: 935, left: 0, right: 0, textAlign: 'center', fontFamily: HEADING, fontWeight: 600, fontSize: te ? 42 : 46, color: marigold[300] }}>{t.deliver}</div>
      <div style={{ position: 'absolute', top: 1020, left: 60, right: 60, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
        {t.categories.map((label, i) => (
          <div key={label} style={{ height: 214, borderRadius: 34, ...glass, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 14px' }}>
            <div style={{ width: 96, height: 96, borderRadius: 30, background: `linear-gradient(140deg, ${marigold[300]}, ${marigold[500]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(0,0,0,0.18)' }}>
              <Icon size={60} color={teal[900]} width={1.7}>{ICONS[i]}</Icon>
            </div>
            <div style={{ fontFamily: HEADING, fontWeight: 600, fontSize: label.length > 14 ? 30 : 34, lineHeight: 1.15, textAlign: 'center' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ position: 'absolute', top: 1522, left: 40, right: 40, display: 'flex', justifyContent: 'center', gap: 16 }}>
        {t.chips.map((c) => (
          <div key={c} style={{ fontFamily: BODY, fontWeight: 500, fontSize: te ? 28 : 30, color: teal[950], background: '#fff', borderRadius: 999, padding: '14px 24px', whiteSpace: 'nowrap', boxShadow: '0 10px 26px rgba(0,0,0,0.18)' }}>{c}</div>
        ))}
      </div>

      {/* All over Hyderabad */}
      <div style={{ position: 'absolute', top: 1622, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: HEADING, fontWeight: 700, fontSize: 48 }}>
          <Icon size={50} color={marigold[400]} width={2}>
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </Icon>
          {t.allOver}
        </div>
        <div style={{ width: 1000, textAlign: 'center', fontFamily: BODY, fontWeight: 500, fontSize: 27, lineHeight: 1.45, color: 'rgba(255,255,255,0.72)' }}>{AREAS.join(' · ')} & more</div>
      </div>

      {/* Developer credit */}
      <div style={{ position: 'absolute', bottom: 64, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 999, padding: '14px 34px', background: 'rgba(3,40,44,0.55)', border: '1.5px solid rgba(255,255,255,0.18)' }}>
          <span style={{ fontFamily: BODY, fontWeight: 500, fontSize: 28, color: 'rgba(255,255,255,0.75)' }}>{t.developed}</span>
          <span style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 32, color: marigold[300], letterSpacing: 0.5 }}>Venu Brushwood</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
