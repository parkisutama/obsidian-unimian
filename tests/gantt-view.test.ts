// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentChild, VNode } from 'preact';
import { render as renderPreact } from 'preact/compat';
import type { GanttHandle } from '@jaeungkim/gantt-chart';
import { DateValue, notices, StringValue } from './fixtures/obsidian';
import { BasesGanttView, BASES_GANTT_VIEW_ID, createGanttViewRegistration } from '../src/views/gantt';
import { localTodayOffsetPx } from '../src/views/gantt/BasesGanttView';
import type { ChartRender } from '../src/views/gantt/chartHost';
import type { GrantedMutations } from '../src/platform/mutations/grants';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

interface Harness {
	view: BasesGanttView;
	host: HTMLElement;
	renders: ComponentChild[];
	configWrites: Array<[string, unknown]>;
	openLinkText: ReturnType<typeof vi.fn>;
	handle: { [K in keyof GanttHandle]: ReturnType<typeof vi.fn> };
	setConfig(key: string, value: unknown): void;
	/** Simulates Bases delivering a new result set (new group objects) for the same entries. */
	refreshData(): void;
}

function mount(
	configOverrides: Record<string, unknown> = {},
	mutations: GrantedMutations = {},
	entryValues: Record<string, DateValue | StringValue | null> = {},
): Harness {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const renders: ComponentChild[] = [];
	const configWrites: Array<[string, unknown]> = [];
	const handle = {
		scrollToDate: vi.fn(), scrollToToday: vi.fn(), scrollToTask: vi.fn(), setScale: vi.fn(), zoomToFit: vi.fn(),
		getScrollElement: vi.fn().mockReturnValue(null), openDetail: vi.fn(), closeDetail: vi.fn(), addTask: vi.fn(),
	};
	const renderChart: ChartRender = (node, container) => {
		renders.push(node);
		container.replaceChildren();
		if (node !== null && node !== undefined && node !== false) {
			const ref = (node as VNode & { ref?: (value: GanttHandle | null) => void }).ref;
			ref?.(handle);
			const marker = document.createElement('div');
			marker.dataset.preactTree = 'mounted';
			container.appendChild(marker);
		}
	};
	const entry: { file: { path: string; basename: string; extension: string; parent: null; stat: { ctime: number; mtime: number } }; getValue(id: string): DateValue | StringValue | null } = {
		file: { path: 'A.md', basename: 'A', extension: 'md', parent: null, stat: { ctime: 1, mtime: 2 } }, getValue: () => null,
	};
	const values: Record<string, unknown> = { ganttStart: 'note.start', ...configOverrides };
	entry.getValue = (id: string) => entryValues[id] ?? (id === 'note.start' ? new DateValue('2026-01-01') : null);
	const openLinkText = vi.fn().mockResolvedValue(undefined);
	const app = { metadataCache: { getFirstLinkpathDest: () => null }, vault: { getAbstractFileByPath: () => null }, workspace: { openLinkText } };
	const controller = { app, config: {
		get: (key: string) => values[key],
		set: (key: string, value: unknown) => { values[key] = value; configWrites.push([key, value]); },
		getAsPropertyId: (key: string) => values[key] ?? null,
		getOrder: () => (values.__order as string[] | undefined) ?? [],
		getDisplayName: (id: string) => id === 'note.owner' ? 'Owner' : id,
	}, data: { groupedData: [{ entries: [entry], hasKey: () => false }] } };
	const plugin = { app, settings: { valueStyles: {} } };
	const view = new BasesGanttView(controller as never, host, plugin as never, renderChart, mutations);
	view.onDataUpdated();
	return {
		view, host, renders, configWrites, handle, openLinkText,
		setConfig: (key, value) => { values[key] = value; },
		refreshData: () => { (view as unknown as { data: unknown }).data = { groupedData: [{ entries: [entry], hasKey: () => false }] }; },
	};
}

function lastProps(harness: Harness): Record<string, unknown> {
	return (harness.renders.at(-1) as VNode<Record<string, unknown>>).props;
}

afterEach(() => {
	document.body.classList.remove('theme-dark');
	document.body.replaceChildren();
});

