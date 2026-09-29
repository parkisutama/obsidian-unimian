// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { BasesView, Notice, TFile, type QueryController } from 'obsidian';
import type { GanttDetailRenderProps, GanttProps, GanttTaskDraft, Task, TaskDependency } from '@jaeungkim/gantt-chart';
import type UnimianPlugin from '../../main';
import type { NormalizedValue } from '../../core/entries/NormalizedValue';
import { writeGanttDate, type GanttPropertyDateType } from '../../core/gantt/dates';
import { toGanttWikiLink, wikiLinkText } from '../../core/gantt/dependencies';
import { annotateDependencyStatus, computeDependencyStatus, dependencyStatusOf } from '../../core/gantt/dependencyStatus';
import { createEntrySnapshotGroups } from '../../platform/bases/entrySnapshotAdapter';
import type { EntrySnapshotGroup } from '../../platform/bases/entrySnapshotAdapter';
import { resolveColor } from '../../platform/colors/ColorResolver';
import { resolvePrettyPropertiesColor } from '../../integrations/PrettyPropertiesAdapter';
import { ViewRuntime } from '../../platform/dom/ViewRuntime';
import { RenderScheduler } from '../../platform/dom/RenderScheduler';
import { computeRenderSignature, type RenderSignatureInput } from '../../platform/bases/changeDetection';
import { createViewOptionSchema } from '../../platform/bases/viewOptionTypes';
import type { GrantedMutations } from '../../platform/mutations/grants';
import { NoteTemplateService } from '../../services/NoteTemplateService';
import { activateEntry, openPath } from '../../platform/navigation/NavigationService';
import { PropertyTypeService } from '../../services/PropertyTypeService';
import { EchoGate } from './echoGate';
import { renderGanttDetail, type GanttDetailEntry } from './detailPanel';
import { GanttChartHost, type ChartRender, type GanttChartModel } from './chartHost';
import { ganttRequestedProperties, readGanttOptions } from './options';
import type { GanttOptions } from './options';
import { mapSnapshotsToGanttTasks } from './taskMapping';
import { installGanttNavigation } from './navigation';
import { migrateLegacyOptions } from './legacyOptions';
import { GanttToolbar } from './toolbar';
import { GanttWriteBack } from './writeBack';

export const BASES_GANTT_VIEW_ID = 'unimian-gantt';

const PIXELS_PER_MINUTE: Record<GanttOptions['scale'], number> = {
	day: 12 / 60,
	week: 18 / (6 * 60),
	month: 18 / (24 * 60),
	quarter: 28 / (7 * 24 * 60),
	year: 28 / (28 * 24 * 60),
};

export function localTodayOffsetPx(scale: GanttOptions['scale'], timezoneOffsetMinutes: number): number {
	return -timezoneOffsetMinutes * PIXELS_PER_MINUTE[scale];
}

/** rowHeight is a pure CSS variable (see onDataUpdated's `--gantt-row-height`); every other option affects the data model. */
const GANTT_OPTION_SCHEMA = createViewOptionSchema(['rowHeight']);

