import { describe, expect, it } from 'vitest';
import { buildPhaseTree, SYNTHETIC_PHASE_PREFIX, type PhaseInput } from '../src/core/gantt/phases';

const task = (id: string, overrides: Partial<PhaseInput> = {}): PhaseInput => ({ id, name: id, ...overrides });

describe('Gantt phase tree (GBETA-007)', () => {
	it('nests in-result parent notes to unlimited depth', () => {
		const result = buildPhaseTree([
			task('Root.md'),
			task('Child.md', { parent: { id: 'Root.md', name: 'Root', resolved: true } }),
			task('Grandchild.md', { parent: { id: 'Child.md', name: 'Child', resolved: true } }),
		]);
		expect(result.nodes.map(node => [node.id, node.parentId, node.sequence])).toEqual([
			['Root.md', null, '1'],
			['Child.md', 'Root.md', '1.1'],
			['Grandchild.md', 'Child.md', '1.1.1'],
		]);
	});

	it('creates a read-only synthetic phase for a resolved parent outside results', () => {
		const result = buildPhaseTree([
			task('Child.md', { parent: { id: 'Projects/Parent.md', name: 'Parent phase', resolved: true } }),
		]);
		const parent = result.nodes[0]!;
		expect(parent).toMatchObject({ name: 'Parent phase', synthetic: true, sourceId: 'Projects/Parent.md', parentId: null });
		expect(parent.id.startsWith(SYNTHETIC_PHASE_PREFIX)).toBe(true);
		expect(result.nodes[1]).toMatchObject({ id: 'Child.md', parentId: parent.id, sequence: '1.1' });
	});

	it('falls back to root for an unresolved parent', () => {
		const result = buildPhaseTree([task('Child.md', { parent: { id: 'Missing', name: 'Missing', resolved: false } })]);
		expect(result.nodes).toEqual([expect.objectContaining({ id: 'Child.md', parentId: null, sequence: '1' })]);
	});

	it('creates top-level group phases, uses No value, and ignores cross-group parents', () => {
		const alpha = { key: 'alpha', label: 'Alpha' };
		const beta = { key: '', label: '' };
		const result = buildPhaseTree([
			task('Parent.md', { group: alpha }),
			task('Same.md', { group: alpha, parent: { id: 'Parent.md', name: 'Parent', resolved: true } }),
			task('Cross.md', { group: beta, parent: { id: 'Parent.md', name: 'Parent', resolved: true } }),
		]);
		const alphaRow = result.nodes.find(node => node.synthetic && node.name === 'Alpha')!;
		const emptyRow = result.nodes.find(node => node.synthetic && node.name === 'No value')!;
		expect(result.nodes.find(node => node.id === 'Parent.md')?.parentId).toBe(alphaRow.id);
		expect(result.nodes.find(node => node.id === 'Same.md')?.parentId).toBe('Parent.md');
		expect(result.nodes.find(node => node.id === 'Cross.md')?.parentId).toBe(emptyRow.id);
	});

	it('sorts siblings by configured Order and otherwise preserves Bases input order', () => {
		const inputs = [task('First.md', { order: 20 }), task('Second.md', { order: 10 }), task('Third.md')];
		expect(buildPhaseTree(inputs).nodes.map(node => node.id)).toEqual(['First.md', 'Second.md', 'Third.md']);
		expect(buildPhaseTree(inputs, true).nodes.map(node => node.id)).toEqual(['Second.md', 'First.md', 'Third.md']);
	});

	it('reports every member of self-links and cycles and moves offenders to root', () => {
		const result = buildPhaseTree([
			task('Self.md', { parent: { id: 'Self.md', name: 'Self', resolved: true } }),
			task('A.md', { parent: { id: 'B.md', name: 'B', resolved: true } }),
			task('B.md', { parent: { id: 'A.md', name: 'A', resolved: true } }),
		]);
		expect(result.cycles).toEqual(['A.md', 'B.md', 'Self.md']);
		for (const node of result.nodes) expect(node.parentId).toBeNull();
	});

	it('maintains parent/sequence consistency across deterministic random trees', () => {
		let state = 0x5eed;
		const random = () => {
			state = (state * 1664525 + 1013904223) >>> 0;
			return state / 0x1_0000_0000;
		};
		for (let run = 0; run < 100; run += 1) {
			const inputs: PhaseInput[] = [];
			for (let index = 0; index < 40; index += 1) {
				const group = random() < 0.7 ? { key: `g${Math.floor(random() * 3)}`, label: 'Group' } : null;
				const parentIndex = index > 0 && random() < 0.75 ? Math.floor(random() * index) : -1;
				inputs.push(task(`Task-${index}.md`, {
					group,
					order: random() < 0.7 ? Math.floor(random() * 20) : null,
					parent: parentIndex >= 0 ? { id: `Task-${parentIndex}.md`, name: 'Parent', resolved: true } : null,
				}));
			}
			const nodes = buildPhaseTree(inputs, true).nodes;
			const byId = new Map(nodes.map((node, index) => [node.id, { node, index }]));
			for (const [index, node] of nodes.entries()) {
				if (node.parentId === null) expect(node.sequence).toMatch(/^\d+$/);
				else {
					const parent = byId.get(node.parentId)!;
					expect(parent.index).toBeLessThan(index);
					expect(node.sequence.startsWith(`${parent.node.sequence}.`)).toBe(true);
				}
			}
			expect(new Set(nodes.map(node => node.sequence)).size).toBe(nodes.length);
		}
	});
});
