import { describe, expect, it } from 'vitest';
import { generateButtonTextPattern } from '../src/flow-ui.js';

describe('Google Flow control detection', () => {
  it('recognizes the current add_2 Generate label and legacy labels', () => {
    expect(generateButtonTextPattern.test('add_2Tạo')).toBe(true);
    expect(generateButtonTextPattern.test('add_2 Tạo')).toBe(true);
    expect(generateButtonTextPattern.test('arrow_forward Generate')).toBe(true);
    expect(generateButtonTextPattern.test('Tạo video')).toBe(true);
  });

  it('does not mistake the model selector for Generate', () => {
    expect(generateButtonTextPattern.test('Video · 8s crop_9_16 x1')).toBe(false);
  });
});
