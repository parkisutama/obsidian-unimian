// @vitest-environment happy-dom

import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GanttDetailRenderProps, Task } from '@jaeungkim/gantt-chart';
import { renderGanttDetail, type GanttDetailPanelOptions } from '../src/views/gantt/detailPanel';

const task = (overrides: Partial<Task> = {}): Task => ({
	id: 'Task.md', name: 'Task', startDate: '2026-09-20', endDate: '2026-09-22', parentId: null, sequence: '1',
	dependencies: [{ targetId: 'Before.md', type: 'FS' }], progress: 25, ...overrides,
});

function mount(taskValue: Task, overrides: Partial<GanttDetailPanelOptions> = {}) {
	const host = document.createElement('div');
	const update = vi.fn();
	const close = vi.fn();
	const open = vi.fn();
	const remove = vi.fn().mockReturnValue(true);
	const exactDate = vi.fn();
	const options: GanttDetailPanelOptions = {
		canEditStart: true, canEditEnd: true, canEditDependencies: true, canEditProgress: true,
		dependsOnProperty: 'note.depends_on', progressProperty: 'note.progress', localTimeZone: 'Asia/Jakarta',
		entry: {
			dateProperties: { start: 'note.start', end: 'note.end' }, dateTypes: { start: 'date', end: 'date' },
			propertyNames: new Map([['note.status', 'Status'], ['note.owner', 'Owner']]),
			values: new Map([['note.status', { kind: 'text', value: 'Doing' }], ['note.owner', { kind: 'text', value: 'Parkis' }]]),
			visibleProperties: ['note.owner', 'note.status'],
		},
		onOpenNote: open, onExactDateUpdate: exactDate, onRemoveDependency: remove, ...overrides,
	};
	render(renderGanttDetail({ task: taskValue as never, scale: 'week', update, close } as GanttDetailRenderProps, options), host);
	return { host, update, close, open, remove, exactDate };
}

afterEach(() => document.body.replaceChildren());

describe('Gantt detail panel (GBETA-014)', () => {
	// Straight after an edit the chart's store holds the ISO strings the library emits.
	it('shows and edits Duration on the ISO strings the library emits right after an edit', () => {
		const h = mount(task({ startDate: '2026-09-20T00:00:00.000Z', endDate: '2026-09-23T00:00:00.000Z' }));
		const duration = h.host.querySelector<HTMLInputElement>('input[aria-label="Duration"]')!;
		expect(duration.value).toBe('3d');

		duration.value = '5d';
		duration.dispatchEvent(new Event('change'));
		expect(h.update).toHaveBeenCalledWith({ endDate: '2026-09-25T00:00:00.000Z' });
	});

	it('uses day precision, edits duration through the chart update path, and preserves property order', () => {
		const h = mount(task());
		const dateInputs = h.host.querySelectorAll<HTMLInputElement>('input[type="date"]');
		expect([...dateInputs].map(input => input.value)).toEqual(['2026-09-20', '2026-09-21']);
		const duration = h.host.querySelector<HTMLInputElement>('[aria-label="Duration"]')!;
		expect(duration.value).toBe('2d');
		duration.value = '3d';
		duration.dispatchEvent(new Event('change', { bubbles: true }));
		expect(h.update).toHaveBeenCalledWith({ endDate: '2026-09-23T00:00:00.000Z' });
		expect(h.exactDate).toHaveBeenCalledWith('Task.md', 'end', 'date');
		expect([...h.host.querySelectorAll('.unimian-gantt-detail__property-name')].map(node => node.textContent)).toEqual(['Owner', 'Status']);
	});

	it('promotes End and Duration to minute precision when Start already has time', () => {
		const h = mount(task({ startDate: '2026-09-21T23:00', endDate: '2026-09-22T00:00' }), {
			entry: {
				dateProperties: { start: 'note.start', end: 'note.end' }, dateTypes: { start: 'datetime', end: 'date' },
				propertyNames: new Map(), visibleProperties: [], values: new Map(),
			},
		});
		const end = h.host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')[1]!;
		expect(end.value).toBe('2026-09-22T00:00');
		const duration = h.host.querySelector<HTMLInputElement>('[aria-label="Duration"]')!;
		duration.value = '2h';
		duration.dispatchEvent(new Event('change', { bubbles: true }));
		expect(h.exactDate).toHaveBeenCalledWith('Task.md', 'end', 'datetime');
		expect(h.update).toHaveBeenCalledWith({ endDate: '2026-09-22T01:00:00.000Z' });
	});

	it('keeps minute precision and discloses local time only for zoned input', () => {
		const zoned = mount(task({ startDate: '2026-09-20T09:15', endDate: '2026-09-20T10:45' }), {
			entry: {
				dateProperties: { start: 'note.start', end: 'note.end' }, dateTypes: { start: 'datetime', end: 'datetime' }, propertyNames: new Map(), visibleProperties: [],
				values: new Map([['note.start', { kind: 'date', value: '2026-09-20T02:15:00Z', hasTime: true }]]),
			},
		});
		expect([...zoned.host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')].map(input => input.value)).toEqual([
			'2026-09-20T09:15', '2026-09-20T10:45',
		]);
		expect(zoned.host.querySelector('.unimian-gantt-detail__timezone')?.textContent).toBe('Local time · Asia/Jakarta');

		const floating = mount(task({ startDate: '2026-09-20T09:15', endDate: '2026-09-20T10:45' }), {
			entry: {
				dateProperties: { start: 'note.start', end: 'note.end' }, dateTypes: { start: 'datetime', end: 'datetime' }, propertyNames: new Map(), visibleProperties: [],
				values: new Map([['note.start', { kind: 'date', value: '2026-09-20T09:15', hasTime: true }]]),
			},
		});
		expect(floating.host.querySelector('.unimian-gantt-detail__timezone')).toBeNull();
	});

	it('routes progress and dependency removal through task updates and opens the note title', () => {
		const h = mount(task());
		(h.host.querySelector('.unimian-gantt-detail__title') as HTMLButtonElement).click();
		expect(h.open).toHaveBeenCalledWith('Task.md', expect.any(MouseEvent));
		const progress = h.host.querySelector<HTMLInputElement>('input[type="number"]')!;
		progress.value = '61';
		progress.dispatchEvent(new Event('change', { bubbles: true }));
		expect(h.update).toHaveBeenCalledWith({ progress: 61 });
		(h.host.querySelector('[aria-label="Remove dependency Before.md"]') as HTMLButtonElement).click();
		expect(h.remove).toHaveBeenCalledWith('Task.md', { targetId: 'Before.md', type: 'FS' });
		expect(h.update).toHaveBeenCalledWith({ dependencies: [] });
	});
});

