import { describe, expect, it } from 'vitest';
import { cleanFeedback } from './feedback-prompt';

describe('cleanFeedback', () => {
	it('trims whitespace and caps length', () => {
		expect(cleanFeedback('  Nice run.  ')).toBe('Nice run.');
		const long = cleanFeedback('x'.repeat(2000));
		expect(long.length).toBe(798);
		expect(long.endsWith('…')).toBe(true);
	});
});
