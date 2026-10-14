import { Composition, Still } from 'remotion';

import { FeatureGraphic } from './FeatureGraphic';
import { DURATION, FPS, Promo } from './Promo';
import { StatusPoster } from './StatusPoster';

export function Root() {
  return (
    <>
      <Composition id="promo-en" component={Promo} defaultProps={{ lang: 'en' as const }} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
      <Composition id="promo-te" component={Promo} defaultProps={{ lang: 'te' as const }} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
      <Still id="feature-graphic" component={FeatureGraphic} width={1024} height={500} />
      <Still id="status-poster-en" component={StatusPoster} defaultProps={{ lang: 'en' as const }} width={1080} height={1920} />
      <Still id="status-poster-te" component={StatusPoster} defaultProps={{ lang: 'te' as const }} width={1080} height={1920} />
    </>
  );
}
