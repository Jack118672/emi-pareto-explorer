# App Guide

Patient MLDE Pareto Explorer turns the EMI antibody Pareto example into a browser tool for patient-context MLDE exploration.

## Use The Live App

https://jack118672.github.io/emi-pareto-explorer/

## Install On A Phone

Use the live app URL on your phone after GitHub Pages deploys.

On iPhone:

1. Open the live URL in Safari.
2. Tap the Share button.
3. Tap Add to Home Screen.
4. Open MLDE Pareto from the home screen.

On Android:

1. Open the live URL in Chrome.
2. Tap Install app if Chrome shows it, or open the menu.
3. Tap Install app or Add to Home screen.
4. Open MLDE Pareto from the home screen.

The app includes a manifest, service worker, and phone icons, so it can behave like a downloadable PWA.

## Add Your Own Data

Click **Import Data** and choose a `.csv`, `.tsv`, or `.txt` file. The file should include:

```text
sample,sequence,target_binding,off_target_binding,pI
```

Optional columns:

```text
patient_id,disease,mutation,target_antigen,source
```

The app also accepts original Tessier-style names like `VH Sequence`, `ANT Binding`, `OVA Binding`, and `pI_seq`.

## Outputs To Read

- **Data Profile** explains whether the current file is binary screening data or continuous measurements, then shows target/off-target/pI ranges and the top scored candidates.
- **Input Check** shows which imported columns mapped to the app fields and how many rows were dropped because required values were missing.
- **Rank Explanation** breaks the selected variant's score into target binding, specificity, pI match, and patient match.
- **Export CSV** downloads the current ranked and filtered table.

## Patient Context

Fill in the patient context fields with de-identified or synthetic values. The app compares those values against optional columns in your imported file and adds a patient-match objective to the score.

Good MLDE framing:

- `target_antigen`: receptor, antigen, tissue tropism, or delivery target
- `mutation`: tumor mutation, disease variant, or therapeutic design constraint
- `target_binding`: measured or predicted desired activity
- `off_target_binding`: nonspecific binding, toxicity signal, unwanted tropism, or other penalty
- `pI`: developability/formulation constraint

Do not import protected health information. This app is an educational/prototype explorer, not a clinical system.

## Download Templates

The app includes:

- `app/public/examples/custom_variant_template.csv`
- `app/public/examples/patient_context_template.csv`

## Package For Microsoft Store

The app includes a web manifest, service worker, and PNG icons. After deploying to GitHub Pages, submit the live URL to PWABuilder, generate an MSIX/PWA package, test it locally, and upload it through Microsoft Partner Center.
