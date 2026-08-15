import { describe, expect, it } from 'vitest';
import { approvalButtonTextPattern, generateButtonTextPattern, isDownloadControlReady, selectGenerateCandidateIndex } from '../src/flow-ui.js';

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

  it('selects exactly the Prompt Composer submit when two buttons contain Tạo', () => {
    expect(selectGenerateCandidateIndex([
      { icon: 'add_2', ariaHasPopup: 'dialog', ariaDisabled: null, text: 'add_2 Tạo' },
      { icon: 'arrow_forward', ariaHasPopup: null, ariaDisabled: 'true', text: 'arrow_forward Tạo' },
    ])).toBe(1);
  });

  it('recognizes approval without confusing it with Generate', () => {
    expect(approvalButtonTextPattern.test('Phê duyệt')).toBe(true);
    expect(approvalButtonTextPattern.test('Xác nhận')).toBe(true);
    expect(approvalButtonTextPattern.test('check Approve')).toBe(true);
    expect(approvalButtonTextPattern.test('Tạo')).toBe(false);
  });

  it('treats disabled and aria-disabled Download controls as rendering', () => {
    expect(isDownloadControlReady({ visible: true, enabled: false, disabledAttribute: '', ariaDisabled: null })).toBe(false);
    expect(isDownloadControlReady({ visible: true, enabled: true, disabledAttribute: null, ariaDisabled: 'true' })).toBe(false);
    expect(isDownloadControlReady({ visible: true, enabled: true, disabledAttribute: null, ariaDisabled: null })).toBe(true);
  });
});
