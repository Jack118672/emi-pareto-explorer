# EMI Pareto Explorer App

This app wraps the Tessier Lab `Emi_Pareto_Opt_ML` repository in a local browser interface.

## Run

```bash
npm start
```

Then open the URL printed by the server, usually:

```text
http://localhost:3000
```

## Test

```bash
npm run check
```

## What it uses

- `emi_binding.csv`
- `iso_binding.csv`
- `igg_binding.csv`

The original Python research scripts are unchanged. The app computes a local candidate score from ANT binding, OVA binding, and distance from the selected pI target, then marks nondominated Pareto-front variants.
