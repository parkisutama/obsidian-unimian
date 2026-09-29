import { describe, expect, it, vi } from 'vitest';
import type { GanttDependencyChange, GanttTaskMoveChange, Task } from '@jaeungkim/gantt-chart';
import { GanttWriteBack } from '../src/views/gantt/writeBack';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
	id, name: id, startDate: '2026-10-01', endDate: '2026-10-03', parentId: null, sequence: '1', ...overrides,
});

function harness(overrides: Record<string, unknown> = {}) {
	const date = { updateRange: vi.fn().mockResolvedValue({ ok: true }) };
	const property = { setProperty: vi.fn().mockResolvedValue({ ok: true }), setProperties: vi.fn().mockResolvedValue({ ok: true }) };
	const dependency = { setDependencies: vi.fn().mockResolvedValue({ ok: true }) };
	const revertTasks = vi.fn();
	const renderTasks = vi.fn();
	const notice = vi.fn();
	const gate = { begin: vi.fn(), end: vi.fn() };
	const before = [task('Tasks/A.md', { progress: 20 }), task('Tasks/B.md', { sequence: '2' })];
	const writer = new GanttWriteBack(before, {
		mutations: { date, property, dependency },
		properties: {
			start: { id: 'note.start', type: 'date' }, end: { id: 'note.end', type: 'date' },
			progress: 'note.progress', parent: 'note.parent', order: 'note.order', dependsOn: 'note.depends_on',
			currentOrder: new Map([['Tasks/A.md', 10], ['Tasks/B.md', 20]]), currentDependsOn: new Map(),
		},
		revertTasks, renderTasks, notice, gate,
		...overrides,
	});
	return { writer, before, date, property, dependency, revertTasks, renderTasks, notice, gate };
}

