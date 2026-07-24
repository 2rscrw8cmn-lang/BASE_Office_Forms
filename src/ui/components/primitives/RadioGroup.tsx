import { RadioGroup as RadixRadioGroup } from "radix-ui";
import { useId } from "react";
import { cx } from "../util/cx";

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** Accessible group name (rendered as a legend/label association). */
  label: string;
  hideLabel?: boolean;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

/**
 * BASE-styled radio group on Radix behaviour. Radix provides roving-tabindex
 * arrow-key selection and grouping semantics; BASE owns the dot and states.
 */
export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  required,
  label,
  hideLabel = false,
  orientation = "vertical",
  className,
}: RadioGroupProps) {
  const labelId = useId();
  return (
    <div className={cx("base-radio-group-wrap", className)}>
      <span
        id={labelId}
        className={cx("base-field__label", hideLabel && "base-sr-only")}
      >
        {label}
      </span>
      <RadixRadioGroup.Root
        className={cx("base-radio-group", `base-radio-group--${orientation}`)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        disabled={disabled}
        required={required}
        orientation={orientation}
        aria-labelledby={labelId}
      >
        {options.map((option) => {
          const optionId = `${labelId}-${option.value}`;
          return (
            <span key={option.value} className="base-radio">
              <RadixRadioGroup.Item
                id={optionId}
                className="base-radio__control"
                value={option.value}
                disabled={option.disabled}
              >
                <RadixRadioGroup.Indicator className="base-radio__indicator" />
              </RadixRadioGroup.Item>
              <label htmlFor={optionId} className="base-radio__label">
                {option.label}
              </label>
            </span>
          );
        })}
      </RadixRadioGroup.Root>
    </div>
  );
}
