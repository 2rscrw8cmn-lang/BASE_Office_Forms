import { Checkbox as RadixCheckbox } from "radix-ui";
import { useId, type ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  id?: string;
  /** Inline label rendered beside the box. */
  children?: ReactNode;
  className?: string;
}

/**
 * BASE-styled checkbox on Radix behaviour. Radix supplies keyboard, focus, and
 * form semantics; BASE owns the rendered box, check glyph, and states.
 */
export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  required,
  name,
  value,
  id,
  children,
  className,
}: CheckboxProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <span className={cx("base-checkbox", className)}>
      <RadixCheckbox.Root
        id={controlId}
        className="base-checkbox__box"
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => {
          onCheckedChange?.(next === true);
        }}
        disabled={disabled}
        required={required}
        name={name}
        value={value}
      >
        <RadixCheckbox.Indicator className="base-checkbox__indicator">
          <Icon name="check" size={13} strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {children != null ? (
        <label htmlFor={controlId} className="base-checkbox__label">
          {children}
        </label>
      ) : null}
    </span>
  );
}
