# EMI Pareto Explorer App

This app wraps the Tessier Lab `Emi_Pareto_Opt_ML` repository in a browser interface for exploring antibody binding datasets and Pareto-ranked protein variants.

## Live app

https://jack118672.github.io/emi-pareto-explorer/

Use the live link to open the app without installing anything.

## Run

To run locally:

```bash
npm start
```

Then open the URL printed by the server, usually:

```text
http://localhost:3000
```

The local version uses `app/server.js`. The GitHub Pages version loads the CSV files directly in the browser.

## Test

```bash
npm run check
```

## What the app does

- Loads the real EMI, isolated variant, and IgG binding datasets.
- Plots ANT Binding against OVA Binding.
- Ranks variants using ANT binding, OVA binding, and closeness to the selected target pI.
- Marks nondominated Pareto-front variants.
- Lets you inspect individual VH sequences from the plot or table.

## Target pI

Target pI is the preferred isoelectric point for a protein variant. The app gives variants a small score boost when their pI is close to the selected value.

pI is useful because protein charge can affect stability, solubility, purification, formulation, and developability. It is not the only ranking factor; binding and specificity still drive most of the score.

## What it uses

- `emi_binding.csv`
- `iso_binding.csv`
- `igg_binding.csv`

The original Python research scripts are unchanged. This app is for exploration and education, not clinical or medical decision-making.
