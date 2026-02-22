#!/usr/bin/env node

import("../dist/index.js").catch(e => {
  console.error("[chitty] failed:", e?.message || e);
  process.exit(1);
});
