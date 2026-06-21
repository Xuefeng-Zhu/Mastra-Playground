import { useState } from 'react';
import type { FormField } from '../registry/examples';

interface FormFieldProps {
  field: FormField;
  disabled?: boolean;
}

export function FormFieldView({ field, disabled }: FormFieldProps) {
  const id = `field-${field.name}`;
  switch (field.type) {
    case 'textarea':
      return (
        <div className="field-group">
          <label htmlFor={id}>{field.label}</label>
          <textarea
            id={id}
            name={field.name}
            rows={field.rows || 2}
            defaultValue={field.default || ''}
            required={field.required !== false}
            disabled={disabled}
          />
        </div>
      );
    case 'input':
      return (
        <div className="field-group">
          <label htmlFor={id}>{field.label}</label>
          <input
            id={id}
            name={field.name}
            type="text"
            defaultValue={field.default || ''}
            required={field.required !== false}
            disabled={disabled}
          />
        </div>
      );
    case 'select':
      return (
        <div className="field-group">
          <label htmlFor={id}>{field.label}</label>
          <select id={id} name={field.name} defaultValue={field.default} disabled={disabled}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'slider': {
      const [val, setVal] = useState<number>(field.default);
      return (
        <div className="field-group">
          <label htmlFor={id}>
            {field.label}: <span className="slider-value">{val}</span>
          </label>
          <input
            id={id}
            name={field.name}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={val}
            disabled={disabled}
            onInput={(event) => setVal(Number(event.currentTarget.value))}
          />
        </div>
      );
    }
  }
}

export function SamplesGroup({
  samples,
  disabled,
}: {
  samples: { fill: string; value: string; label: string }[];
  disabled?: boolean;
}) {
  if (samples.length === 0) return null;
  return (
    <div className="field-group">
      <span className="field-label">Samples</span>
      <div className="chips">
        {samples.map((s, i) => (
          <button
            type="button"
            key={i}
            className="chip"
            disabled={disabled}
            onClick={() => {
              const target = document.getElementById(`field-${s.fill}`);
              if (target) (target as HTMLInputElement | HTMLTextAreaElement).value = s.value;
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
