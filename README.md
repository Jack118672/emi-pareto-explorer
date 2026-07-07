# EMI Pareto Explorer

This repository contains the Tessier Lab `Emi_Pareto_Opt_ML` research code plus a browser app for exploring antibody binding datasets and Pareto-ranked protein variants.

## Live app

https://jack118672.github.io/emi-pareto-explorer/

Open the link above to use the app online. No installation is needed for the live version.

## Run the app

To run the app on your own computer, install Node.js and use:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

The local version uses the Node server in `app/server.js`. The GitHub Pages version loads the CSV files directly in the browser.

## Check the app

```bash
npm run check
```

## What the app does

- Loads the real `emi_binding.csv`, `iso_binding.csv`, and `igg_binding.csv` files.
- Shows ANT binding vs OVA binding in an interactive browser view.
- Ranks variants using ANT binding, OVA binding, and closeness to a selected target pI.
- Marks nondominated Pareto-front candidates.
- Lets you switch between the EMI library, isolated variants, and IgG variants.
- Lets you click points or table rows to inspect individual VH sequences.

## Target pI

Target pI means the preferred isoelectric point for a protein variant. The app gives a small ranking boost to variants whose pI is closer to the selected value.

pI matters because protein charge can affect stability, solubility, purification, formulation, and how practical a candidate may be to develop. Binding still matters most in this app, but pI helps filter for more developable variants.

## Data

The original Python scripts and datasets are still included.

Main app datasets:

- `emi_binding.csv`
- `iso_binding.csv`
- `igg_binding.csv`

This app is for exploration and education. It is not a clinical or medical decision-making tool.
