/** On-screen text for each language. The voiceover is English in both versions (public/audio/voiceover-en.mp3). */
export type Lang = 'en' | 'te';

export interface Captions {
  hook: string;
  compare: [string, string];
  order: string;
  shop: string;
  pay: [string, string];
  trust: [string, string];
  partner: [string, string];
  cta: [string, string];
  play: string;
  badges: {
    best: string;
    fastest: string;
    newOrder: string;
    accepted: string;
    cod: string;
    upi: string;
    onTheWay: string;
    verified: string;
    bill: string;
    free: string;
    qr: string;
  };
}

export const CAPTIONS: Record<Lang, Captions> = {
  en: {
    hook: 'Need a phone, laptop or CCTV today?',
    compare: ['Compare prices from shops near you', 'Pick the best deal'],
    order: 'Order in just 2 taps',
    shop: 'The shop gets your order instantly',
    pay: ['Pay on delivery or UPI', 'Track it to your door'],
    trust: ['Genuine bill & warranty', 'from verified local shops'],
    partner: ['Own a shop?', 'Sell online for free'],
    cta: ['Download free on Google Play', "Hyderabad's local electronics market"],
    play: 'Get it on Google Play',
    badges: {
      best: 'Best price',
      fastest: 'Fastest delivery',
      newOrder: 'New order!',
      accepted: 'Accepted',
      cod: 'Pay on delivery',
      upi: 'UPI',
      onTheWay: 'On the way',
      verified: 'Verified shops',
      bill: 'Bill + warranty',
      free: 'Free to join',
      qr: 'Shop QR poster',
    },
  },
  te: {
    hook: 'ఫోన్, లాప్టాప్ లేదా CCTV ఈరోజే కావాలా?',
    compare: ['మీ దగ్గరి షాపుల ధరలు పోల్చండి', 'బెస్ట్ డీల్ ఎంచుకోండి'],
    order: 'కేవలం 2 ట్యాప్స్ లో ఆర్డర్',
    shop: 'మీ ఆర్డర్ వెంటనే షాప్ కి చేరుతుంది',
    pay: ['డెలివరీ తర్వాత లేదా UPI తో చెల్లించండి', 'మీ ఇంటి వరకు ట్రాక్ చేయండి'],
    trust: ['అసలైన బిల్ & వారంటీ', 'వెరిఫైడ్ లోకల్ షాపుల నుండి'],
    partner: ['మీకు షాప్ ఉందా?', 'ఉచితంగా ఆన్లైన్ లో అమ్మండి'],
    cta: ['Google Play లో ఉచితంగా డౌన్లోడ్ చేయండి', 'హైదరాబాద్ లోకల్ ఎలక్ట్రానిక్స్ మార్కెట్'],
    play: 'Google Play లో పొందండి',
    badges: {
      best: 'బెస్ట్ ధర',
      fastest: 'వేగవంతమైన డెలివరీ',
      newOrder: 'కొత్త ఆర్డర్!',
      accepted: 'అంగీకరించారు',
      cod: 'డెలివరీపై చెల్లింపు',
      upi: 'UPI',
      onTheWay: 'దారిలో ఉంది',
      verified: 'వెరిఫైడ్ షాపులు',
      bill: 'బిల్ + వారంటీ',
      free: 'ఉచితంగా చేరండి',
      qr: 'షాప్ QR పోస్టర్',
    },
  },
};