export class BasesGanttView extends BasesView {
	type = BASES_GANTT_VIEW_ID;
	private readonly runtime: ViewRuntime;
	private readonly chart: GanttChartHost;
	private readonly toolbar: GanttToolbar;
	private reportedCycles = new Set<string>();
	private reportedUnresolved = new Set<string>();
	/**
	 * Start date and End date mapped to the same property id — always a misconfiguration, never a
	 * legitimate way to get single-day tasks (leaving End date unmapped already does that). Left
	 * unnoticed, every task's bar collapses to one day while its own End property (a different one,
	 * never read) still shows its real value in the detail panel, which reads as a data-corruption
	 * bug rather than the property-mapping mistake it actually is. Tracks the last warned property id
	 * so a fix-then-repeat of the same mistake warns again, but one config doesn't spam every render.
	 */
	private reportedSameStartEnd: string | null = null;
	private legacyOptionsChecked = false;
	/** PERF-002: decides skip/css-only/full for repeated `onDataUpdated()` calls, reusing the same infrastructure Timeline's tests exercise. */
	private readonly renderScheduler = new RenderScheduler();
	/**
	 * The `groupedData` reference from the last `onDataUpdated()` that actually reached this
	 * decision (i.e. was not held by `echoGate`). Bases hands out a new array/group object every
	 * time it re-runs its query, even when the resulting values are unchanged, so this is a cheap
	 * "did Bases actually re-query" signal distinct from whether the *content* changed — needed
	 * because our own echoed write can otherwise look content-identical to the pre-write state.
	 */
	private lastGroupedData: unknown = null;
	private lastModel: GanttChartModel | null = null;
	private writer: GanttWriteBack | null = null;
	private currentOptions: GanttOptions | null = null;
	private currentStartType: GanttPropertyDateType = 'date';
	private creationFolder = '';
	/** Paths of the notes currently in the chart; phase rows made up for grouping are not notes. */
	private notePaths: ReadonlySet<string> = new Set();
	private readonly echoGate: EchoGate;
	private activeScale: GanttOptions['scale'] | null = null;
	/**
	 * Obsidian's Bases wrapper (the same element as containerEl) never resolves a definite height
	 * through plain CSS percentages here — its own parent chain ends up auto-sized to content, so
	 * `height: 100%` just cascades into "auto" and the whole pane grows to fit the chart instead of
	 * being clipped to the view. That leaves the toolbar and the chart's own sticky timeline header
	 * nothing to stay fixed against: the pane itself scrolls and carries them off-screen. Mirroring
	 * the real scrolling ancestor's pixel height here breaks that cycle (same technique as Timeline's
	 * BasesTimelineView).
	 */
	private scrollAncestor: HTMLElement | null = null;

	constructor(
		controller: QueryController,
		private readonly containerEl: HTMLElement,
		private readonly plugin: UnimianPlugin,
		renderChart?: ChartRender,
		private readonly mutations: GrantedMutations = {},
	) {
		super(controller);
		this.runtime = new ViewRuntime(containerEl);
		this.containerEl.addClass('unimian-gantt');
		const toolbarEl = containerEl.createDiv();
		const chartEl = containerEl.createDiv({ cls: 'unimian-gantt-chart' });
		this.chart = this.runtime.own(new GanttChartHost(chartEl, this.runtime, renderChart));
		installGanttNavigation({
			app: this.app, root: chartEl, runtime: this.runtime, hoverParent: this.plugin,
			sourceId: BASES_GANTT_VIEW_ID, isNote: path => this.notePaths.has(path),
		});
		this.toolbar = new GanttToolbar(toolbarEl, this.runtime, {
			onScale: scale => this.setScale(scale),
			onToday: () => this.chart.scrollToToday(),
			onZoomToFit: () => this.chart.zoomToFit(),
			onAddTask: () => this.chart.addTask(),
			onCollapseAll: () => this.setCollapsed(this.parentIds()),
			onExpandAll: () => this.setCollapsed([]),
		});
		this.echoGate = new EchoGate({
			setTimeout: (handler, ms) => this.runtime.setTimeout(handler, ms),
			clearTimeout: id => this.runtime.win.clearTimeout(id),
			now: () => Date.now(),
		}, () => this.onDataUpdated());
	}

