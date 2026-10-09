// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import { describe, expect, it } from "vitest";
import {
	appendGanttDependency,
	cleanLinkTarget,
	type LinkResolver,
	parseGanttDependencies,
	removeGanttDependencyFromAllTypes,
	toGanttWikiLink,
	wikiLinkText,
} from "../src/core/gantt/dependencies";

const paths = new Map([
	["Tasks/A", "Tasks/A.md"],
	["Tasks/B", "Tasks/B.md"],
	["A", "Tasks/A.md"],
	["B", "Tasks/B.md"],
]);
const resolve: LinkResolver = (target) => paths.get(target) ?? null;

describe("Gantt dependency conversion (GBETA-006)", () => {
	it("parses each dependency type, resolves aliases, and skips unresolved links", () => {
		expect(
			parseGanttDependencies(
				{
					FS: ["[[Tasks/A]]", "[[Missing]]"],
					SS: "[[B|Alias]], [[Tasks/A]]",
					FF: "[[Tasks/B]]",
					SF: "",
				},
				resolve,
			),
		).toEqual([
			{ targetId: "Tasks/A.md", type: "FS" },
			{ targetId: "Tasks/B.md", type: "SS" },
			{ targetId: "Tasks/A.md", type: "SS" },
			{ targetId: "Tasks/B.md", type: "FF" },
		]);
	});

	it("reports links that name no note instead of dropping them silently", () => {
		const unresolved: string[] = [];
		const parsed = parseGanttDependencies(
			{ FS: ["[[Tasks/A]]", "[[Nowhere]]", "Ghost"] },
			resolve,
			(target) => unresolved.push(target),
		);
		expect(parsed).toEqual([{ targetId: "Tasks/A.md", type: "FS" }]);
		expect(unresolved).toEqual(["Nowhere", "Ghost"]);
	});

	it("appends to a list and starts a list when nothing is stored", () => {
		expect(appendGanttDependency(["[[Missing]]"], "Tasks/B.md", resolve)).toEqual([
			"[[Missing]]",
			"[[Tasks/B]]",
		]);
		expect(appendGanttDependency(undefined, "Tasks/B.md", resolve)).toEqual(["[[Tasks/B]]"]);
		expect(appendGanttDependency("", "Tasks/B.md", resolve)).toEqual(["[[Tasks/B]]"]);
	});

	it("turns a text value into a list unless the property is text-typed", () => {
		expect(appendGanttDependency("[[Tasks/A]]", "Tasks/B.md", resolve)).toEqual([
			"[[Tasks/A]]",
			"[[Tasks/B]]",
		]);
		expect(appendGanttDependency("[[Missing]]", "Tasks/B.md", resolve, "text")).toBe(
			"[[Missing]], [[Tasks/B]]",
		);
		expect(appendGanttDependency("[[Missing]]\n[[Tasks/A]]", "Tasks/B.md", resolve, "text")).toBe(
			"[[Missing]]\n[[Tasks/A]]\n[[Tasks/B]]",
		);
		expect(appendGanttDependency(undefined, "Tasks/B.md", resolve, "text")).toBe("[[Tasks/B]]");
	});

	// Bases hands a text value stored in a List-type property back as ONE item. A second
	// dependency written as "[[A]], [[B]]" then vanished, taking the first line with it.
	it("reads several links out of one list item or text value", () => {
		const both = [
			{ targetId: "Tasks/A.md", type: "FS" },
			{ targetId: "Tasks/B.md", type: "FS" },
		];
		expect(parseGanttDependencies({ FS: ["[[Tasks/A]], [[Tasks/B]]"] }, resolve)).toEqual(both);
		expect(parseGanttDependencies({ FS: "[[Tasks/A]] [[B|Alias]]" }, resolve)).toEqual(both);
		expect(
			parseGanttDependencies({ FS: ["[[Tasks/A]]\n[[Tasks/B]]", "[[Tasks/A]]"] }, resolve),
		).toEqual(both);
		expect(parseGanttDependencies({ FS: "Tasks/A, Tasks/B" }, resolve)).toEqual(both);
	});

	// Each read-then-write round trip wrapped the target again: [[Note]] became [[[[Note]],
	// then [[[[[[Note]]. Wrapping is now idempotent and damaged values heal.
	it("wraps a link target exactly once, however many brackets it already carries", () => {
		expect(wikiLinkText("Tasks/A")).toBe("[[Tasks/A]]");
		expect(wikiLinkText("[[Tasks/A]]")).toBe("[[Tasks/A]]");
		expect(wikiLinkText("[[[[[[Tasks/A")).toBe("[[Tasks/A]]");
		expect(cleanLinkTarget(" [[Tasks/A]] ")).toBe("Tasks/A");
	});

	it("reads a value damaged by repeated wrapping", () => {
		const dependency = [{ targetId: "Tasks/A.md", type: "FS" }];
		expect(parseGanttDependencies({ FS: ["[[[[[[Tasks/A]]"] }, resolve)).toEqual(dependency);
		expect(parseGanttDependencies({ FS: "[[[[Tasks/A" }, resolve)).toEqual(dependency);
		expect(appendGanttDependency(["[[[[Tasks/A]]"], "Tasks/B.md", resolve)).toEqual([
			"[[Tasks/A]]",
			"[[Tasks/B]]",
		]);
	});

	it("writes the link text the caller generates, such as a shortest-path link", () => {
		expect(appendGanttDependency(undefined, "Tasks/B.md", resolve, "list", () => "[[B]]")).toEqual([
			"[[B]]",
		]);
	});

	it("repairs a malformed multi-link item into separate entries on the next append", () => {
		expect(appendGanttDependency(["[[Tasks/A]], [[Missing]]"], "Tasks/B.md", resolve)).toEqual([
			"[[Tasks/A]]",
			"[[Missing]]",
			"[[Tasks/B]]",
		]);
	});

	it("removes one link from a multi-link list item without touching the others", () => {
		expect(
			removeGanttDependencyFromAllTypes({ FS: ["[[Tasks/A]], [[Missing]]"] }, "Tasks/A.md", resolve)
				.FS,
		).toEqual(["[[Missing]]"]);
	});

	it("does not append a dependency that already resolves to the target", () => {
		const current = ["[[B|Existing alias]]"];
		expect(appendGanttDependency(current, "Tasks/B.md", resolve)).toBe(current);
	});

	it("removes a pair from every type and preserves unresolved values and storage shape", () => {
		expect(
			removeGanttDependencyFromAllTypes(
				{
					FS: ["[[Tasks/A]]", "[[Missing]]"],
					SS: "[[Tasks/A]], [[Missing]]",
					FF: "[[Missing]]\n[[A|Alias]]",
					SF: "[[Tasks/B]]",
				},
				"Tasks/A.md",
				resolve,
			),
		).toEqual({
			FS: ["[[Missing]]"],
			SS: "[[Missing]]",
			FF: "[[Missing]]",
			SF: "[[Tasks/B]]",
		});
	});

	it("writes the standard wiki-link form for a note", () => {
		expect(toGanttWikiLink("Tasks/B.md")).toBe("[[Tasks/B]]");
		expect(appendGanttDependency("[[Tasks/A]]", "Tasks/B.md", resolve, "text")).toBe(
			"[[Tasks/A]], [[Tasks/B]]",
		);
	});
});
