# Product

## Register

product

## Users

maimai DX players tracking scores and comparing progress with friends, as described in README.md. Song hover cards help players quickly understand an individual chart performance while browsing their scores.

## Product Purpose

Make score comparisons understandable and useful for choosing what to play next. Statistical displays must explain the comparison population and distinguish achievement percentages from player percentiles.

## Design Principles

Keep the existing application style. For score comparisons, support both rating versus achievement and an increasing cumulative score curve so they can be evaluated together, as requested by the user. Keep shared rendering and data logic easy to simplify later. Display the player's actual score without silently clamping it to peer data.

## Brand Personality

Follow the existing app's compact, friendly, data-focused presentation and theme tokens.

## Anti-references

Avoid misleading smoothed distributions, delayed color changes, and unlabeled comparisons that obscure what the data represents.

## Accessibility & Inclusion

Use explicit text and marker shapes alongside color. Follow the existing theme and typography, expose chart descriptions, and keep comparison controls keyboard accessible.