describe('Gantt detail panel: minimal layout', () => {
	it('puts the close button on its own row above the title, so it reads as belonging to the panel', () => {
		const h = mount(task());
		const panel = h.host.querySelector('.unimian-gantt-detail')!;
		const children = Array.from(panel.children);
		expect(children[0]?.className).toBe('unimian-gantt-detail__top');
		expect(children[0]?.querySelector('.unimian-gantt-detail__close')).not.toBeNull();
		expect(children[1]?.className).toBe('unimian-gantt-detail__title');
		expect(panel.querySelector('.unimian-gantt-detail__header')).toBeNull();
	});

	it('lays labels above their values and gives Start and End the full width', () => {
		const h = mount(task());
		const fields = Array.from(h.host.querySelectorAll('.unimian-gantt-detail__field'));
		expect(fields.map(field => field.querySelector('.unimian-gantt-detail__label')?.textContent)).toEqual(['Start', 'End', 'Duration', 'Progress']);
		expect(fields.map(field => field.classList.contains('unimian-gantt-detail__field--wide'))).toEqual([true, true, false, false]);
	});

	it('marks the title and every note link so hover preview and the open menu can find them', () => {
		const h = mount(task(), { dependencyInfo: () => ({ blocks: [{ id: 'After.md', name: 'Launch' }], incomplete: 0, conflicts: 0 }) });
		const paths = Array.from(h.host.querySelectorAll<HTMLElement>('[data-note-path]')).map(el => el.dataset.notePath);
		expect(paths).toEqual(['Task.md', 'Before.md', 'After.md']);
	});

	it('passes the click event so Ctrl/Cmd opens in a new tab', () => {
		const h = mount(task());
		h.host.querySelector<HTMLElement>('.unimian-gantt-detail__title')!.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
		expect(h.open.mock.calls[0]?.[1]).toMatchObject({ ctrlKey: true });
	});
});

describe('Gantt detail panel: derived blocking', () => {
	it('names predecessors, opens them, and lists what this task blocks', () => {
		const h = mount(task(), {
			taskName: id => id === 'Before.md' ? 'Design phase' : null,
			dependencyInfo: () => ({ blocks: [{ id: 'After.md', name: 'Launch' }], incomplete: 1, conflicts: 1 }),
		});
		const links = Array.from(h.host.querySelectorAll<HTMLButtonElement>('.unimian-gantt-detail__link'));
		expect(links.map(link => link.textContent)).toEqual(['Design phase', 'Launch']);

		links[1]!.click();
		expect(h.open).toHaveBeenCalledWith('After.md', expect.any(MouseEvent));
		expect(h.host.querySelector('.unimian-gantt-detail__blocks .unimian-gantt-detail__section-title')?.textContent).toBe('Blocks');
		expect(h.host.textContent).toContain('Starts before 1 predecessor finishes.');
		expect(h.host.textContent).toContain('Waiting on 1 unfinished predecessor.');
	});

	it('falls back to the note name, not the vault path, when no task name is known', () => {
		const h = mount(task({ dependencies: [{ targetId: 'Folder/Sub/Before.md', type: 'FS' }] }));
		expect(h.host.querySelector('.unimian-gantt-detail__link')?.textContent).toBe('Before');
	});
});
