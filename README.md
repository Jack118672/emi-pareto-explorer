# Patient MLDE Pareto Explorer

This repository contains the Tessier Lab `Emi_Pareto_Opt_ML` research code plus a browser app for exploring MLDE-style therapeutic variant ranking. The app keeps the original EMI antibody datasets and adds custom CSV/TSV import, de-identified patient context, live variant entry, Pareto-front marking, and PWA files for install/Microsoft Store packaging.

Live app:

https://jack118672.github.io/emi-pareto-explorer/

## Install On A Phone

After GitHub Pages deploys, open the live app URL on your phone.

- iPhone: open in Safari, tap Share, then Add to Home Screen.
- Android: open in Chrome, then tap Install app or Add to Home screen.

The app includes mobile PWA install support, an install card inside the UI, service-worker caching, and phone icons.

## Run

```bash
npm start
```

Then open the URL printed by the server, usually:

```text
http://localhost:3000
```

## Check

```bash
npm run check
```

## What The App Does

- Loads the real `emi_binding.csv`, `iso_binding.csv`, and `igg_binding.csv` files.
- Imports your own `.csv`, `.tsv`, or `.txt` variant files in the browser.
- Accepts de-identified patient context such as patient ID, disease, mutation, and target antigen.
- Ranks candidates using target binding, low off-target binding, closeness to target pI, and patient-context match.
- Marks nondominated Pareto-front variants.
- Shows data-profile outputs: binary vs continuous measurements, target/off-target/pI ranges, sequence-length range, and top scored candidates.
- Shows an input-check output for imported files, including column mapping and dropped-row counts.
- Explains the selected candidate's score with objective components and weights.
- Exports the current ranked/filtered table as CSV.
- Lets you add a single new variant in real time during a session.
- Stores browser imports locally with `localStorage`; data is not uploaded by the static app.

This app is for education, MLDE exploration, and project prototyping. It is not a clinical decision-making tool. Do not import protected health information.

## Custom Data Format

Use the downloadable template in `app/public/examples/custom_variant_template.csv`.

Required columns, with common aliases accepted:

| Meaning | Preferred column | Accepted examples |
| --- | --- | --- |
| Variant name | `sample` | `variant`, `variant_id`, `id`, `name` |
| Amino-acid sequence | `sequence` | `VH Sequence`, `protein_sequence`, `amino_acid_sequence` |
| Desired activity | `target_binding` | `ANT Binding`, `affinity`, `activity`, `target` |
| Undesired binding | `off_target_binding` | `OVA Binding`, `nonspecific_binding`, `off_target` |
| Isoelectric point | `pI` | `pI_seq`, `isoelectric_point` |

Optional patient/context columns:

```text
patient_id,disease,mutation,target_antigen,source
```

For real-time patient-specific use, keep the patient values de-identified and map clinical facts into MLDE design constraints. Example: a tumor mutation or receptor becomes `target_antigen`/`mutation`, while measured or predicted protein variants remain the rows being ranked.

## Useful Online Example Data

- Tessier Lab EMI antibody data: https://github.com/Tessier-Lab-UMich/Emi_Pareto_Opt_ML
- Synthea synthetic patient generator and downloads: https://github.com/synthetichealth/synthea and https://synthea.mitre.org/downloads
- cBioPortal clinical/mutation file formats: https://docs.cbioportal.org/file-formats/
- MAF mutation-file examples and tooling: https://github.com/PoisonAlien/maftools

The cleanest workflow is to use synthetic Synthea patient files or de-identified cBioPortal-style clinical/mutation rows to create the optional patient-context columns, then use MLDE experiment or prediction outputs for the sequence/binding/pI columns.

## What The Built-In Data Means

- `emi_binding.csv`: 4,000 training-library variants with binary `ANT Binding` and `OVA Binding` labels. A `1` means the variant appeared in an enriched/sorted gate; a `0` means it did not.
- `iso_binding.csv`: 126 isolated out-of-library variants with continuous binding measurements.
- `igg_binding.csv`: 96 IgG-format variants with continuous binding values plus extra columns such as `ANT STDEV`, `OVA STDEV`, `SMP Binding`, `Blosum62`, `Scaffold`, and `Interpolation`.

In the app, "target" means the desired activity or binding objective, while "off-target" means nonspecific binding or another penalty objective. For the original EMI data, target maps to `ANT Binding` and off-target maps to `OVA Binding`.

## Microsoft Store Path

The app is now a PWA:

- `app/public/manifest.json`
- `app/public/service-worker.js`
- `app/public/icons/icon-192.png`
- `app/public/icons/icon-512.png`

Microsoft's PWA Store path uses Partner Center plus PWABuilder/MSIX packaging. After the GitHub Pages deployment updates, use the live URL in PWABuilder, generate the Windows package, test the package locally, then submit it in Microsoft Partner Center.

Microsoft docs: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store