	onload(): void {
		const ResizeObserverCtor = (this.runtime.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
		if (!ResizeObserverCtor) return;
		this.scrollAncestor = this.findScrollAncestor();
		if (!this.scrollAncestor) return;
		const syncHeight = (): void => {
			if (!this.scrollAncestor) return;
			this.containerEl.style.height = `${this.scrollAncestor.clientHeight}px`;
		};
		const heightObserver = new ResizeObserverCtor(syncHeight);
		heightObserver.observe(this.scrollAncestor);
		this.runtime.observe(heightObserver);
		syncHeight();
	}

	/**
	 * Walks up from containerEl to find the nearest ancestor Obsidian actually scrolls (identified
	 * by its own overflow-y, not by measuring current scroll overflow — at initial mount, before our
	 * content has inflated anything, scrollHeight/clientHeight can still be equal even on the right
	 * element). Same technique as Timeline's BasesTimelineView.findScrollAncestor().
	 */
	private findScrollAncestor(): HTMLElement | null {
		const view = this.runtime.win;
		let el = this.containerEl.parentElement;
		while (el) {
			const overflowY = view.getComputedStyle(el).overflowY;
			if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return el;
			el = el.parentElement;
		}
		return null;
	}

	onDataUpdated(): void {
		if (!this.data?.groupedData) return;
		// Bases echoes our own writes file by file; render once they have settled, from the latest data.
		if (this.echoGate.hold()) return;
		this.importLegacyOptions();
		const previousOptions = this.currentOptions;
		const options = readGanttOptions(this.config);
		this.currentOptions = options;
		this.containerEl.style.setProperty('--gantt-row-height', `${options.rowHeight}px`);
		this.setTodayOffset(options.scale);
		const visibleProperties = this.config.getOrder();

		// PERF-002: an identical update (same entries/order/groups/config as last time) skips
		// rebuilding entirely; one where only rowHeight (a CSS-only option) changed takes a
		// cheap fast path instead of remapping every entry, the same way Timeline's
		// RenderScheduler decides between 'skip'/'css-only'/'full'.
		const signature = computeRenderSignature(this.buildRenderSignatureInput(options, visibleProperties));
		const changedConfigKeys = previousOptions
			? (Object.keys(options) as Array<keyof GanttOptions>).filter(
				key => JSON.stringify(options[key]) !== JSON.stringify(previousOptions[key]),
			)
			: (Object.keys(options) as Array<keyof GanttOptions>);
		const identicalGroupedData = this.lastGroupedData === this.data.groupedData;
		this.lastGroupedData = this.data.groupedData;
		let decision = this.renderScheduler.decide(signature, GANTT_OPTION_SCHEMA, changedConfigKeys);
		if (decision !== 'full' && !identicalGroupedData) decision = 'full';
		if (decision === 'skip') return;
		if (decision === 'css-only' && this.lastModel) {
			this.lastModel = { ...this.lastModel, rowHeight: options.rowHeight };
			this.chart.update(this.lastModel);
			return;
		}
		const groups = createEntrySnapshotGroups(this.data.groupedData, ganttRequestedProperties(options, visibleProperties));
		const entries = groups.flatMap(group => group.entries);
		const entriesByPath = new Map(entries.map(entry => [entry.path, entry]));
		this.notePaths = new Set(entriesByPath.keys());
		this.creationFolder = groups.flatMap(group => group.entries)[0]?.folder ?? '';
		const grouped = this.data.groupedData.length > 1 || Boolean(this.data.groupedData[0]?.hasKey());
		const mapped = mapSnapshotsToGanttTasks(groups, options, {
			resolveLink: (target, sourcePath) => {
				const file = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
				return file ? { path: file.path, name: file.basename } : null;
			},
			resolveColor: (_entry, category) => {
				if (!category || !options.colorBy) return null;
				const resolved = resolveColor({
					categoryValue: category,
					resolvePrettyPropertiesColor: value => resolvePrettyPropertiesColor(this.runtime.win, this.runtime.doc, options.colorBy!.split('.').pop()!, value),
					valueStyleColor: this.plugin.settings.valueStyles[options.colorBy]?.[category]?.color ?? null,
				});
				return resolved.background;
			},
		}, grouped);
		// Blocking is Depends on read from the other side: derived here, never stored.
		const dependencyStatus = computeDependencyStatus(mapped.tasks, { trackCompletion: Boolean(options.progress) });
		const chartTasks = annotateDependencyStatus(mapped.tasks, dependencyStatus);
		const taskNames = new Map(chartTasks.map(task => [task.id, task.name]));
		const freshCycles = mapped.cycles.filter(path => !this.reportedCycles.has(path));
		if (freshCycles.length) {
			freshCycles.forEach(path => this.reportedCycles.add(path));
			new Notice(`Gantt ignored cyclic parent links: ${freshCycles.join(', ')}`);
		}
		const freshUnresolved = mapped.unresolved.filter(link => !this.reportedUnresolved.has(`${link.path}::${link.target}`));
		if (freshUnresolved.length) {
			for (const link of freshUnresolved) this.reportedUnresolved.add(`${link.path}::${link.target}`);
			const shown = freshUnresolved.slice(0, 5).map(link => `[[${link.target}]] in ${link.path}`).join('; ');
			const more = freshUnresolved.length > 5 ? ` (and ${freshUnresolved.length - 5} more)` : '';
			new Notice(`Gantt could not find ${freshUnresolved.length} dependency link${freshUnresolved.length === 1 ? '' : 's'}: ${shown}${more}`);
		}
		if (options.start && options.end && options.start === options.end) {
			if (this.reportedSameStartEnd !== options.start) {
				this.reportedSameStartEnd = options.start;
				new Notice(`Gantt: Start date and End date are both mapped to "${this.config.getDisplayName(options.start)}". Every task will show as one day until End date points to a different property.`);
			}
		} else {
			this.reportedSameStartEnd = null;
		}
		const mutationProperties = this.mutationProperties(groups, options);
		this.currentStartType = mutationProperties.start?.type ?? 'date';
		if (this.writer) {
			this.writer.replaceProperties(mutationProperties);
			this.writer.replaceScheduleOptions(options.dependencyShift, options.writePhaseDates, options.scale);
			this.writer.replaceBaseline(chartTasks, mutationProperties);
		} else {
			this.writer = new GanttWriteBack(chartTasks, {
				mutations: this.mutations,
				properties: mutationProperties,
				revertTasks: tasks => this.revertTaskArray(tasks),
				gate: this.echoGate,
				notice: message => new Notice(message),
				createTask: draft => this.createTask(draft, this.currentOptions ?? options, this.currentStartType),
				dependencyPolicy: options.dependencyShift,
				writePhaseDates: options.writePhaseDates,
				scale: options.scale,
				renderTasks: tasks => this.renderTaskArray(tasks),
			});
		}
		const writer = this.writer;
		const editable = !options.readOnly;
		// A formula has no frontmatter field to write, so an edit that needs one is switched off up front
		// instead of failing after the drag.
		const writable = (property: string | null): property is string => property !== null && !property.startsWith('formula.');
		const canAddTask = editable && options.allowTaskCreate && writable(options.start) && Boolean(this.mutations.fileCreate);
		const showTime = mutationProperties.start?.type === 'datetime' || mutationProperties.end?.type === 'datetime';
		const formats: GanttProps['formats'] = {
			[options.scale]: { tooltip: (date: { format(pattern: string): string }) => date.format(showTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD') },
		};
		const dateTypes = mutationProperties.dateTypes;
		const propertyNames = new Map(visibleProperties.map(property => [property, this.config.getDisplayName(property)]));
		const timezone = (this.runtime.win as Window & { Intl?: typeof Intl }).Intl?.DateTimeFormat().resolvedOptions().timeZone ?? 'Local time';
		const detailEntry = (path: string): GanttDetailEntry | null => {
			const entry = entriesByPath.get(path);
			const types = dateTypes.get(path);
			return entry && types ? {
				dateProperties: { start: options.start, end: options.end }, dateTypes: types,
				propertyNames, values: entry.values, visibleProperties,
			} : null;
		};
		const removeDependency = (taskId: string, dependency: TaskDependency): boolean => writer.onDependencyDelete({
			predecessorId: dependency.targetId, successorId: taskId, type: dependency.type,
		});
		const renderDetail = (detailProps: GanttDetailRenderProps) => renderGanttDetail(detailProps, {
			canEditStart: editable && options.allowMove && writable(options.start) && Boolean(this.mutations.date),
			canEditEnd: editable && options.allowResize && writable(options.end) && Boolean(this.mutations.date),
			canEditProgress: editable && options.allowProgress && writable(options.progress) && Boolean(this.mutations.property),
			canEditDependencies: editable && options.allowLinkDelete && writable(options.dependsOn) && Boolean(this.mutations.dependency),
			dependsOnProperty: options.dependsOn, progressProperty: options.progress, entry: detailEntry(detailProps.task.id),
			localTimeZone: timezone,
			taskName: id => taskNames.get(id) ?? null,
			dependencyInfo: id => {
				const status = dependencyStatusOf(dependencyStatus, id);
				return {
					blocks: status.blocks.map(blockedId => ({ id: blockedId, name: taskNames.get(blockedId) ?? blockedId })),
					incomplete: status.incomplete.length, conflicts: status.conflicts.length,
				};
			},
			onOpenNote: (path, event) => {
				if (!entriesByPath.has(path)) return;
				activateEntry({
					app: this.app, settings: this.plugin.settings, path, event,
					openFull: (p, e) => openPath(this.app, p, e),
				});
			},
			onExactDateUpdate: (taskId, boundary, type) => writer.onExactDateUpdate(taskId, boundary, type),
			onRemoveDependency: removeDependency,
		});
		const model: GanttChartModel = {
			tasks: chartTasks, unscheduledCount: mapped.unscheduled.length, rowHeight: options.rowHeight,
			props: {
				defaultScale: options.scale, readOnly: options.readOnly, hierarchy: options.phases, showTaskList: options.showTaskList,
				collapsedIds: options.collapsedIds,
				onScaleChange: scale => this.persistScale(scale),
				onCollapsedChange: ids => this.setCollapsed(ids),
				formats,
				showRowNumbers: options.showRowNumbers, showDetail: options.showDetail, showTooltip: options.showTooltip,
				...(options.showDetail ? { renderDetail } : {}),
				showNonWorkingDays: options.showNonWorkingDays,
				workingWeekdays: options.workingWeekdays.split(',').map(Number).filter(day => day >= 0 && day <= 6),
				holidays: options.holidays.split(',').map(value => value.trim()).filter(Boolean), firstDayOfWeek: options.firstDayOfWeek,
				zoomOnWheel: options.zoomOnWheel, infiniteScroll: options.infiniteScroll,
				...(options.scrollToToday ? { initialScrollTo: 'today' as const } : {}),
				allowMove: editable && options.allowMove && writable(options.start) && Boolean(this.mutations.date),
				allowResize: editable && options.allowResize && writable(options.end) && Boolean(this.mutations.date),
				allowProgressChange: editable && options.allowProgress && writable(options.progress) && Boolean(this.mutations.property),
				allowLinkCreate: editable && options.allowLinkCreate && writable(options.dependsOn) && Boolean(this.mutations.dependency),
				allowLinkDelete: editable && options.allowLinkDelete && writable(options.dependsOn) && Boolean(this.mutations.dependency),
				allowReorder: editable && options.allowReorder && (writable(options.order) || writable(options.parent)) && Boolean(this.mutations.property),
				allowTaskCreate: canAddTask,
				onTasksChange: tasks => void writer.onTasksChange(tasks),
				onDependencyCreate: change => writer.onDependencyCreate(change),
				onDependencyDelete: change => writer.onDependencyDelete(change),
				onTaskMove: change => writer.onTaskMove(change),
				onTaskCreate: draft => void writer.onTaskCreate(draft),
			},
		};
		this.lastModel = model;
		this.chart.update(model);
		if (this.activeScale === null) this.activeScale = options.scale;
		else if (this.activeScale !== options.scale) {
			this.activeScale = options.scale;
			this.chart.setScale(options.scale);
		}
		this.toolbar.update(this.activeScale, canAddTask);
	}

	private setScale(scale: GanttOptions['scale']): void {
		this.chart.setScale(scale);
		this.persistScale(scale);
	}

	private persistScale(scale: GanttOptions['scale']): void {
		this.activeScale = scale;
		this.setTodayOffset(scale);
		this.toolbar.update(scale, Boolean(this.lastModel?.props.allowTaskCreate));
		if (this.config.get('ganttScale') !== scale) this.config.set('ganttScale', scale);
	}

	private setTodayOffset(scale: GanttOptions['scale']): void {
		this.containerEl.style.setProperty('--gantt-local-today-offset', `${localTodayOffsetPx(scale, new Date().getTimezoneOffset())}px`);
	}

	private parentIds(): string[] {
		if (!this.lastModel) return [];
		const ids = new Set(this.lastModel.tasks.map(task => task.parentId).filter((id): id is string => id !== null));
		return this.lastModel.tasks.map(task => task.id).filter(id => ids.has(id));
	}

	private setCollapsed(ids: string[]): void {
		if (!this.lastModel) return;
		this.lastModel = { ...this.lastModel, props: { ...this.lastModel.props, collapsedIds: ids } };
		this.chart.update(this.lastModel);
		this.persistCollapsed(ids);
	}

	private persistCollapsed(ids: string[]): void {
		const value = JSON.stringify(ids);
		if (this.config.get('ganttCollapsedIds') !== value) this.config.set('ganttCollapsedIds', value);
	}

	/**
	 * A base saved by an earlier version of this view (the released Frappe Gantt, or a development build)
	 * keeps its settings under other names. Copy them to the permanent keys once, and say so, so the option
	 * panel matches what the chart shows.
	 */
	private importLegacyOptions(): void {
		if (this.legacyOptionsChecked) return;
		this.legacyOptionsChecked = true;
		const imported = migrateLegacyOptions(this.config);
		if (imported.length > 0) {
			new Notice(`Gantt imported ${imported.length} setting${imported.length === 1 ? '' : 's'} from an earlier version of this view. ${this.config.get('ganttReadOnly') === false ? '' : ' The chart stays read-only until you turn off Read only.'}`);
		}
	}

	private revertTaskArray(tasks: Task[]): void {
		if (this.lastModel) this.lastModel = { ...this.lastModel, tasks };
		this.chart.revert(tasks);
	}

	private renderTaskArray(tasks: Task[]): void {
		if (!this.lastModel) return;
		this.lastModel = { ...this.lastModel, tasks };
		this.chart.update(this.lastModel);
	}

	/** Only the primitives that affect the chart's rendered output (spec §2.2). */
	private buildRenderSignatureInput(options: GanttOptions, visibleProperties: readonly string[]): RenderSignatureInput {
		const entries = this.data.groupedData.flatMap((group: { entries: { file: { path: string; stat?: { mtime: number } } }[] }) =>
			group.entries.map(entry => ({ path: entry.file.path, mtime: entry.file.stat?.mtime ?? 0 }))
		);
		const groupedData = this.data.groupedData as { hasKey(): boolean; key?: unknown }[];
		const groupKeys = groupedData.map(group => (group.hasKey() ? String(group.key) : ''));
		return {
			entries,
			order: visibleProperties,
			groupKeys,
			config: { ...options },
		};
	}

	private mutationProperties(groups: readonly EntrySnapshotGroup[], options: GanttOptions) {
		const entries = groups.flatMap(group => group.entries);
		const dateType = (property: string | null): GanttPropertyDateType => {
			if (!property) return 'date';
			return entries.some(entry => {
				const value = entry.values.get(property);
				return value?.kind === 'date' && value.hasTime;
			}) ? 'datetime' : 'date';
		};
		const entryDateType = (entry: EntrySnapshotGroup['entries'][number], property: string | null): GanttPropertyDateType => {
			const value = property ? entry.values.get(property) : undefined;
			return value?.kind === 'date' && value.hasTime ? 'datetime' : 'date';
		};
		const stored = (value: NormalizedValue | undefined): unknown => {
			if (!value || value.kind === 'missing') return undefined;
			if (value.kind === 'list') return value.items.map(item => stored(item)).filter(item => item !== undefined);
			if (value.kind === 'link') return wikiLinkText(value.target);
			if (value.kind === 'text' || value.kind === 'date' || value.kind === 'number' || value.kind === 'boolean') return value.value;
			if (value.kind === 'file') return value.path;
			return undefined;
		};
		return {
			...(options.start ? { start: { id: options.start, type: dateType(options.start) } } : {}),
			...(options.end ? { end: { id: options.end, type: dateType(options.end) } } : {}),
			progress: options.progress ?? undefined, parent: options.parent ?? undefined, order: options.order ?? undefined,
			dependsOn: options.dependsOn ?? undefined,
			// A List-type property cannot read several links back from one text value, so lists are the
			// default; only a property Obsidian types as plain text keeps the comma-string shape.
			dependsStorage: (options.dependsOn && PropertyTypeService.getObsidianPropertyType(options.dependsOn, this.app) === 'text'
				? 'text' : 'list') as 'text' | 'list',
			dateTypes: new Map(entries.map(entry => [entry.path, {
				start: entryDateType(entry, options.start), end: entryDateType(entry, options.end),
			}])),
			currentOrder: new Map(entries.map(entry => {
				const value = options.order ? entry.values.get(options.order) : undefined;
				return [entry.path, value?.kind === 'number' ? value.value : null] as const;
			})),
			currentDependsOn: new Map(entries.map(entry => [entry.path, stored(options.dependsOn ? entry.values.get(options.dependsOn) : undefined)])),
			resolveLink: (target: string) => this.app.metadataCache.getFirstLinkpathDest(target, '')?.path ?? null,
			// Write links the way Obsidian would (shortest path, per the vault's link settings), not as
			// full vault paths. Anything but a wikilink falls back to one, since parsing reads wikilinks.
			formatLink: (targetPath: string, sourcePath: string) => {
				const file = this.app.vault.getAbstractFileByPath(targetPath);
				const generated = file instanceof TFile ? this.app.fileManager.generateMarkdownLink(file, sourcePath) : '';
				return /^[[[^[]]+]]$/.test(generated) ? generated : toGanttWikiLink(targetPath);
			},
		};
	}

	private async createTask(draft: GanttTaskDraft, options: GanttOptions, dateType: GanttPropertyDateType): Promise<void> {
		if (!options.start || options.start.startsWith('formula.')) throw new Error('Configure a writable Start date property first.');
		if (!this.mutations.fileCreate) throw new Error('File creation capability is unavailable.');
		const fieldName = (property: string) => property.replace(/^note\./, '');
		const propertyDate = (value: string, boundary: 'start' | 'end') => writeGanttDate(value, dateType, boundary);
		const frontmatter: Record<string, unknown> = {
			[fieldName(options.start)]: propertyDate(draft.startDate, 'start'),
		};
		if (options.end && !options.end.startsWith('formula.')) {
			frontmatter[fieldName(options.end)] = propertyDate(draft.endDate, 'end');
		}
		const parseUtc = (value: string) => new Date(`${value}${/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'}`);
		const request = await new NoteTemplateService(this.app, {
			templatePath: options.templatePath, targetFolder: options.targetFolder, titleFormat: options.titleFormat,
		}).prepareNote({
			title: 'New note', start: parseUtc(draft.startDate), end: parseUtc(draft.endDate), allDay: dateType === 'date', frontmatter,
		}, this.creationFolder);
		const result = await this.mutations.fileCreate.createNote(request);
		if (!result.ok) throw new Error(result.message);
	}

	onunload(): void {
		this.runtime.dispose();
		this.containerEl.removeClass('unimian-gantt');
		this.containerEl.replaceChildren();
	}
}
