import { describe, expect, it } from 'vitest';
import type { PaceTable, RunDetails, Step } from '../plan/runs';
import { hardMinutes, validateProposal, type ProposalRow } from './proposal';

const paces: PaceTable = {
	easy: 340,
	marathon: 287,
	threshold: 270,
	interval: 248,
	strides: 230,
	jog: 380,
	goal: 284
};
const ctx = { today: '2026-11-09', raceDay: '2027-04-11', paces };
const easy: RunDetails = {
	kind: 'run',
	km: 10,
	purpose: '',
	steps: [{ kind: 'steady', km: 10, pace: 'easy' }]
};
const row = (id: number, extra: Partial<ProposalRow> = {}): ProposalRow => ({
	id,
	date: '2026-11-11',
	kind: 'run',
	type: 'quality',
	title: 'Easy + 8 strides',
	phase: 'base',
	details: easy,
	skipped: false,
	...extra
});
const tempo: Step[] = [
	{ kind: 'warmup', km: 2, pace: 'easy' },
	{
		kind: 'repeat',
		reps: 3,
		steps: [
			{ kind: 'work', minutes: 8, pace: 'threshold' },
			{ kind: 'recover', minutes: 2, pace: 'jog' }
		]
	},
	{ kind: 'cooldown', km: 2, pace: 'easy' }
];

describe('validateProposal', () => {
	it('accepts a tempo swap and works out its distance', () => {
		const { patches, errors } = validateProposal(
			[
				{
					op: 'replace_run',
					session_id: 1,
					title: 'Tempo 3 × 8 min',
					purpose: 'Earlier tempo',
					steps: tempo
				}
			],
			[row(1)],
			ctx
		);
		expect(errors).toEqual([]);
		expect(patches[0].title).toBe('Tempo 3 × 8 min');
		expect((patches[0].details as RunDetails).km).toBeGreaterThan(8);
	});

	it('rejects past, unknown and race-day sessions', () => {
		const rows = [row(1, { date: '2026-11-01' }), row(2, { type: 'race' })];
		const { patches, errors } = validateProposal(
			[
				{ op: 'skip', session_id: 1 },
				{ op: 'skip', session_id: 2 },
				{ op: 'skip', session_id: 3 }
			],
			rows,
			ctx
		);
		expect(patches).toEqual([]);
		expect(errors).toHaveLength(3);
	});

	it('protects the taper from scaling and replacement, and bounds moves', () => {
		const taper = row(1, { phase: 'taper', type: 'easy' });
		expect(
			validateProposal([{ op: 'scale', session_id: 1, factor: 0.8 }], [taper], ctx).errors
		).toHaveLength(1);
		expect(
			validateProposal([{ op: 'move', session_id: 1, date: '2027-04-11' }], [taper], ctx).errors
		).toHaveLength(1);
	});

	it('limits scale, jumps in distance and hard minutes', () => {
		const e = row(1, { type: 'easy' });
		expect(
			validateProposal([{ op: 'scale', session_id: 1, factor: 2 }], [e], ctx).errors
		).toHaveLength(1);
		const huge: Step[] = [{ kind: 'steady', km: 30, pace: 'easy' }];
		expect(
			validateProposal(
				[{ op: 'replace_run', session_id: 1, title: 'x', purpose: '', steps: huge }],
				[e],
				ctx
			).errors[0]
		).toContain('too big');
		const hard: Step[] = [
			{ kind: 'repeat', reps: 6, steps: [{ kind: 'work', minutes: 10, pace: 'interval' }] }
		];
		expect(hardMinutes(hard, paces)).toBe(60);
		expect(
			validateProposal(
				[{ op: 'replace_run', session_id: 1, title: 'x', purpose: '', steps: hard }],
				[e],
				ctx
			).errors
		).toHaveLength(1);
	});

	it('rejects malformed workouts', () => {
		const bad = [{ kind: 'work', pace: 'sprint', km: 1 }] as unknown as Step[];
		expect(
			validateProposal(
				[{ op: 'replace_run', session_id: 1, title: 'x', purpose: '', steps: bad }],
				[row(1)],
				ctx
			).errors
		).toHaveLength(1);
	});
});