describe('Gantt write-back (GBETA-010)', () => {
	it('routes date and progress changes to the exact scoped capabilities', async () => {
		const h = harness();
		await h.writer.onTasksChange([
			{ ...h.before[0]!, startDate: '2026-10-02', endDate: '2026-10-06', progress: 35 }, h.before[1]!,
		]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-05');
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', { 'note.progress': 35 });
		expect(h.dependency.setDependencies).not.toHaveBeenCalled();
	});

	// The real library reports every edited date as `toISOString()`, never as the plain strings the
	// other tests feed in. Both storage types must survive that, in any local time zone.
	it('persists the ISO strings the library emits for a moved Date task', async () => {
		const h = harness();
		await h.writer.onTasksChange([
			{ ...h.before[0]!, startDate: '2026-10-02T00:00:00.000Z', endDate: '2026-10-05T00:00:00.000Z' }, h.before[1]!,
		]);

		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-04');
	});

	it('canonicalizes sub-day Date gestures before rendering and scheduling', async () => {
		const h = harness({ dependencyPolicy: 'overlap' });
		const before = [
			task('Tasks/A.md', { startDate: '2026-10-01', endDate: '2026-10-04' }),
			task('Tasks/B.md', { startDate: '2026-10-04', endDate: '2026-10-07', sequence: '2',
				dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }),
		];
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange([
			{ ...before[0]!, startDate: '2026-10-02T06:00:00.000Z', endDate: '2026-10-05T06:00:00.000Z' },
			before[1]!,
		]);

		expect(h.writer.tasks[0]).toMatchObject({ startDate: '2026-10-02', endDate: '2026-10-05' });
		expect(h.writer.tasks[1]).toMatchObject({ startDate: '2026-10-05', endDate: '2026-10-08' });
		expect(h.renderTasks).toHaveBeenCalledWith(h.writer.tasks);
	});

	it('persists a moved Date & time task at the same wall-clock time in a non-UTC zone', async () => {
		const original = process.env.TZ;
		process.env.TZ = 'Asia/Jakarta';
		try {
			const h = harness();
			h.writer.replaceProperties({
				start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
			});
			h.writer.replaceBaseline([task('Tasks/A.md', { startDate: '2026-10-01T09:00', endDate: '2026-10-01T10:30' })]);
			await h.writer.onTasksChange([
				task('Tasks/A.md', { startDate: '2026-10-02T09:00:00.000Z', endDate: '2026-10-02T10:30:00.000Z' }),
			]);

			expect(h.date.updateRange).toHaveBeenCalledWith(
				'Tasks/A.md', 'note.start', '2026-10-02T09:00', 'note.end', '2026-10-02T10:30',
			);
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});

	it('keeps hour-level movement only at Hours resolution', async () => {
		const h = harness({ scale: 'day' });
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
		});
		h.writer.replaceBaseline([task('Tasks/A.md', {
			startDate: '2026-10-01T09:00', endDate: '2026-10-01T10:30',
		})]);

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-10-01T11:00', endDate: '2026-10-01T12:30',
		})]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-01T11:00', 'note.end', '2026-10-01T12:30',
		);
	});

	it('snaps Date & time movement to whole days while preserving wall time and duration', async () => {
		const h = harness({ scale: 'week' });
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
		});
		h.writer.replaceBaseline([task('Tasks/A.md', {
			startDate: '2026-10-01T09:15', endDate: '2026-10-01T10:45',
		})]);

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-10-02T03:15:00.000Z', endDate: '2026-10-02T04:45:00.000Z',
		})]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-02T09:15', 'note.end', '2026-10-02T10:45',
		);
	});

	it('renders the snapped baseline back when a sub-day gesture rounds to no movement', async () => {
		const h = harness({ scale: 'week' });
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
		});
		const before = [task('Tasks/A.md', {
			startDate: '2026-10-01T09:00', endDate: '2026-10-01T10:00',
		})];
		h.writer.replaceBaseline(before);

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-10-01T15:00', endDate: '2026-10-01T16:00',
		})]);

		expect(h.date.updateRange).not.toHaveBeenCalled();
		expect(h.renderTasks).toHaveBeenCalledWith(expect.arrayContaining([
			expect.objectContaining({ startDate: '2026-10-01T09:00', endDate: '2026-10-01T10:00' }),
		]));
	});

	it('snaps Date & time movement to whole weeks at Weeks resolution', async () => {
		const h = harness({ scale: 'month' });
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
		});
		h.writer.replaceBaseline([task('Tasks/A.md', {
			startDate: '2026-10-01T09:00', endDate: '2026-10-02T09:00',
		})]);

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-10-05T09:00', endDate: '2026-10-06T09:00',
		})]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-08T09:00', 'note.end', '2026-10-09T09:00',
		);
	});

	it('keeps an exact detail-panel date edit independent of the visible resolution', async () => {
		const h = harness({ scale: 'month' });
		h.writer.replaceBaseline([task('Tasks/A.md', { startDate: '2026-10-01', endDate: '2026-10-03' })]);
		h.writer.onExactDateUpdate('Tasks/A.md', 'end', 'date');

		await h.writer.onTasksChange([task('Tasks/A.md', { startDate: '2026-10-01', endDate: '2026-10-04' })]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-01', 'note.end', '2026-10-03',
		);
	});

	it('persists a detail-panel End as Date & time when a mixed range is promoted', async () => {
		const h = harness({ scale: 'month' });
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'date' },
			dateTypes: new Map([['Tasks/A.md', { start: 'datetime', end: 'date' }]]),
		});
		h.writer.replaceBaseline([task('Tasks/A.md', { startDate: '2026-09-21T23:00', endDate: '2026-09-22T00:00' })]);
		h.writer.onExactDateUpdate('Tasks/A.md', 'end', 'datetime');

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-09-21T23:00', endDate: '2026-09-22T01:00:00.000Z',
		})]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-09-21T23:00', 'note.end', '2026-09-22T01:00',
		);
	});

	it('snaps coarser Date & time movement by calendar month without changing the hour', async () => {
		const h = harness({ scale: 'quarter' });
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
		});
		h.writer.replaceBaseline([task('Tasks/A.md', {
			startDate: '2026-01-31T09:00', endDate: '2026-02-01T09:00',
		})]);

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-02-20T09:00', endDate: '2026-02-21T09:00',
		})]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-02-28T09:00', 'note.end', '2026-03-01T09:00',
		);
	});

	it('keeps Date properties on whole-day boundaries even at Hours resolution', async () => {
		const h = harness({ scale: 'day' });
		await h.writer.onTasksChange([
			{ ...h.before[0]!, startDate: '2026-10-02T01:00:00.000Z', endDate: '2026-10-04T01:00:00.000Z' },
			h.before[1]!,
		]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03',
		);
	});

	it('uses the date capability for an end-only resize and keeps the existing start', async () => {
		const h = harness();
		await h.writer.onTasksChange([{ ...h.before[0]!, endDate: '2026-10-06' }, h.before[1]!]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-01', 'note.end', '2026-10-05',
		);
		expect(h.property.setProperty).not.toHaveBeenCalled();
	});

	it('rejects a Date range whose inclusive end would precede its start', async () => {
		const h = harness();
		await h.writer.onTasksChange([{ ...h.before[0]!, startDate: '2026-10-03', endDate: '2026-10-03' }, h.before[1]!]);

		expect(h.date.updateRange).not.toHaveBeenCalled();
		expect(h.revertTasks).toHaveBeenCalledWith(h.before);
		expect(h.notice).toHaveBeenCalledWith('Could not save Tasks/A.md: end must not be earlier than start.');
		expect(h.writer.tasks).toBe(h.before);
	});

	it('allows a progress-only edit when the existing note already has a reversed range', async () => {
		const h = harness();
		const before = [task('Tasks/A.md', {
			startDate: '2026-10-03', endDate: '2026-10-03', progress: 20,
		})];
		h.writer.replaceBaseline(before);

		await h.writer.onTasksChange([{ ...before[0]!, progress: 45 }]);

		expect(h.date.updateRange).not.toHaveBeenCalled();
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', { 'note.progress': 45 });
		expect(h.revertTasks).not.toHaveBeenCalled();
		expect(h.notice).not.toHaveBeenCalled();
	});

	it('rejects reversed Date & time ranges but permits a zero-duration milestone', async () => {
		const h = harness();
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'datetime' },
		});
		h.writer.replaceBaseline([task('Tasks/A.md', { startDate: '2026-10-01T09:00', endDate: '2026-10-01T10:00' })]);

		await h.writer.onTasksChange([task('Tasks/A.md', { startDate: '2026-10-01T11:00', endDate: '2026-10-01T10:00' })]);
		expect(h.date.updateRange).not.toHaveBeenCalled();
		expect(h.revertTasks).toHaveBeenCalledOnce();

		await h.writer.onTasksChange([task('Tasks/A.md', { startDate: '2026-10-01T11:00', endDate: '2026-10-01T11:00' })]);
		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-01T11:00', 'note.end', '2026-10-01T11:00',
		);
	});

	it('validates a mixed Date & time start and Date end by the exclusive end boundary', async () => {
		const h = harness();
		h.writer.replaceProperties({
			start: { id: 'note.start', type: 'datetime' }, end: { id: 'note.end', type: 'date' },
			dateTypes: new Map([['Tasks/A.md', { start: 'datetime', end: 'date' }]]),
		});
		h.writer.replaceBaseline([task('Tasks/A.md', {
			startDate: '2026-10-01T12:00', endDate: '2026-10-02',
		})]);

		await h.writer.onTasksChange([task('Tasks/A.md', {
			startDate: '2026-10-02T12:00', endDate: '2026-10-03',
		})]);

		expect(h.date.updateRange).toHaveBeenCalledWith(
			'Tasks/A.md', 'note.start', '2026-10-02T12:00', 'note.end', '2026-10-02',
		);
		expect(h.notice).not.toHaveBeenCalled();
	});

	it('does not validate a moved phase summary when phase-date writing is disabled', async () => {
		const before = [
			task('Phase.md', { startDate: '2026-10-01', endDate: '2026-10-03' }),
			task('Child.md', { parentId: 'Phase.md', sequence: '1.1' }),
		];
		const h = harness({ writePhaseDates: false, dependencyPolicy: 'maintain-gap' });
		h.writer.replaceBaseline(before);

		await h.writer.onTasksChange([
			{ ...before[0]!, startDate: '2026-10-05', endDate: '2026-10-05' },
			{ ...before[1]!, startDate: '2026-10-05', endDate: '2026-10-07' },
		]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.date.updateRange).toHaveBeenCalledWith('Child.md', 'note.start', '2026-10-05', 'note.end', '2026-10-06');
		expect(h.revertTasks).not.toHaveBeenCalled();
		expect(h.notice).not.toHaveBeenCalled();
	});

	it('rebuilds a clamped Date phase from normalized descendants before validating the batch', async () => {
		const before = [
			task('Phase.md', { startDate: '2026-09-19', endDate: '2026-09-21' }),
			task('Child.md', { parentId: 'Phase.md', sequence: '1.1', startDate: '2026-09-19', endDate: '2026-09-21' }),
		];
		const h = harness({ writePhaseDates: true, scale: 'day' });
		h.writer.replaceBaseline(before);

		await h.writer.onTasksChange([
			{ ...before[0]!, startDate: '2026-09-20T11:25:00.000Z', endDate: '2026-09-20T12:30:00.000Z' },
			{ ...before[1]!, startDate: '2026-09-20T00:00:00.000Z', endDate: '2026-09-22T00:00:00.000Z' },
		]);

		expect(h.revertTasks).not.toHaveBeenCalled();
		expect(h.notice).not.toHaveBeenCalled();
		expect(h.date.updateRange).toHaveBeenCalledWith('Phase.md', 'note.start', '2026-09-20', 'note.end', '2026-09-21');
		expect(h.date.updateRange).toHaveBeenCalledWith('Child.md', 'note.start', '2026-09-20', 'note.end', '2026-09-21');
		expect(h.writer.tasks[0]).toMatchObject({ startDate: '2026-09-20', endDate: '2026-09-22' });
	});

	it('rejects a reversed task draft before note creation', async () => {
		const createTask = vi.fn().mockResolvedValue(undefined);
		const h = harness({ createTask });
		await h.writer.onTaskCreate({ startDate: '2026-10-05T00:00', endDate: '2026-10-04T00:00' });

		expect(createTask).not.toHaveBeenCalled();
		expect(h.notice).toHaveBeenCalledWith('End must not be earlier than start.');
	});

	it('batches a summary drag into one date write per real descendant', async () => {
		const before = [
			task('unimian-synthetic://group/Project', { endDate: '2026-10-05' }),
			task('Tasks/A.md', { parentId: 'unimian-synthetic://group/Project', sequence: '1.1' }),
			task('Tasks/B.md', { parentId: 'unimian-synthetic://group/Project', sequence: '1.2' }),
		];
		const h = harness();
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange(before.map(item => ({
			...item, startDate: '2026-10-02', endDate: item.id.includes('synthetic') ? '2026-10-06' : '2026-10-04',
		})));

		expect(h.date.updateRange).toHaveBeenCalledTimes(2);
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/A.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03');
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/B.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03');
	});

	it('accepts only FS dependency drawing and persists the successor link once', async () => {
		const h = harness();
		const fs: GanttDependencyChange = { predecessorId: 'Tasks/A.md', successorId: 'Tasks/B.md', type: 'FS' };
		const ss: GanttDependencyChange = { ...fs, type: 'SS' };

		expect(h.writer.onDependencyCreate(fs)).toBe(true);
		expect(h.writer.onDependencyCreate(ss)).toBe(false);
		await h.writer.onTasksChange([
			h.before[0]!, { ...h.before[1]!, dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] },
		]);

		expect(h.dependency.setDependencies).toHaveBeenCalledOnce();
		expect(h.dependency.setDependencies).toHaveBeenCalledWith('Tasks/B.md', 'note.depends_on', ['[[Tasks/A]]']);
	});

	it('writes dependency and parent links in the form the caller generates', async () => {
		const before = [task('Tasks/A.md'), task('Tasks/B.md', { sequence: '2' })];
		const formatLink = vi.fn((target: string) => '[[' + target.split('/').at(-1)!.replace(/\.md$/i, '') + ']]');
		const h = harness();
		h.writer.replaceBaseline(before, { currentDependsOn: new Map() });
		h.writer.replaceProperties({ ...h.writer['properties'], formatLink });

		h.writer.onDependencyCreate({ predecessorId: 'Tasks/A.md', successorId: 'Tasks/B.md', type: 'FS' });
		await h.writer.onTasksChange([before[0]!, { ...before[1]!, dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }]);

		expect(h.dependency.setDependencies).toHaveBeenCalledWith('Tasks/B.md', 'note.depends_on', ['[[A]]']);
		expect(formatLink).toHaveBeenCalledWith('Tasks/A.md', 'Tasks/B.md');
	});

	it('gives one task two dependencies, even when the second is drawn before Bases echoes the first', async () => {
		const before = [task('Tasks/A.md'), task('Tasks/B.md', { sequence: '2' }), task('Tasks/C.md', { sequence: '3' })];
		const h = harness();
		h.writer.replaceBaseline(before, { currentDependsOn: new Map() });
		const fs = (predecessorId: string) => ({ predecessorId, successorId: 'Tasks/C.md', type: 'FS' as const });
		const withLinks = (targets: string[]) => before.map(item => item.id === 'Tasks/C.md'
			? { ...item, dependencies: targets.map(targetId => ({ targetId, type: 'FS' as const })) } : item);

		expect(h.writer.onDependencyCreate(fs('Tasks/A.md'))).toBe(true);
		await h.writer.onTasksChange(withLinks(['Tasks/A.md']));
		expect(h.writer.onDependencyCreate(fs('Tasks/B.md'))).toBe(true);
		await h.writer.onTasksChange(withLinks(['Tasks/A.md', 'Tasks/B.md']));

		expect(h.dependency.setDependencies).toHaveBeenNthCalledWith(1, 'Tasks/C.md', 'note.depends_on', ['[[Tasks/A]]']);
		expect(h.dependency.setDependencies).toHaveBeenNthCalledWith(2, 'Tasks/C.md', 'note.depends_on', ['[[Tasks/A]]', '[[Tasks/B]]']);
	});

	it('preserves dependencies when a date gesture omits them from the library task array', async () => {
		const h = harness();
		const before = [
			task('Tasks/A.md'),
			task('Tasks/B.md', { sequence: '2', dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }),
		];
		h.writer.replaceBaseline(before, {
			currentDependsOn: new Map([['Tasks/B.md', '[[Tasks/A]]']]),
		});

		await h.writer.onTasksChange([
			{ ...before[0]!, startDate: '2026-10-02', endDate: '2026-10-04' },
			{ ...before[1]!, dependencies: undefined },
		]);

		expect(h.dependency.setDependencies).not.toHaveBeenCalled();
		expect(h.writer.tasks[1]?.dependencies).toEqual([{ targetId: 'Tasks/A.md', type: 'FS' }]);
	});

	it('routes dependency deletion, reparenting, and sibling ordering without unrelated writes', async () => {
		const before = [
			task('Tasks/A.md', { dependencies: [{ targetId: 'Tasks/B.md', type: 'FS' }], parentId: 'Phase/One.md', sequence: '1.1' }),
			task('Tasks/B.md', { parentId: 'Phase/Two.md', sequence: '2.1' }),
		];
		const h = harness({});
		h.writer.replaceBaseline(before, {
			currentOrder: new Map([['Tasks/A.md', 10], ['Tasks/B.md', 10]]),
			currentDependsOn: new Map([['Tasks/A.md', '[[Tasks/B]]']]),
		});
		const move: GanttTaskMoveChange = {
			taskId: 'Tasks/A.md', fromParentId: 'Phase/One.md', fromIndex: 0, toParentId: 'Phase/Two.md', toIndex: 1,
			afterId: 'Tasks/B.md', beforeId: null,
		};
		expect(h.writer.onTaskMove(move)).toBe(true);
		expect(h.writer.onDependencyDelete({
			predecessorId: 'Tasks/B.md', successorId: 'Tasks/A.md', type: 'FS',
		})).toBe(true);
		await h.writer.onTasksChange([
			before[1]!, { ...before[0]!, dependencies: [], parentId: 'Phase/Two.md', sequence: '2.2' },
		]);

		expect(h.dependency.setDependencies).toHaveBeenCalledWith('Tasks/A.md', 'note.depends_on', '');
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', {
			'note.parent': '[[Phase/Two]]', 'note.order': 20,
		});
	});

	it('rejects synthetic reparenting and reorder without an Order property', () => {
		const h = harness();
		const synthetic = { taskId: 'Tasks/A.md', fromParentId: null, fromIndex: 0,
			toParentId: 'unimian-synthetic://group/X', toIndex: 0, afterId: null, beforeId: null };
		expect(h.writer.onTaskMove(synthetic)).toBe(false);

		const noOrder = harness({ properties: undefined });
		noOrder.writer.replaceProperties({ start: { id: 'note.start', type: 'date' } });
		expect(noOrder.writer.onTaskMove({ ...synthetic, toParentId: null, fromParentId: null, toIndex: 1 })).toBe(false);
	});

	it('reverts the previous array and reports a failed write', async () => {
		const h = harness();
		h.date.updateRange.mockResolvedValue({ ok: false, reason: 'error', message: 'disk full' });
		await h.writer.onTasksChange([{ ...h.before[0]!, startDate: '2026-10-02' }, h.before[1]!]);

		expect(h.revertTasks).toHaveBeenCalledWith(h.before);
		expect(h.notice).toHaveBeenCalledWith('Could not save Gantt change: disk full');
		expect(h.writer.tasks).toBe(h.before);
	});

	it('turns a thrown capability error into a revert instead of an unhandled rejection', async () => {
		const h = harness();
		h.date.updateRange.mockRejectedValue(new Error('vault locked'));
		await expect(h.writer.onTasksChange([{ ...h.before[0]!, startDate: '2026-10-02' }, h.before[1]!])).resolves.toBeUndefined();

		expect(h.revertTasks).toHaveBeenCalledWith(h.before);
		expect(h.notice).toHaveBeenCalledWith('Could not save Gantt change: vault locked');
	});

	it('applies gestures in order, each diffed against the previous result', async () => {
		const h = harness();
		let release!: () => void;
		h.date.updateRange.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true }); }));
		const first = [{ ...h.before[0]!, startDate: '2026-10-02', endDate: '2026-10-04' }, h.before[1]!];
		const second = [{ ...first[0]!, progress: 60 }, h.before[1]!];

		const one = h.writer.onTasksChange(first);
		const two = h.writer.onTasksChange(second);
		await Promise.resolve();
		expect(h.property.setProperties).not.toHaveBeenCalled();
		release();
		await Promise.all([one, two]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.property.setProperties).toHaveBeenCalledOnce();
		expect(h.property.setProperties).toHaveBeenCalledWith('Tasks/A.md', { 'note.progress': 60 });
		expect(h.writer.tasks).toBe(second);
	});

	it('voids gestures queued behind a failed one, since the chart is rebuilt from the old baseline', async () => {
		const h = harness();
		h.date.updateRange.mockResolvedValueOnce({ ok: false, reason: 'error', message: 'nope' });
		const first = [{ ...h.before[0]!, startDate: '2026-10-02' }, h.before[1]!];
		const second = [{ ...first[0]!, progress: 60 }, h.before[1]!];

		await Promise.all([h.writer.onTasksChange(first), h.writer.onTasksChange(second)]);

		expect(h.revertTasks).toHaveBeenCalledOnce();
		expect(h.property.setProperties).not.toHaveBeenCalled();
		expect(h.writer.tasks).toBe(h.before);
		expect(h.gate.begin).toHaveBeenCalledTimes(2);
		expect(h.gate.end).toHaveBeenCalledTimes(2);
	});

	it('brackets every gesture with the echo gate, including ones that write nothing', async () => {
		const h = harness();
		await h.writer.onTasksChange(h.before);
		await h.writer.onTasksChange([{ ...h.before[0]!, progress: 35 }, h.before[1]!]);

		expect(h.gate.begin).toHaveBeenCalledTimes(2);
		expect(h.gate.end).toHaveBeenCalledTimes(2);
	});

	it('delegates a task draft to the configured note creator', async () => {
		const createTask = vi.fn().mockResolvedValue(undefined);
		const h = harness({ createTask });
		await h.writer.onTaskCreate({ startDate: '2026-10-04T00:00', endDate: '2026-10-05T00:00' });
		expect(createTask).toHaveBeenCalledWith({ startDate: '2026-10-04T00:00', endDate: '2026-10-05T00:00' });
	});
});

