// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EntrySnapshot } from '../src/core/entries/EntrySnapshot';
import { MISSING_VALUE } from '../src/core/entries/NormalizedValue';
import { dateOnlyFromParts, type DateOnlyValue } from '../src/core/temporal/TemporalValue';
import { buildTimelineModel as buildTimelineModelFromGroups } from '../src/views/timeline/TimelineModel';
import { createTimelineLayout, TimelineRenderer } from '../src/views/timeline/TimelineRenderer';
import type { TimelineOptions } from '../src/views/timeline/timelineOptions';
import { createTimelineHarness, date, timelineSnapshot, type TimelineHarness } from './fixtures/timeline';

const options: TimelineOptions = {
	startProperty: 'note.start',
	endProperty: 'note.end',
	titleProperty: null,
	colorProperty: null,
	wrapTitles: false,
	zoom: 'month',
};

function buildTimelineModel(entries: readonly EntrySnapshot[], timelineOptions: TimelineOptions, today?: DateOnlyValue) {
	return buildTimelineModelFromGroups([{ key: MISSING_VALUE, entries: [...entries] }], timelineOptions, today);
}

let harness: TimelineHarness | null = null;
afterEach(() => {
	harness?.destroy();
	harness = null;
});

describe('Timeline renderer', () => {
	it('derives bar geometry from Temporal Core day coordinates', () => {
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01'), 'note.end': date('2026-01-03') }),
		], options, today);
		const layout = createTimelineLayout(model, today, 'month');
		expect(layout.bars[0]?.width).toBe(43);
		expect(layout.bars[0]?.left).toBeGreaterThan(0);
	});

	it('uses the same inclusive range for bar width, edge labels, and tooltip', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 9, 19)!;
		const model = buildTimelineModel([
			timelineSnapshot('Framework.md', {
				'note.start': date('2026-09-20'),
				'note.end': date('2026-09-21'),
			}),
		], options, today);
		const renderer = new TimelineRenderer(host);
		const layout = renderer.render(model, today, 'day');
		const bar = host.querySelector<HTMLButtonElement>('.unimian-timeline__bar[data-note-path="Framework.md"]')!;
		expect(layout.bars[0]?.width).toBe(126);
		expect(host.querySelector('.unimian-timeline__date-label--start')?.textContent).toContain('20');
		expect(host.querySelector('.unimian-timeline__date-label--end')?.textContent).toContain('21');
		expect(bar.title).toBe('Framework — 2026-09-20 – 2026-09-21');
		renderer.dispose();
	});

	it('renders ticks, grid rows, today marker, and accessible bars', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01') }),
		], options, today);
		new TimelineRenderer(host).render(model, today, 'day');
		expect(host.querySelector('.unimian-timeline__period')).not.toBeNull();
		expect(host.querySelector('.unimian-timeline__tick')).not.toBeNull();
		expect(host.querySelector('.unimian-timeline__weekend')).not.toBeNull();
		expect(host.querySelector('.unimian-timeline__gridline')).not.toBeNull();
		expect(host.querySelector('.unimian-timeline__row')).not.toBeNull();
		expect(host.querySelector('.unimian-timeline__today')).not.toBeNull();
		expect(host.querySelector('.unimian-timeline__today-line')).not.toBeNull();
		expect(host.querySelector('button[data-note-path="A.md"]')).not.toBeNull();
	});

	it('keeps the temporal header aligned with horizontal body scroll', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const renderer = new TimelineRenderer(host);
		renderer.render(buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01') }),
		], options, today), today, 'day');
		const scroller = host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		scroller.scrollLeft = 125;
		scroller.dispatchEvent(new Event('scroll'));
		expect(host.querySelector<HTMLElement>('.unimian-timeline__header-canvas')?.style.transform).toBe('translateX(-125px)');
		renderer.dispose();
	});

	it('applies configured category colors through the shared color resolver', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const coloredOptions: TimelineOptions = { ...options, colorProperty: 'note.color' };
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01'), 'note.color': { kind: 'text', value: 'Research' } }),
		], coloredOptions, today);
		new TimelineRenderer(host).render(model, today, 'day');
		const bar = host.querySelector<HTMLElement>('.unimian-timeline__bar[data-note-path="A.md"]')!;
		expect(bar.style.getPropertyValue('--unimian-color-bg')).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it('shows configuration guidance instead of converting every note to Unscheduled', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		new TimelineRenderer(host).render(
			buildTimelineModel([timelineSnapshot('A.md', {})], { ...options, startProperty: null }, today),
			today,
			'month',
		);
		expect(host.querySelector('.unimian-timeline__empty')?.textContent).toContain('Configure a start date property');
		expect(host.querySelector('[data-note-path="A.md"]')).toBeNull();
	});

	it('hides the toolbar/sidebar/grid chrome entirely when no start property is configured', () => {
		// A fully-rendered calendar grid around "today" with no property configured falsely
		// implies a working timeline; only the configuration hint should be visible.
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		new TimelineRenderer(host).render(
			buildTimelineModel([timelineSnapshot('A.md', {})], { ...options, startProperty: null }, today),
			today,
			'month',
		);
		expect(host.classList.contains('unimian-timeline--unconfigured')).toBe(true);
		expect(host.querySelector('.unimian-timeline__empty')).not.toBeNull();
	});

	it('shows the toolbar/sidebar/grid chrome again once a start property is configured', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const renderer = new TimelineRenderer(host);
		renderer.render(buildTimelineModel([timelineSnapshot('A.md', {})], { ...options, startProperty: null }, today), today, 'month');
		expect(host.classList.contains('unimian-timeline--unconfigured')).toBe(true);

		renderer.render(buildTimelineModel([timelineSnapshot('A.md', { 'note.start': date('2026-01-01') })], options, today), today, 'month');
		expect(host.classList.contains('unimian-timeline--unconfigured')).toBe(false);
	});

	it('keeps unscheduled note titles in the sidebar without generic chart pills', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		new TimelineRenderer(host).render(buildTimelineModel([
			timelineSnapshot('Missing.md', {}),
		], options, today), today, 'month');
		expect(host.querySelector('[data-note-path="Missing.md"]')?.textContent).toBe('Missing');
		expect(host.querySelector('.unimian-timeline__unscheduled')).toBeNull();
	});

	it('offers full-title tooltips and optional two-line sidebar wrapping', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const renderer = new TimelineRenderer(host);
		renderer.render(buildTimelineModel([
			timelineSnapshot('Long.md', { 'note.start': date('2026-01-01') }),
		], options, today), today, 'month', true);
		const title = host.querySelector<HTMLButtonElement>('.unimian-timeline__sidebar-row--item button')!;
		expect(host.classList.contains('unimian-timeline--wrap-titles')).toBe(true);
		expect(title.title).toBe('Long');
		renderer.dispose();
	});

	it('previews a dated ghost and schedules an unscheduled note from its timeline row', () => {
		const host = document.createElement('div');
		const scheduled: Array<[string, number, number]> = [];
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const renderer = new TimelineRenderer(host, {
			onQuickSchedule: (path, start, end) => scheduled.push([path, start, end]),
		});
		const scroller = host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 });
		renderer.render(buildTimelineModel([timelineSnapshot('Missing.md', {})], options, today), today, 'month');
		const row = host.querySelector<HTMLElement>('.unimian-timeline__row--unscheduled')!;
		row.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150 }));
		const ghost = host.querySelector<HTMLButtonElement>('.unimian-timeline__ghost')!;
		expect(ghost.title).toMatch(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/);
		ghost.click();
		expect(scheduled[0]?.[0]).toBe('Missing.md');
		const scheduledRange = scheduled[0]!;
		expect(scheduledRange[2] - scheduledRange[1]).toBe(6);
		renderer.dispose();
	});

	it('steps Ctrl+wheel zoom around the pointer and prevents page zoom', () => {
		const host = document.createElement('div');
		const zooms: string[] = [];
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const renderer = new TimelineRenderer(host, { onZoomChange: zoom => zooms.push(zoom) });
		const scroller = host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 });
		renderer.render(buildTimelineModel([timelineSnapshot('A.md', { 'note.start': date('2026-01-01') })], options, today), today, 'month');
		const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -30, clientX: 180 });
		Object.defineProperty(wheel, 'ctrlKey', { configurable: true, value: true });
		scroller.dispatchEvent(wheel);
		expect(wheel.defaultPrevented).toBe(true);
		expect(zooms).toEqual(['biweek']);
		expect(host.querySelector<HTMLSelectElement>('select[data-action="zoom"]')?.value).toBe('biweek');
		renderer.dispose();
	});

	it('uses the same virtual row identity and order for sidebar and timeline', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel([
			timelineSnapshot('A.md', { 'note.start': date('2026-01-01') }),
			timelineSnapshot('Missing.md', {}),
		], options, today);
		const renderer = new TimelineRenderer(host);
		const sidebar = host.querySelector<HTMLElement>('.unimian-timeline__sidebar')!;
		const timeline = host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		Object.defineProperty(sidebar, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(timeline, 'clientHeight', { configurable: true, value: 200 });
		renderer.render(model, today, 'month');
		const paths = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.unimian-virtual-linear-content > [data-path]')]
			.map(element => element.dataset.path);
		expect(paths(sidebar)).toEqual(paths(timeline));
		expect(paths(sidebar)).toEqual(['A.md', 'Missing.md']);
		sidebar.scrollTop = 36;
		timeline.scrollTop = 36;
		renderer.setNarrow(true);
		expect(host.classList.contains('unimian-timeline--narrow')).toBe(true);
		expect([sidebar.scrollTop, timeline.scrollTop]).toEqual([36, 36]);
		renderer.dispose();
	});

	it('keeps both mounted collections bounded for 5,000 scheduled notes', () => {
		const host = document.createElement('div');
		const today = dateOnlyFromParts(2026, 1, 2)!;
		const model = buildTimelineModel(Array.from({ length: 5_000 }, (_, index) =>
			timelineSnapshot(`Notes/${index}.md`, { 'note.start': date('2026-01-01') })
		), options, today);
		const renderer = new TimelineRenderer(host);
		const viewports = host.querySelectorAll<HTMLElement>('.unimian-timeline__sidebar, .unimian-timeline__scroller');
		for (const viewport of viewports) {
			Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 360 });
		}
		renderer.render(model, today, 'month');
		for (const viewport of viewports) {
			expect(viewport.querySelectorAll('.unimian-virtual-linear-content > [data-path]').length).toBeLessThanOrEqual(16);
		}
		expect(host.querySelectorAll('[data-note-path]').length).toBeLessThanOrEqual(30);
		renderer.dispose();
	});
});

