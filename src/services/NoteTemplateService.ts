// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import {
  App,
  BasesView,
  Notice,
  parseYaml,
  stringifyYaml,
  TFile,
  normalizePath,
} from 'obsidian';
import type { NoteTemplateDefaults } from '../types/settings';
import type { NoteCreationRequest } from '../platform/mutations/types';
import {
  availablePath,
  createNoteFromTemplate,
  detectTemplateEngine,
  ensureFolder,
  noticePlainTemplate,
} from './templateEngine';

export interface NoteTemplateContext {
  title: string;
  start?: Date;
  end?: Date | null;
  allDay?: boolean;
  frontmatter: Record<string, unknown>;
}

interface TemplateParts {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Creates notes for Calendar events and Gantt tasks (docs/specs/note-template.md).
 *
 * The template file is processed by Templater or the core Templates plugin (see
 * `templateEngine.ts`); Unimian's `{{title|date|time|start|end}}` tokens apply only to the
 * title format, whose values the view itself computed, never to the template's own text.
 */
export class NoteTemplateService {
  constructor(
    private readonly app: App,
    private readonly settings: NoteTemplateDefaults,
  ) {}

  async createNote(view: BasesView, context: NoteTemplateContext): Promise<void> {
    const fileTitle = this.fileTitle(context);
    const template = this.getTemplateFile();

    if (!template) {
      await this.createWithoutTemplate(view, fileTitle, context);
      return;
    }

    const folder = normalizePath(this.settings.targetFolder || this.newNoteFolder());
    const path = availablePath(this.app, folder, fileTitle);
    const engine = detectTemplateEngine(this.app);
    const file = engine === 'plain'
      ? await this.createPlain(path, template, context)
      : await createNoteFromTemplate(this.app, engine, { template, path, frontmatter: context.frontmatter });
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  /**
   * Resolves the same title/template contract without writing. Scoped-write views pass the
   * result to FileCreateCapability instead of receiving direct vault access.
   */
  async prepareNote(context: NoteTemplateContext, fallbackFolder = ''): Promise<NoteCreationRequest> {
    const fileTitle = this.fileTitle(context);
    const template = this.getTemplateFile();
    const folder = normalizePath(this.settings.targetFolder || fallbackFolder);
    const path = availablePath(this.app, folder, fileTitle);

    if (template && detectTemplateEngine(this.app) !== 'plain') {
      return { path, frontmatter: context.frontmatter, templatePath: template.path };
    }
    if (!template) return { path, frontmatter: context.frontmatter, body: '' };

    const parts = await this.readPlainTemplate(template);
    noticePlainTemplate();
    return { path, frontmatter: { ...parts.frontmatter, ...context.frontmatter }, body: parts.body };
  }

  private async createWithoutTemplate(
    view: BasesView,
    fileTitle: string,
    context: NoteTemplateContext,
  ): Promise<void> {
    if (this.settings.targetFolder) {
      const folder = normalizePath(this.settings.targetFolder);
      await ensureFolder(this.app, folder);
      const file = await this.app.vault.create(
        availablePath(this.app, folder, fileTitle),
        this.compose(context.frontmatter, ''),
      );
      await this.app.workspace.getLeaf(false).openFile(file);
      return;
    }
    await view.createFileForView(fileTitle, (fm: Record<string, unknown>) => {
      Object.assign(fm, context.frontmatter);
    });
  }

  /** Last resort: nothing will process the template, so copy it as-is and say so. */
  private async createPlain(path: string, template: TFile, context: NoteTemplateContext): Promise<TFile> {
    const parts = await this.readPlainTemplate(template);
    noticePlainTemplate();
    await ensureFolder(this.app, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
    return this.app.vault.create(path, this.compose({ ...parts.frontmatter, ...context.frontmatter }, parts.body));
  }

  private async readPlainTemplate(template: TFile): Promise<TemplateParts> {
    return this.parseTemplate(await this.app.vault.cachedRead(template));
  }

  private getTemplateFile(): TFile | null {
    const templatePath = normalizePath(this.settings.templatePath);
    if (!templatePath) return null;
    const file = this.app.vault.getFileByPath(templatePath) ??
      this.app.vault.getFileByPath(`${templatePath}.md`);
    if (!file) new Notice(`Template note not found: ${templatePath}`);
    return file;
  }

  private newNoteFolder(): string {
    return this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '').path;
  }

  private parseTemplate(content: string): TemplateParts {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const yaml = match[1] ?? '';
    const body = content.slice(match[0].length);
    try {
      const parsed = parseYaml(yaml);
      return {
        frontmatter: parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {},
        body,
      };
    } catch {
      new Notice('Could not parse the template frontmatter.');
      return { frontmatter: {}, body };
    }
  }

  private compose(frontmatter: Record<string, unknown>, body: string): string {
    const yaml = stringifyYaml(frontmatter).trim();
    const renderedBody = body.trimStart();
    if (!yaml) return renderedBody;
    return `---\n${yaml}\n---\n${renderedBody}`;
  }

  private fileTitle(context: NoteTemplateContext): string {
    const rendered = this.renderTitleFormat(this.settings.titleFormat || context.title, context).trim() || context.title;
    return this.sanitizeFileName(rendered) || 'Untitled';
  }

  /** Substitutes the values the view computed. Only ever used on the title format. */
  private renderTitleFormat(format: string, context: NoteTemplateContext): string {
    const start = context.start;
    const end = context.end ?? undefined;
    const replacements: Record<string, string> = {
      title: context.title,
      date: start ? this.formatLocalDate(start) : '',
      time: start ? this.formatLocalTime(start) : '',
      start: start ? this.formatLocalDateTime(start, context.allDay ?? false) : '',
      end: end ? this.formatLocalDateTime(end, context.allDay ?? false) : '',
    };

    return format.replace(/\{\{\s*(title|date|time|start|end)\s*\}\}/g, (_, key: string) => replacements[key] ?? '');
  }

  private formatLocalDateTime(date: Date, allDay: boolean): string {
    if (allDay) return this.formatLocalDate(date);
    const tzOffset = date.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(tzOffset / 60));
    const offsetMinutes = Math.abs(tzOffset % 60);
    const offsetSign = tzOffset <= 0 ? '+' : '-';
    return `${this.formatLocalDate(date)}T${this.formatLocalTime(date)}:00${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
  }

  private formatLocalDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private formatLocalTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private sanitizeFileName(title: string): string {
    return title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  }
}
