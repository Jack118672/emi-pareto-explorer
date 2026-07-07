# EMI Pareto Explorer

This repository contains the Tessier Lab `Emi_Pareto_Opt_ML` research code plus a lightweight local browser app for exploring the binding datasets.

## Run the app

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Check the app

```bash
npm run check
```

## What the app does

- Loads the real `emi_binding.csv`, `iso_binding.csv`, and `igg_binding.csv` files.
- Shows ANT binding vs OVA binding in an interactive browser view.
- Ranks variants using ANT binding, OVA binding, and closeness to a selected target pI.
- Marks nondominated Pareto-front candidates.

The original Python scripts and datasets are still included.
