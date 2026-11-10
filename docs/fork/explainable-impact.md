# Explainable impact reports

GitNexus already answers "what depends on this symbol?" with a graph walk and
a risk label. A useful review needs two more answers: **why** a symbol appears
and **which evidence drove the risk label**. A file that imports a module is
different evidence from a function that directly calls a symbol.

This change adds evidence to the existing `impact` response and CLI output:

- `riskDrivers` lists the measured thresholds that produced the primary risk
  label. A HIGH risk caused by four affected processes reports
  `{axis:"processes", observed:4, threshold:3}`. LOW and UNKNOWN have no
  drivers; the existing `riskNote` explains UNKNOWN.
- `evidenceBreakdown.directByRelation` and `.allByRelation` count reached
  symbols by the selected traversal relation, including in `summaryOnly` mode.
  This makes an import-heavy blast radius visible before opening every page.
- Each returned symbol has one `evidencePath` from the target to that symbol.
  Upstream edges set `reversed:true`, because a caller points *toward* the
  target in the graph. `implicitSeed:true` identifies an internal expansion,
  such as entering a type's owning file before following its IMPORTS edges.

For example, an exported interface with eight importing files can produce:

```json
{
  "risk": "MEDIUM",
  "riskDrivers": [{ "axis": "direct", "observed": 8, "threshold": 5 }],
  "evidenceBreakdown": {
    "directByRelation": { "IMPORTS": 8 },
    "allByRelation": { "IMPORTS": 8 }
  },
  "evidencePath": [
    { "fromId": "Interface:src/options.ts:Options", "toId": "File:src/options.ts", "relationType": "DEFINES", "implicitSeed": true },
    { "fromId": "File:src/options.ts", "toId": "File:src/route.ts", "relationType": "IMPORTS", "reversed": true }
  ]
}
```

The path is a **representative witness**, chosen by the existing deterministic
BFS edge ordering. Other paths may exist. `IMPORTS` says a file imports the
target's file, not that it uses the named interface. The risk formula is
unchanged; the added evidence helps a reviewer decide what to inspect next.
Missing graph edges, truncated traversal, and incomplete enrichment remain
subject to the existing `partial`, `epistemic`, `riskScale`, and `riskNote`
warnings. Paths are built only for returned single-repository callgraph pages;
summary-only and cross-repository fanout skip path construction.

The change keeps GitNexus's original PolyForm Noncommercial license and
upstream history. It is not an official upstream release.
