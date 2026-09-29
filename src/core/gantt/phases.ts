// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { buildDepthFirstSequence, compareSequence } from './sequence';

export const SYNTHETIC_PHASE_PREFIX = 'unimian-synthetic://';

export interface PhaseParentLink { id: string; name: string; resolved: boolean }
export interface PhaseGroup { key: string; label: string }
export interface PhaseInput {
	id: string;
	name: string;
	parent?: PhaseParentLink | null;
	group?: PhaseGroup | null;
	order?: number | null;
}
export interface PhaseNode {
	id: string;
	name: string;
	parentId: string | null;
	sequence: string;
	order: number | null;
	inputIndex: number;
	synthetic: boolean;
	sourceId: string | null;
}
export interface PhaseTreeResult { nodes: PhaseNode[]; cycles: string[] }

const groupKey = (input: PhaseInput) => input.group?.key ?? null;
const groupId = (key: string) => `${SYNTHETIC_PHASE_PREFIX}group/${encodeURIComponent(key)}`;
const externalId = (group: string | null, parent: string) =>
	`${SYNTHETIC_PHASE_PREFIX}parent/${encodeURIComponent(group ?? '')}/${encodeURIComponent(parent)}`;

function cycleMembers(inputs: readonly PhaseInput[], byId: ReadonlyMap<string, PhaseInput>): Set<string> {
	const state = new Map<string, 0 | 1 | 2>();
	const stack: string[] = [];
	const cycles = new Set<string>();
	const visit = (id: string) => {
		if (state.get(id) === 2) return;
		if (state.get(id) === 1) {
			for (const member of stack.slice(stack.indexOf(id))) cycles.add(member);
			return;
		}
		state.set(id, 1);
		stack.push(id);
		const input = byId.get(id)!;
		const parent = input.parent?.resolved ? byId.get(input.parent.id) : undefined;
		if (parent && groupKey(parent) === groupKey(input)) visit(parent.id);
		stack.pop();
		state.set(id, 2);
	};
	for (const input of inputs) visit(input.id);
	return cycles;
}

export function buildPhaseTree(inputs: readonly PhaseInput[], useOrder = false): PhaseTreeResult {
	const byId = new Map(inputs.map(input => [input.id, input]));
	const cycles = cycleMembers(inputs, byId);
	const nodes: Omit<PhaseNode, 'sequence'>[] = [];
	const synthetic = new Map<string, Omit<PhaseNode, 'sequence'>>();
	const ensureSynthetic = (node: Omit<PhaseNode, 'sequence'>) => {
		if (!synthetic.has(node.id)) { synthetic.set(node.id, node); nodes.push(node); }
	};

	for (const [index, input] of inputs.entries()) {
		const group = input.group ?? null;
		const rootParent = group ? groupId(group.key) : null;
		if (group) ensureSynthetic({ id: rootParent!, name: group.label.trim() || 'No value', parentId: null, order: null, inputIndex: index, synthetic: true, sourceId: null });

		let parentId = rootParent;
		const parent = input.parent;
		if (!cycles.has(input.id) && parent?.resolved) {
			const internal = byId.get(parent.id);
			if (internal && groupKey(internal) === groupKey(input)) parentId = internal.id;
			else if (!internal) {
				parentId = externalId(groupKey(input), parent.id);
				ensureSynthetic({ id: parentId, name: parent.name, parentId: rootParent, order: null, inputIndex: index, synthetic: true, sourceId: parent.id });
			}
		}
		nodes.push({ id: input.id, name: input.name, parentId, order: input.order ?? null, inputIndex: index, synthetic: false, sourceId: input.id });
	}

	const sequenceById = new Map(buildDepthFirstSequence(nodes, useOrder).map(item => [item.id, item.sequence]));
	return {
		nodes: nodes
			.map(node => ({ ...node, sequence: sequenceById.get(node.id)! }))
			.sort((left, right) => compareSequence(left.sequence, right.sequence)),
		cycles: [...cycles].sort(),
	};
}
