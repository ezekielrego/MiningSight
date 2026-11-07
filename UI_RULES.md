# MiningSight UI Rules

This interface is a dense desktop-style mining and 3D inspection workstation. Future changes should extend the existing visual language instead of introducing a new design system.

## Visual language

- Use the dark neutral palette: page background `#292929`, menu background `#323232`, toolbar background `#3a3a3a`, grouped-control background `#313131`, and borders around `#222`/`#1e1e1e`.
- Use warm orange `#e88724` for primary actions, active states, AI actions, and important emphasis. Use blue `#4ea3e8` for secondary tools, navigation, and informational controls.
- Keep text compact and muted by default: `#dfdfdf` for primary labels, `#cfcfcf` for menus, and `#999`/`#aaa` for secondary text.
- Prefer 1px borders, subtle inset/shadow treatment, and 2px corner radii. Avoid large rounded cards, gradients, or excessive whitespace.

## Layout rules

- Preserve the compact workstation hierarchy: 22px menu bar, 40px main toolbar, dense panels, and a full-height viewport.
- Keep top navigation divided into left menus, centered project branding, and right-side utilities.
- Group related toolbar controls inside `bg-[#313131]` containers with `p-0.5`, `space-x-0.5`, a 1px border, and a 2px radius.
- Use compact controls around 28px high and 10–11px labels unless a panel requires a larger touch target.
- Maintain `overflow-hidden` at the application shell and use the existing thin scrollbar styling for scrollable regions.

## Interaction rules

- Every icon-only control must have a useful `title`; important actions should also have a visible text label.
- Active controls use orange fill with dark text. Hover states should brighten the existing background or use the blue/orange accent; do not introduce unrelated colors.
- Use native links for navigation between interfaces so refresh, keyboard navigation, and opening in a new tab work normally.
- Keep interface switching same-origin and preserve the current route structure: MiningSight is `/`, while GOMERA X is `/gomerax-trial/`.

## Implementation rules

- Reuse the existing React components and Tailwind utility style. Avoid adding a second component library or global theme.
- Prefer small, local component changes over broad rewrites of `index.css`.
- Preserve the existing 3D viewport, panel behavior, keyboard shortcuts, and compact spacing when editing navigation or panels.