describe('Timeline view interactions', () => {
	it('routes click, keyboard activation, hover, and context menu through shared behavior', () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('[data-note-path="Notes/Alpha.md"]')!;
		bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		bar.dispatchEvent(context);
		expect(harness.opened).toEqual(['Notes/Alpha.md', 'Notes/Alpha.md']);
		expect(harness.hovers[0]).toMatchObject({ source: 'unimian-timeline', linktext: 'Notes/Alpha.md' });
		expect(context.defaultPrevented).toBe(true);
	});

	it('does not write dates when interacting with an already scheduled bar', () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('[data-note-path="Notes/Alpha.md"]')!;
		bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
		bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		expect(harness.frontmatterWrites).toBe(0);
	});

	it('routes quick scheduling through the configured start/end mutation capability', async () => {
		harness = createTimelineHarness();
		const scroller = harness.host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 });
		harness.view.onDataUpdated();
		const row = harness.host.querySelector<HTMLElement>('.unimian-timeline__row--unscheduled[data-note-path="Notes/Beta.md"]')!;
		row.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 160 }));
		harness.host.querySelector<HTMLButtonElement>('.unimian-timeline__ghost')!.click();
		await Promise.resolve();
		expect(harness.frontmatterWrites).toBe(1);
		expect(harness.frontmatterUpdates[0]).toMatchObject({ start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), end: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
	});

	it('preserves zoom and synchronized scroll across data rerenders and narrow mode', () => {
		harness = createTimelineHarness();
		const sidebar = harness.host.querySelector<HTMLElement>('.unimian-timeline__sidebar')!;
		const timeline = harness.host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		Object.defineProperty(sidebar, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(timeline, 'clientHeight', { configurable: true, value: 200 });
		harness.view.onDataUpdated();

		const zoom = harness.host.querySelector<HTMLSelectElement>('select[data-action="zoom"]')!;
		zoom.value = 'day';
		zoom.dispatchEvent(new Event('change', { bubbles: true }));
		sidebar.scrollTop = 18;
		sidebar.dispatchEvent(new Event('scroll'));
		expect(timeline.scrollTop).toBe(18);

		harness.view.onDataUpdated();
		expect(harness.host.querySelector<HTMLSelectElement>('select[data-action="zoom"]')?.value).toBe('day');
		expect(sidebar.scrollTop).toBe(18);
		expect(timeline.scrollTop).toBe(18);
	});

	it('writes moved date ranges through the mutation capability and suppresses accidental open', async () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('.unimian-timeline__bar[data-note-path="Notes/Alpha.md"]')!;
		const initialLeft = bar.style.getPropertyValue('--unimian-timeline-left');
		const initialWidth = bar.style.getPropertyValue('--unimian-timeline-bar-width');
		bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, button: 0, clientX: 100 }));
		bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 130 }));
		bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 130 }));
		await Promise.resolve();
		expect(harness.frontmatterUpdates[0]).toMatchObject({ start: '2026-01-03', end: '2026-01-05' });
		bar.click();
		expect(harness.opened).toEqual([]);
		harness.view.onDataUpdated();
		const optimisticBar = harness.host.querySelector<HTMLElement>('.unimian-timeline__bar[data-note-path="Notes/Alpha.md"]')!;
		expect(optimisticBar.style.getPropertyValue('--unimian-timeline-left')).not.toBe(initialLeft);
		expect(optimisticBar.style.getPropertyValue('--unimian-timeline-bar-width')).toBe(initialWidth);
	});

	it('resizes the end date from the right handle', async () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('.unimian-timeline__bar[data-note-path="Notes/Alpha.md"]')!;
		const initialWidth = Number.parseFloat(bar.style.getPropertyValue('--unimian-timeline-bar-width'));
		const handle = harness.host.querySelector<HTMLElement>('.unimian-timeline__bar[data-note-path="Notes/Alpha.md"] .unimian-timeline__handle--right')!;
		handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, button: 0, clientX: 100 }));
		handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: 130 }));
		handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, clientX: 130 }));
		await Promise.resolve();
		expect(harness.frontmatterUpdates[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-05' });
		harness.view.onDataUpdated();
		const resizedWidth = Number.parseFloat(harness.host.querySelector<HTMLElement>('.unimian-timeline__bar[data-note-path="Notes/Alpha.md"]')!
			.style.getPropertyValue('--unimian-timeline-bar-width'));
		expect(resizedWidth).toBeGreaterThan(initialWidth);
	});

	it('keeps the today marker synchronized and extends the time domain near an edge', () => {
		harness = createTimelineHarness();
		const scroller = harness.host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 500 });
		harness.view.onDataUpdated();
		const header = harness.host.querySelector<HTMLElement>('.unimian-timeline__header-canvas')!;
		const initialWidth = Number.parseFloat(header.style.getPropertyValue('--unimian-timeline-width'));
		scroller.scrollLeft = 0;
		scroller.dispatchEvent(new Event('scroll'));
		const extendedWidth = Number.parseFloat(header.style.getPropertyValue('--unimian-timeline-width'));
		expect(extendedWidth).toBeGreaterThan(initialWidth);
		harness.host.querySelector<HTMLElement>('[data-action="today"]')!.click();
		expect(header.style.transform).toBe(`translateX(${-scroller.scrollLeft}px)`);
		const todayLine = harness.host.querySelector<HTMLElement>('.unimian-timeline__today-line')!;
		expect(todayLine.parentElement).toBe(scroller);
	});

	it('uses compact zoom controls and preserves sidebar collapse state', () => {
		harness = createTimelineHarness();
		expect(harness.host.querySelectorAll('select[data-action="zoom"]')).toHaveLength(1);
		expect(harness.host.querySelectorAll('[data-action="zoom"][data-zoom]')).toHaveLength(0);
		harness.host.querySelector<HTMLElement>('[aria-label="Hide timeline sidebar"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(harness.host.classList.contains('unimian-timeline--sidebar-collapsed')).toBe(true);
		harness.view.onDataUpdated();
		expect(harness.host.querySelector('[aria-label="Show timeline sidebar"]')).not.toBeNull();
	});

	it('removes delegated listeners and DOM on unload', () => {
		harness = createTimelineHarness();
		const bar = harness.host.querySelector<HTMLElement>('[data-note-path="Notes/Alpha.md"]')!;
		harness.view.onunload();
		bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(harness.opened).toEqual([]);
		expect(harness.host.childElementCount).toBe(0);
	});

	// containerEl is Obsidian's own .bases-view element, reused when the user switches the Base to
	// a different view type (Table, Gantt, ...). Our root class carries !important layout rules
	// (see "Timeline root layout CSS" below), so leaving it behind after unload corrupts whatever
	// view reuses the container next — this regressed once already (native Table's column header
	// row froze mid-scroll after switching away from Timeline).
	it('removes its own state classes from the shared container on unload', () => {
		harness = createTimelineHarness();
		expect(harness.host.classList.contains('unimian-timeline')).toBe(true);
		harness.view.onunload();
		expect(harness.host.className).toBe('');
	});

	it('centers on today once the container has a real, laid-out width', () => {
		harness = createTimelineHarness({ containerWidth: 800 });
		const scroller = harness.host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		expect(scroller.scrollLeft).toBeGreaterThan(0);
	});

	it('does not re-center on a later data refresh once the user has scrolled elsewhere', () => {
		harness = createTimelineHarness({ containerWidth: 800 });
		const scroller = harness.host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		scroller.scrollLeft = 3;
		harness.view.onDataUpdated();
		expect(scroller.scrollLeft).toBe(3);
	});

	it('never scrolls when the container has no real width (never attached/laid out)', () => {
		harness = createTimelineHarness();
		const scroller = harness.host.querySelector<HTMLElement>('.unimian-timeline__scroller')!;
		expect(scroller.scrollLeft).toBe(0);
	});
});

describe('Timeline root layout CSS (regression)', () => {
	// Obsidian's own .bases-view rules for display/overflow-y won the cascade against ours at
	// equal specificity (confirmed via devtools on a real vault: .unimian-timeline__main
	// rendered at full content height — ~22700px for 500+ rows — instead of the ~645px flex:1
	// should have given it, because `display: flex` on the root wasn't actually taking effect).
	// That left virtualization nothing to bound against, and let the toolbar/date header scroll
	// away with the rows instead of staying put. These properties are load-bearing for the whole
	// column layout, so losing !important here regresses both the lag and the scroll-away bug.
	it('pins the root flex/overflow layout with !important so Obsidian cannot override it', () => {
		const cssPath = join(process.cwd(), 'src/styles/views/timeline.css');
		const css = readFileSync(cssPath, 'utf8');
		const rootRule = css.match(/^\.unimian-timeline\s*\{([^}]*)\}/m)?.[1];
		expect(rootRule).toBeDefined();
		for (const prop of ['display', 'flex-direction', 'height', 'min-height', 'overflow']) {
			expect(rootRule).toMatch(new RegExp(`\\b${prop}\\s*:[^;]*!important`));
		}
	});
});
