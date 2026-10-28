# ChittyCan Control-Plane CLI

`chittycan` is the canonical POSIX-shell interface for ChittyOS control-plane
operations. `can` remains the short interactive alias.

## Runtime boundary

| Environment | Interface |
| --- | --- |
| GitHub Actions, local shells, host runners, agent Bash tools | `chittycan` |
| Cloudflare Worker isolates | Service Bindings / `env.*.fetch()` |

Workers do not spawn `chittycan`; they call the same governed service contracts
through internal bindings. Shell environments do not recreate auth headers or
raw HTTP request logic; they use the CLI.

## Identity

`chittycan auth login --oidc` is intentionally non-persistent. In GitHub Actions
the CLI requests a fresh GitHub OIDC token for each invocation. It never writes
the JWT to the ChittyCan config file.

## Capability contract

ChittyConnect's current charter defines capabilities as **single-operation** and
opaque. A token is bound to one of `read | commit | tag | push`, plus caller,
tenant, repo path, and (where applicable) concrete ref/remote.

Therefore `chittycan cap mint` accepts one `--op`. Higher-level transactions such
as `chittycan git stage-pr` own the choreography of multiple operation-scoped
capabilities; scripts must not reuse one capability for read + commit + push.

`chittycan cap mint` redacts the token in normal output. `--quiet` is the explicit
machine-consumption mode and emits only the opaque `cap_*` reference.

## Current command surface

```text
chittycan auth login --oidc
chittycan auth verify-custody --strict --json

chittycan cap mint --caller-chittyid ... --tenant ... --op read --repo-path ...
chittycan cap introspect cap_... --op read --repo-path ...

chittycan canon validate FILES... --strict-pltea
chittycan canon resolve --scope ... --json

chittycan config drift-check --folder-id ...
chittycan config reconcile --from-drive
chittycan config reconcile --from-git --sha ... --approval ...

chittycan pr trace --repo ... --pr ...
chittycan pr approve --repo ... --pr ... --reason ...
chittycan pr hold --repo ... --pr ...

chittycan git stage-pr ...
```

### `git stage-pr` status

This command intentionally fails closed today because the canonical
`chittyagent-git` charter is still read-only. It must not silently fall back to
raw GitHub credentials or direct REST writes. Once ChittyEntity #789 lands an
audited write projection, this command becomes the shell/CI facade for that
transaction.

## GitHub Actions

Use `templates/github-actions/chitty-sop-gate.yml` as the source template for
repositories containing `02_System_Instructions/` projections. It uses GitHub
OIDC and `chittycan` only; there are no inline `curl` or `node -e` control-plane
requests.

## #228 closure harness

`scripts/verify-228-closure.sh` is the executable closure gate. It intentionally
requires explicit canonical caller/tenant/repository inputs and uses only
`chittycan` + `jq`. Until #789 exists, it stops at Gate 4/5 rather than bypassing
the missing governed write path.
