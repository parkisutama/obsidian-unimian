// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewRuntime } from '../src/platform/dom/ViewRuntime';
import { installGanttNavigation, PREVIEWING_CLASS } from '../src/views/gantt/navigation';
import { Menu } from './fixtures/obsidian';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setup() {
	const root = document.createElement('div');
	root.innerHTML = `
		<div class="gantt-task-bar" data-task-id="Tasks/A.md"><span class="inner">A</span></div>
		<div class="gantt-grid-row" data-row-id="Tasks/B.md"></div>
		<div class="gantt-task-bar" data-task-id="unimian-synthetic://group/X"></div>
		<button data-note-path="Tasks/C.md" class="link"></button>`;
	document.body.appendChild(root);
	const trigger = vi.fn();
	const openLinkText = vi.fn();
	const app = { workspace: { trigger, openLinkText } };
	const hoverParent = {};
	const runtime = new ViewRuntime(root);
	installGanttNavigation({
		app: app as never, root, runtime, hoverParent: hoverParent as never,
		sourceId: 'unimian-gantt', isNote: path => !path.startsWith('unimian-synthetic://'),
	});
	return { root, trigger, openLinkText, hoverParent, runtime };
}

afterEach(() => document.body.replaceChildren());

describe('Gantt navigation (GBETA-015)', () => {
	it('shows Page Preview for a bar, attributed to the registered hover source', () => {
		const h = setup();
		const bar = h.root.querySelector<HTMLElement>('.gantt-task-bar')!;
		const event = new MouseEvent('mouseover', { bubbles: true });
		bar.dispatchEvent(event);

		expect(h.trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({
			source: 'unimian-gantt', hoverParent: h.hoverParent, linktext: 'Tasks/A.md', targetEl: bar,
		}));
	});

	it('previews list rows and the detail panel links too', () => {
		const h = setup();
		h.root.querySelector('.gantt-grid-row')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		h.root.querySelector('.link')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		expect(h.trigger.mock.calls.map(call => call[1].linktext)).toEqual(['Tasks/B.md', 'Tasks/C.md']);
	});

	it('does not restart the preview when the pointer moves between children of one bar', () => {
		const h = setup();
		const bar = h.root.querySelector<HTMLElement>('.gantt-task-bar')!;
		h.root.querySelector('.inner')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: bar }));
		expect(h.trigger).not.toHaveBeenCalled();
	});

	it('gives synthetic phase rows no preview, menu, or navigation', async () => {
		const h = setup();
		const synthetic = h.root.querySelectorAll<HTMLElement>('.gantt-task-bar')[1]!;
		synthetic.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		synthetic.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
		const show = vi.spyOn(Menu.prototype, 'showAtPosition');
		synthetic.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		await flush();

		expect(h.trigger).not.toHaveBeenCalled();
		expect(h.openLinkText).not.toHaveBeenCalled();
		expect(show).not.toHaveBeenCalled();
		show.mockRestore();
	});

	it('opens the open-in-tab/split/window menu on right-click', async () => {
		const h = setup();
		const show = vi.spyOn(Menu.prototype, 'showAtPosition');
		const add = vi.spyOn(Menu.prototype, 'addItem');
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 });
		Object.defineProperty(event, 'view', { value: document.defaultView });
		h.root.querySelector('.gantt-task-bar')!.dispatchEvent(event);
		await flush();

		expect(event.defaultPrevented).toBe(true);
		expect(show).toHaveBeenCalledWith({ x: 5, y: 6 }, document);
		expect(add).toHaveBeenCalled();
		show.mockRestore();
		add.mockRestore();
	});

	it('opens the note on a modifier-click instead of selecting the bar, and leaves plain clicks alone', () => {
		const h = setup();
		const bar = h.root.querySelector<HTMLElement>('.gantt-task-bar')!;
		const librarySelect = vi.fn();
		bar.addEventListener('click', librarySelect);

		bar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(h.openLinkText).not.toHaveBeenCalled();
		expect(librarySelect).toHaveBeenCalledTimes(1);

		bar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
		expect(h.openLinkText).toHaveBeenCalledWith('Tasks/A.md', '', 'tab');
		expect(librarySelect).toHaveBeenCalledTimes(1);
	});

	it('leaves a panel note link to open itself, so it is not opened twice', () => {
		const h = setup();
		h.root.querySelector('.link')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
		expect(h.openLinkText).not.toHaveBeenCalled();
	});

	it('marks the chart while Ctrl/Cmd is held so the library hover card steps aside', () => {
		const h = setup();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }));
		expect(h.root.classList.contains(PREVIEWING_CLASS)).toBe(true);
		document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
		expect(h.root.classList.contains(PREVIEWING_CLASS)).toBe(false);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
		expect(h.root.classList.contains(PREVIEWING_CLASS)).toBe(true);
		h.runtime.dispose();
		expect(h.root.classList.contains(PREVIEWING_CLASS)).toBe(false);
	});
});
