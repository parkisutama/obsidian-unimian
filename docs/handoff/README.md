# Agent handoff protocol

`current.md` is the current branch's handoff record. Read it together with `AGENTS.md`, the linked plan, and the actual Git state. This document does not authorize extra work or override maintainer instructions.

Ubuntu owns implementation and automated validation. Windows owns native Windows acceptance. Linux native Obsidian acceptance, if performed, is recorded separately. Use the same feature branch; there is no Windows integration branch. GitHub Flow and release-please remain unchanged.

1. The current writer records completed work, pending work, blockers, the exact code commit under test, commands/results, and the next owner.
2. Commit and push the branch when authorized. Do not place private session history or credentials in Git.
3. The receiving agent fetches, checks for local changes/divergence, and fast-forwards before acting. Compare the intended branch and code SHA explicitly.
4. During native testing, Ubuntu implementation pauses. Windows records results against the tested code SHA in a separate documentation commit, then hands the turn back.
5. Ubuntu pulls the results before changing code. If code changes, assess which earlier results remain applicable; never silently mark them current.

Required fields in `current.md`: date, branch, state, owner/next owner, source or tested code SHA, environment, changes made, checks and evidence, blockers, next actions, authorization boundaries. Before a real test run, record a full code SHA. An initial checkpoint may identify itself by the containing handoff commit; resolve it with Git before testing.

Only one writer acts at a time. Prefer a small handoff update over another status system. Native acceptance and automated checks are distinct. Never merge a Release PR, create a tag, or publish a release as a handoff action.
