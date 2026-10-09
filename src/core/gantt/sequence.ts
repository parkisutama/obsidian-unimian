// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

export interface SequencedNode {
	id: string;
	parentId: string | null;
	order: number | null;
	inputIndex: number;
}

export interface NodeSequence {
	id: string;
	sequence: string;
}

/**
 * Orders dotted sequences ("1.2" before "1.10") segment by segment. Sequences are built here from
 * positive integers, so this needs no locale; `localeCompare` with `numeric` builds a collator on
 * every call and dominated the cost of mapping a few thousand notes.
 */
export function compareSequence(left: string, right: string): number {
	const a = left.split(".");
	const b = right.split(".");
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const difference = Number(a[index]) - Number(b[index]);
		if (difference !== 0) return difference;
	}
	return a.length - b.length;
}

/** Assigns depth-first dotted sequences, using Order when configured and input order otherwise. */
export function buildDepthFirstSequence<T extends SequencedNode>(
	nodes: readonly T[],
	useOrder: boolean,
): NodeSequence[] {
	const ids = new Set(nodes.map((node) => node.id));
	const children = new Map<string | null, T[]>();
	for (const node of nodes) {
		const parent = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
		const siblings = children.get(parent) ?? [];
		siblings.push(node);
		children.set(parent, siblings);
	}
	const compare = (left: T, right: T) => {
		if (useOrder) {
			const orderDifference =
				(left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY);
			if (orderDifference !== 0) return orderDifference;
		}
		return left.inputIndex - right.inputIndex || left.id.localeCompare(right.id);
	};
	for (const siblings of children.values()) siblings.sort(compare);

	const result: NodeSequence[] = [];
	const visit = (parentId: string | null, prefix: string) => {
		for (const [index, node] of (children.get(parentId) ?? []).entries()) {
			const sequence = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
			result.push({ id: node.id, sequence });
			visit(node.id, sequence);
		}
	};
	visit(null, "");
	return result;
}
