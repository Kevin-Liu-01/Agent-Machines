---
name: loading-screens
description: >-
  Implement loading states using braille Unicode spinners and skeleton
  placeholders. Use when adding loading indicators, replacing spinners,
  or building new loading screens. Covers component API, sizing, spinner
  selection, and anti-patterns.
allowed-tools: Read, Grep, Glob, StrReplace, Write, Shell
---

# Loading Screens

Braille Unicode spinners are the canonical loading indicator. Skeletons for
layout preservation. Never a blank screen.

## Wiki reference

Read `~/Documents/GitHub/kevin-wiki/wiki/design/loading-screens.md` for the full
design rationale, anti-patterns, and loading screen hierarchy.

## Component

The `BrailleSpinner` lives at `apps/website/components/ui/braille-spinner.tsx`.

```tsx
import { BrailleSpinner } from "@/components/ui/braille-spinner";
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `BrailleSpinnerName` | `"braille"` | Which spinner animation |
| `label` | `string` | — | Text after the spinner character |
| `className` | `string` | — | Tailwind classes (sizing, color) |

### Sizing map

| Context | Class |
|---------|-------|
| Tiny (upvote, badge) | `text-xs` |
| Button inline | `text-sm` |
| Default body | `text-base` |
| Section header | `text-lg` |
| Page overlay | `text-2xl` |

### Color

Inherit from parent with `text-current`, or set explicitly:

- `text-muted-foreground` — default loading states
- `text-primary` — branded actions (billing, key generation)
- `text-destructive` — destructive action in progress

## Patterns

### Page-level loading (Next.js `loading.tsx`)

Braille spinner overlay + skeleton layout matching the page structure:

```tsx
import { BrailleSpinner } from "@/components/ui/braille-spinner";
import { Skeleton } from "@/components/ui/skeleton";

export default function PageLoading() {
  return (
    <div>
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <BrailleSpinner name="braille" className="text-muted-foreground text-2xl" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
    </div>
  );
}
```

### Button loading

Replace button text with spinner + label:

```tsx
<Button disabled={isLoading}>
  {isLoading ? (
    <BrailleSpinner name="braille" label="Saving..." className="text-sm" />
  ) : (
    "Save"
  )}
</Button>
```

### Inline status

Small spinner next to status text:

```tsx
<BrailleSpinner name="braille" className="text-muted-foreground text-xs" />
```

## Spinner selection

Use `braille` as the default everywhere. Other spinners for thematic variety:

| Spinner | Use case |
|---------|----------|
| `braille` | Default for all loading states |
| `scan` | Search, indexing, scanning |
| `cascade` | Deployments, multi-step processes |
| `helix` | Data processing, transforms |
| `orbit` | Status polling, syncing |
| `breathe` | Idle waiting, background tasks |

## Custom spinners

Use [dab](https://obaidnadeem.github.io/dab/) to design new braille animations.
The `unicode-animations` library also exposes grid utilities:

```ts
import { gridToBraille, makeGrid } from "unicode-animations";

const grid = makeGrid(4, 4);
grid[0][0] = true;
console.log(gridToBraille(grid));
```

## Anti-patterns

1. **No SVG/CSS ring spinners.** Do not use `animate-spin` on `<div>` borders
   or Lucide `Loader2`. Use `BrailleSpinner`.
2. **No spinner-only pages.** Always pair with skeletons.
3. **No static "Loading..." text.** Use a spinner for visual feedback.
4. **No spinning Lucide icons.** `Loader2` with `animate-spin` is banned for
   loading states. Lucide icons are fine as static icons.

## Checklist

When adding or modifying a loading state:

- [ ] Uses `BrailleSpinner`, not `Loader2`/CSS spinner
- [ ] Page-level loading has skeleton layout matching final content
- [ ] Button loading replaces text with spinner + label
- [ ] Spinner color matches context (muted, primary, destructive)
- [ ] Spinner sizing matches surrounding text/icon scale
- [ ] `aria-label` is meaningful (auto-set by component)
