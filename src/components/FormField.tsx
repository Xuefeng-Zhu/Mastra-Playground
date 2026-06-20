import { useState } from 'react';
import type { FormField } from '../registry/examples.js';

interface FormFieldProps {
  field: FormField;
  onSample?: (fieldName: string, value: string) => void;
  samples?: { fill: string; value: string; label: string }[];
  disabled?: boolean;
}

export function FormFieldView({ field, samples, disabled }: FormFieldProps) {
  const id = `v2-field-${field.name}`;
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
            {field.label}: <span className="v2-slider-value">{val}</span>
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
            onChange={(e) => setVal(Number(e.target.value))}
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
              const target = document.getElementById(`v2-field-${s.fill}`);
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
