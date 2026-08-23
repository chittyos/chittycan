# ChittyCan Capability Resolution

Canon design source: `chittycanon://docs/tech/spec/chittyentity-projection-taxonomy`.

That document is currently `DRAFT`; its new/re-scoped projection-family terms remain **PROPOSED**. ChittyCan routing must continue to resolve existing canonical capability IDs, ownership records, entity types, identity classes, and configuration pointers rather than treating proposed taxonomy labels as authority.

## ChittyCan is the verb surface

`can` means **Chitty can ...** and is intentionally general:

```text
can git ...
can gh ...
can docker ...
can brew ...
can <capability> ...
```

ChittyCan interprets intent, resolves an appropriate capability/tool/CLI, and executes or delegates according to policy. Canon lookup/validation is one routable capability; it is not the definition or ownership boundary of ChittyCan.

## Resolution rule

When routing ChittyOS-native capabilities, ChittyCan SHOULD resolve canonical capability/projection metadata through the governed control plane rather than embedding its own ontology.

Conceptually:

```text
user verb/intent
  -> capability resolution
  -> canonical capability + current governed projection/owner
  -> ChittyConfig environment/runtime pointer
  -> executable CLI/tool/agent/service
```

External CLIs such as Git, GitHub CLI, Docker, Homebrew, Kubernetes, etc. remain ordinary execution targets and do not require ChittyEntity classification merely because ChittyCan can invoke them.

ChittyCan may consume ChittyConfig, ChittyRegistry/Canon, ChittyMarket, or local adapters as routing inputs, but those projections must remain attributable to their current canonical owners.

## Learned-route boundary

Local command memory, successful-command examples, usage history, AI suggestions, and self-healing output are **routing hints**, not canonical capability records and not authority grants.

For ordinary external CLI commands, learned mappings may be reused according to normal execution policy.

For ChittyOS-native targets or any route that can mutate infrastructure, configuration, auth, legal/evidence state, deployment, billing, or other governed resources:

1. learned intent/command mappings may nominate a candidate target;
2. ChittyCan MUST re-resolve the current canonical capability/projection owner and applicable environment pointer before consequential execution;
3. stale learned mappings MUST NOT override current Canon/Registry/Config ownership or policy;
4. inability to resolve required authoritative metadata must fail closed or require the applicable approval path rather than treating memory as authority.

This allows ChittyCan to learn without letting historical local state become an unmanaged capability registry.
