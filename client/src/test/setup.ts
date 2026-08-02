import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom implements no layout, so Element.scrollIntoView does not exist. A
// component that scrolls its panel into view would throw inside the effect and
// unmount the very thing under test, so stand it in as a no-op.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(cleanup);
