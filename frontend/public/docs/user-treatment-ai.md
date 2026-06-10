# Before & After Treatment — AI Score Preview

## Overview

When you apply treatments to a path version, PSAT calculates a **predicted score** for each segment after the treatment is applied. This before/after comparison lets you evaluate the safety impact of a treatment before committing to it.

The comparison is visible on the **Treatment Detail Page** and in the **Crash Type Scores** panel wherever a treated version is loaded.

---

## How the Before / After Comparison Works

1. **Before score** — the original crash type scores (BB, BP, SB, VB, Risk Score) computed from the coded attributes.
2. **Treatment applied** — selected treatments modify one or more attribute values on the relevant segments (e.g., installing a safety barrier changes *Adjacent Severe Hazard*).
3. **After score** — PSAT re-runs the CycleRAP scoring formula with the updated attribute values to produce a predicted post-treatment score.

The difference (reduction) is shown as a **↓ value** beneath each crash type score card. A green indicator confirms improvement; no arrow means the treatment did not affect that crash type.

---

## Reading the Score Cards

When a treated version is displayed:

- Each card shows the **post-treatment score** in large text.
- A **↓ X.XX** delta beneath it shows how much the score decreased.
- The card background colour reflects the **post-treatment band** — if a treatment moved a segment from High to Medium, the card will now show the Medium (yellow/orange) colour.

---

## AI-Assisted Treatment Description

On the **Treatment Detail Page**, an AI-generated narrative summarises the expected safety improvement. It describes:

- Which attributes are being modified by the treatment.
- Which crash types are most affected and why.
- The magnitude of the predicted score reduction.

This text is generated automatically based on the treatment definition and the attribute changes — no manual input is required.

---

## Applying Treatments

1. Open the **Treatment Page** from the sidebar.
2. Select a treatment type from the dropdown.
3. Choose the segments to apply it to (individually or by filter).
4. Click **Preview** to see the before/after score comparison without saving.
5. Click **Apply** to commit the treatment to the current version.

> **Note:** Previewing a treatment does not modify the project. You can preview multiple treatment combinations before deciding which to apply.

---

## Tips

- Treatments are applied to a **version** of the project, not the original. You can create multiple versions to compare different treatment strategies.
- If a treatment does not produce a score improvement, check whether the relevant attributes are already at their best value for that segment — PSAT will flag this.
