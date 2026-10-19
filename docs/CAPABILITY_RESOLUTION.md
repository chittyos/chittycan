# ChittyCan Capability Resolution

Canon design source: `chittycanon://docs/tech/spec/chittyentity-projection-taxonomy`.

That document is currently `DRAFT`; its new/re-scoped projection-family terms remain **PROPOSED**. ChittyCan routing must continue to use existing canonical capability IDs, ownership records, entity types, identity classes, and configuration pointers rather than treating proposed taxonomy labels as authority.

## ChittyCan is the verb surface

`can` means **Chitty can ...** and is intentionally general.

Currently supported direct CLI examples include:

```text
can git ...
can gh ...
can docker ...
can kubectl ...
```

The broader model intentionally allows future adapters such as `can brew ...` and `can <capability> ...`; an example is not considered shipped until its adapter/allowlist path exists and is tested.

ChittyCan interprets intent, resolves an appropriate capability/tool/CLI, and executes or delegates according to policy. Canon lookup/validation is one routable capability; it is not the definition or ownership boundary of ChittyCan.

## Resolution model

Target-state routing for ChittyOS-native capabilities is:

```text
user verb/intent
  -> capability resolution
  -> canonical capability + current governed projection/owner
  -> ChittyConfig environment/runtime pointer
  -> executable CLI/tool/agent/service
```

External CLIs such as Git, GitHub CLI, Docker, Homebrew, Kubernetes, etc. are execution targets and do not require ChittyEntity classification merely because ChittyCan can invoke them. Actual direct support remains determined by the installed/allowed adapter set.

## Current enforcement boundary

The current CLI does **not yet implement a universal fail-closed Canon/Registry re-resolution gate before every consequential command**. Local memory and AI interpretation can influence generated shell commands, which are then subject to the current confirmation/execution flow.

Therefore, until the canonical re-resolution gate is implemented:

- documentation MUST NOT treat canonical re-resolution as an existing safety guarantee;
- learned/local command history is non-authoritative;
- existing confirmation and command-specific controls remain the active enforcement path;
- ChittyOS-native or high-impact routing should not treat learned records as proof of current ownership or authority.

## Learned-route boundary

Local command memory, successful-command examples, usage history, AI suggestions, self-healing output, and `LearnedTool` records are **learning/routing hints**, not canonical capability records and not authority grants.

Current learned-tool registration does not preserve sufficient canonical owner/projection provenance to qualify those records as authoritative ChittyOS routing inputs. Until that provenance is implemented and validated, learned-tool records are outside the authoritative resolution chain.

### Target-state requirement

For ChittyOS-native targets or any route that can mutate infrastructure, configuration, auth, legal/evidence state, deployment, billing, or other governed resources, the intended governed flow is:

1. learned intent/command mappings may nominate a candidate target;
2. ChittyCan re-resolves the current canonical capability/projection owner and applicable ChittyConfig environment pointer before consequential execution;
3. stale learned mappings cannot override current Canon/Registry/Config ownership or policy;
4. inability to resolve required authoritative metadata fails closed or enters the applicable approval path;
5. learned records used in resolution preserve their stable record ID plus source/projection provenance through any Registry/Market/local-adapter sync.

This is target-state behavior and requires implementation before operators may rely on it as an enforcement guarantee.
