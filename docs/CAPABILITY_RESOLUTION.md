# ChittyCan Capability Resolution

Normative projection taxonomy: `chittycanon://docs/tech/spec/chittyentity-projection-taxonomy`.

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
  -> canonical capability/entity projection
  -> environment/runtime pointer
  -> executable CLI/tool/agent/service
```

External CLIs such as Git, GitHub CLI, Docker, Homebrew, Kubernetes, etc. remain ordinary execution targets and do not require ChittyEntity classification merely because ChittyCan can invoke them.

ChittyCan may consume ChittyConfig, ChittyRegistry/Canon, ChittyMarket, or local adapters as routing inputs, but those projections must remain attributable to their canonical owners.