describe('Gantt schedule write-back (GBETA-011)', () => {
	it('adds the minimum overlap repair to the same write batch', async () => {
		const h = harness({ dependencyPolicy: 'overlap' });
		const before = [
			task('Tasks/A.md', { startDate: '2026-10-01', endDate: '2026-10-03' }),
			task('Tasks/B.md', { startDate: '2026-10-04', endDate: '2026-10-06', sequence: '2',
				dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }),
		];
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange([{ ...before[0]!, startDate: '2026-10-04', endDate: '2026-10-06' }, before[1]!]);

		expect(h.date.updateRange).toHaveBeenCalledTimes(2);
		expect(h.date.updateRange).toHaveBeenCalledWith('Tasks/B.md', 'note.start', '2026-10-06', 'note.end', '2026-10-07');
	});

	it('does not write unchanged successors when automatic shifting is off', async () => {
		const h = harness({ dependencyPolicy: 'none' });
		const before = [
			task('Tasks/A.md'),
			task('Tasks/B.md', { sequence: '2', dependencies: [{ targetId: 'Tasks/A.md', type: 'FS' }] }),
		];
		h.writer.replaceBaseline(before);
		await h.writer.onTasksChange([{ ...before[0]!, startDate: '2026-10-02', endDate: '2026-10-04' }, before[1]!]);

		expect(h.date.updateRange).toHaveBeenCalledOnce();
		expect(h.date.updateRange).not.toHaveBeenCalledWith('Tasks/B.md', expect.anything(), expect.anything(), expect.anything(), expect.anything());
	});

	it('skips phase dates by default and writes them with the phase own date types when enabled', async () => {
		const before = [
			task('Phase.md', { startDate: '2026-10-01T09:00', endDate: '2026-10-02T09:00' }),
			task('Child.md', { parentId: 'Phase.md', sequence: '1.1' }),
		];
		const after = [
			{ ...before[0]!, startDate: '2026-10-02T09:00', endDate: '2026-10-03T09:00' },
			{ ...before[1]!, startDate: '2026-10-02', endDate: '2026-10-04' },
		];
		const off = harness({ writePhaseDates: false });
		off.writer.replaceBaseline(before);
		await off.writer.onTasksChange(after);
		expect(off.date.updateRange).toHaveBeenCalledTimes(1);
		expect(off.date.updateRange).toHaveBeenCalledWith('Child.md', 'note.start', '2026-10-02', 'note.end', '2026-10-03');

		const on = harness({ writePhaseDates: true });
		on.writer.replaceProperties({
			start: { id: 'note.start', type: 'date' }, end: { id: 'note.end', type: 'date' },
			dateTypes: new Map([
				['Phase.md', { start: 'datetime' as const, end: 'datetime' as const }],
				['Child.md', { start: 'date' as const, end: 'date' as const }],
			]),
		});
		on.writer.replaceBaseline(before);
		await on.writer.onTasksChange(after);
		expect(on.date.updateRange).toHaveBeenCalledWith(
			'Phase.md', 'note.start', '2026-10-02T00:00', 'note.end', '2026-10-04T00:00',
		);
	});
});
