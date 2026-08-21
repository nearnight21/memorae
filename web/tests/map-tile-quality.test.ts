import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetinaMapExperimentEnabled } from '../src/lib/mapTileQuality';

test('retina map experiment is opt-in', () => {
  assert.equal(isRetinaMapExperimentEnabled(''), false);
  assert.equal(isRetinaMapExperimentEnabled('?map-retina=0'), false);
  assert.equal(isRetinaMapExperimentEnabled('?map-retina=true'), false);
  assert.equal(isRetinaMapExperimentEnabled('?map-retina=1'), true);
  assert.equal(isRetinaMapExperimentEnabled('?view=places&map-retina=1'), true);
});