describe('Gantt skeleton (GBETA-004)', () => {
	it('registers the permanent id and display name', () => {
		const registration = createGanttViewRegistration({} as never);
		expect(BASES_GANTT_VIEW_ID).toBe('wise-view-gantt');
		expect(registration.name).toBe('Gantt');
		expect(registration.factory).toBeTypeOf('function');
	});

	it('mounts a static, read-only chart', () => {
		const harness = mount();
		expect(harness.host.dataset.preactTree).toBeUndefined();
		expect(harness.host.querySelector('[data-preact-tree="mounted"]')).not.toBeNull();
		expect(lastProps(harness)).toMatchObject({
			theme: 'light',
			readOnly: true,
			hierarchy: true,
			showTaskList: true,
		});
		expect(lastProps(harness).tasks).toHaveLength(1);
		harness.view.onunload();
	});

	it('repaints when the owning document switches theme', async () => {
		const harness = mount();
		const initialRenderCount = harness.renders.length;

		document.body.classList.add('theme-dark');
		await flush();

		expect(harness.renders.length).toBe(initialRenderCount + 1);
		expect(lastProps(harness).theme).toBe('dark');
		harness.view.onunload();
	});

	it('applies row height through CSS without rebuilding or repainting tasks', () => {
		const harness = mount();
		const firstTasks = lastProps(harness).tasks;
		const renderCount = harness.renders.length;
		harness.setConfig('ganttRowHeight', 64);
		harness.view.onDataUpdated();

		expect(harness.host.style.getPropertyValue('--gantt-row-height')).toBe('64px');
		expect(harness.renders).toHaveLength(renderCount);
		expect(lastProps(harness).tasks).toBe(firstTasks);
		harness.view.onunload();
	});

	it('unmounts the Preact tree and disconnects theme repainting on unload', async () => {
		const harness = mount();
		harness.view.onunload();
		const renderCountAfterUnload = harness.renders.length;

		expect(harness.renders.at(-1)).toBeNull();
		expect(harness.host.childElementCount).toBe(0);
		expect(harness.host.classList.contains('wise-view-gantt')).toBe(false);

		document.body.classList.add('theme-dark');
		await flush();
		expect(harness.renders).toHaveLength(renderCountAfterUnload);
	});

	it('enables only configured, granted edits and keeps callbacks on the same chart instance', async () => {
		const updateRange = vi.fn().mockResolvedValue({ ok: true });
		const harness = mount({ ganttReadOnly: false }, { date: { updateRange } });
		const props = lastProps(harness);
		// Resize edits the end date, so it stays off until an End property is configured.
		expect(props).toMatchObject({ readOnly: false, allowMove: true, allowResize: false, allowProgressChange: false });

		const tasks = props.tasks as Array<Record<string, unknown>>;
		(props.onTasksChange as (tasks: unknown[]) => void)([{ ...tasks[0]!, startDate: '2026-01-02' }]);
		await flush();

		expect(updateRange).toHaveBeenCalledWith('A.md', 'note.start', '2026-01-02', undefined, null);
		// A successful echo is handled by the existing Preact component; no rollback repaint is issued.
		expect(harness.renders.at(-1)).toBeDefined();
		harness.view.onunload();
	});

	it('switches off edits that need a frontmatter field a formula cannot provide', () => {
		const mutations = {
			date: { updateRange: vi.fn() }, property: { setProperty: vi.fn(), setProperties: vi.fn() },
			dependency: { setDependencies: vi.fn() }, fileCreate: { createNote: vi.fn() },
		};
		const writable = mount({
			ganttReadOnly: false, ganttEnd: 'note.end', ganttProgress: 'note.progress', ganttDependencyFS: 'note.depends',
		}, mutations);
		expect(lastProps(writable)).toMatchObject({
			allowMove: true, allowResize: true, allowProgressChange: true, allowLinkCreate: true, allowLinkDelete: true, allowTaskCreate: true,
		});
		writable.view.onunload();

		const formulas = mount({
			ganttReadOnly: false, ganttEnd: 'formula.end',
			ganttProgress: 'formula.progress', ganttDependencyFS: 'formula.depends',
		}, mutations);
		expect(lastProps(formulas)).toMatchObject({
			allowMove: true, allowResize: false, allowProgressChange: false, allowLinkCreate: false, allowLinkDelete: false, allowTaskCreate: true,
		});
		formulas.view.onunload();
	});

	it('enables resize once an End property is configured and a date grant exists', () => {
		const harness = mount({ ganttReadOnly: false, ganttEnd: 'note.end' }, { date: { updateRange: vi.fn() } });
		expect(lastProps(harness)).toMatchObject({ allowMove: true, allowResize: true });
		harness.view.onunload();
	});

	it('formats Date tooltips as calendar dates without exposing the library UTC model', () => {
		const harness = mount({ ganttScale: 'week' });
		const formats = lastProps(harness).formats as Record<string, { tooltip(date: { format(pattern: string): string }): string }>;
		const date = { format: vi.fn((pattern: string) => pattern) };

		expect(formats.week?.tooltip(date)).toBe('YYYY-MM-DD');
		expect(date.format).toHaveBeenCalledWith('YYYY-MM-DD');
		harness.view.onunload();
	});

	it('drives toolbar actions through the chart ref and persists scale changes', () => {
		const harness = mount({ ganttReadOnly: false, ganttAllowTaskCreate: true }, { fileCreate: { createNote: vi.fn() } });
		const select = harness.host.querySelector<HTMLSelectElement>('[aria-label="Time resolution"]')!;
		select.value = 'week';
		select.dispatchEvent(new Event('change'));
		harness.host.querySelector<HTMLButtonElement>('[aria-label="Today"]')!.click();
		harness.host.querySelector<HTMLButtonElement>('[aria-label="Zoom to fit"]')!.click();
		harness.host.querySelector<HTMLButtonElement>('[aria-label="Add task"]')!.click();

		expect(harness.handle.setScale).toHaveBeenCalledWith('week');
		expect(harness.handle.scrollToToday).toHaveBeenCalledOnce();
		expect(harness.handle.zoomToFit).toHaveBeenCalledOnce();
		expect(harness.handle.addTask).toHaveBeenCalledOnce();
		expect(harness.configWrites).toContainEqual(['ganttScale', 'week']);
		harness.view.onunload();
	});

	it('tracks wheel scale and persists controlled collapse state across a remount', () => {
		const harness = mount();
		(lastProps(harness).onScaleChange as (scale: string) => void)('day');
		(lastProps(harness).onCollapsedChange as (ids: string[]) => void)(['Phase.md']);

		expect(harness.host.querySelector<HTMLSelectElement>('[aria-label="Time resolution"]')?.value).toBe('day');
		expect(harness.configWrites).toContainEqual(['ganttScale', 'day']);
		expect(harness.configWrites).toContainEqual(['ganttCollapsedIds', '["Phase.md"]']);
		harness.view.onunload();

		const reopened = mount({ ganttScale: 'day', ganttCollapsedIds: '["Phase.md"]' });
		expect(lastProps(reopened)).toMatchObject({ defaultScale: 'day', collapsedIds: ['Phase.md'] });
		expect(reopened.host.querySelector<HTMLSelectElement>('[aria-label="Time resolution"]')?.value).toBe('day');
		reopened.view.onunload();
	});

	it('labels scales by visible resolution and shifts the UTC marker to local wall time', () => {
		const harness = mount({ ganttScale: 'week' });
		const select = harness.host.querySelector<HTMLSelectElement>('[aria-label="Time resolution"]')!;
		expect([...select.options].map(option => option.textContent)).toEqual(['Hours', 'Days', 'Weeks', 'Months', 'Quarters']);
		expect(localTodayOffsetPx('week', -420)).toBe(21);
		expect(harness.host.style.getPropertyValue('--gantt-local-today-offset')).toBe(
			`${localTodayOffsetPx('week', new Date().getTimezoneOffset())}px`,
		);
		harness.view.onunload();
	});

	it('wires the custom detail renderer to ordered visible-property snapshots and note navigation', () => {
		const harness = mount({
			ganttShowDetail: true, __order: ['note.owner'],
		}, {}, { 'note.owner': new StringValue('Parkis') });
		const props = lastProps(harness);
		expect(props.renderDetail).toBeTypeOf('function');
		const update = vi.fn();
		const detail = (props.renderDetail as (value: unknown) => ComponentChild)({
			task: { ...(props.tasks as Array<Record<string, unknown>>)[0], name: 'A' },
			scale: 'week', update, close: vi.fn(),
		});
		const detailHost = document.createElement('div');
		renderPreact(detail, detailHost);
		expect(detailHost.querySelector('.wise-view-gantt-detail__property-value')?.textContent).toBe('Parkis');
		(detailHost.querySelector('.wise-view-gantt-detail__title') as HTMLButtonElement).click();
		expect(harness.openLinkText).toHaveBeenCalledWith('A.md', '', false);
		const rendersBeforePropertyChange = harness.renders.length;
		harness.setConfig('__order', []);
		harness.view.onDataUpdated();
		expect(harness.renders).toHaveLength(rendersBeforePropertyChange + 1);
		harness.view.onunload();
	});

	it('remounts the chart on a failed write, because the library ignores a re-passed identical array', async () => {
		const updateRange = vi.fn().mockResolvedValue({ ok: false, reason: 'error', message: 'disk full' });
		const harness = mount({ ganttReadOnly: false }, { date: { updateRange } });
		const before = harness.renders.length;
		const firstKey = (harness.renders.at(-1) as VNode).key;
		const props = lastProps(harness);
		const tasks = props.tasks as Array<Record<string, unknown>>;

		(props.onTasksChange as (tasks: unknown[]) => void)([{ ...tasks[0]!, startDate: '2026-01-02' }]);
		await flush();

		expect(harness.renders.length).toBe(before + 1);
		const reverted = harness.renders.at(-1) as VNode;
		expect(reverted.key).not.toBe(firstKey);
		expect((reverted.props as Record<string, unknown>).tasks).toEqual(tasks);
		harness.view.onunload();
	});

	it('holds Bases re-renders while our own write lands, then renders once from the latest data', async () => {
		const updateRange = vi.fn().mockResolvedValue({ ok: true });
		const harness = mount({ ganttReadOnly: false }, { date: { updateRange } });
		const props = lastProps(harness);
		const tasks = props.tasks as Array<Record<string, unknown>>;

		(props.onTasksChange as (tasks: unknown[]) => void)([{ ...tasks[0]!, startDate: '2026-01-02' }]);
		await flush();
		const afterWrite = harness.renders.length;

		harness.refreshData();
		harness.view.onDataUpdated();
		harness.refreshData();
		harness.view.onDataUpdated();
		expect(harness.renders.length).toBe(afterWrite);

		// The view's timers belong to the happy-dom window, so wait out the real settle window.
		await new Promise(resolve => setTimeout(resolve, 500));
		expect(harness.renders.length).toBe(afterWrite + 1);
		harness.view.onunload();
	});

	it('warns once when Start date and End date are mapped to the same property, instead of silently collapsing every task to one day', () => {
		notices.length = 0;
		const harness = mount({ ganttEnd: 'note.start' });

		expect(notices).toEqual([
			'Gantt: Start date and End date are both mapped to "note.start". Every task will show as one day until End date points to a different property.',
		]);

		harness.view.onDataUpdated();
		expect(notices).toHaveLength(1);
		harness.view.onunload();
	});

	it('warns again if the same-property mistake is fixed and then reintroduced, but not on an unrelated config change in between', () => {
		notices.length = 0;
		const harness = mount({ ganttEnd: 'note.start' });
		expect(notices).toHaveLength(1);

		harness.setConfig('ganttEnd', 'note.end');
		harness.view.onDataUpdated();
		expect(notices).toHaveLength(1);

		harness.setConfig('ganttEnd', 'note.start');
		harness.view.onDataUpdated();
		expect(notices).toHaveLength(2);
		harness.view.onunload();
	});

	it('does not warn when End date is left unmapped, the normal way to get single-day tasks', () => {
		notices.length = 0;
		const harness = mount();

		expect(notices).toEqual([]);
		harness.view.onunload();
	});
});
