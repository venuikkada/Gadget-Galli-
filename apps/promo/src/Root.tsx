import { Composition, Still } from 'remotion';

import { FeatureGraphic } from './FeatureGraphic';
import { DURATION, FPS, Promo } from './Promo';

export function Root() {
  return (
    <>
      <Composition id="promo-en" component={Promo} defaultProps={{ lang: 'en' as const }} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
      <Composition id="promo-te" component={Promo} defaultProps={{ lang: 'te' as const }} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
      <Still id="feature-graphic" component={FeatureGraphic} width={1024} height={500} />
    </>
  );
}
