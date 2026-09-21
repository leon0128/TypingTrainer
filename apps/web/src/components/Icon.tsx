import type { ReactElement } from 'react';

/**
 * A Material Icon (rounded set, bundled as a font). Decorative: the label beside it says what it
 * means, so it is hidden from assistive technology.
 */
export function Icon({ name, className }: { name: string; className?: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={
        className === undefined ? 'material-icons-round' : `material-icons-round ${className}`
      }
    >
      {name}
    </span>
  );
}
