type InputProps = {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  label?: string;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
  id?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  title?: string;
  autoComplete?: string;
};

export function Input({ placeholder, value, onChange, type = "text", label, required, className, autoFocus, id, minLength, maxLength, pattern, title, autoComplete }: InputProps) {
  return (
    <div className={`flex flex-col gap-1 ${className || ""}`}>
      {label && <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>}
      <input
        id={id}
        className="form-input"
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        title={title}
        autoComplete={autoComplete}
      />
    </div>
  );
}

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  label?: string;
  placeholder?: string;
  className?: string;
};

export function Select({ value, onChange, options, label, placeholder, className }: SelectProps) {
  return (
    <div className={`flex flex-col gap-1 ${className || ""}`}>
      {label && <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>}
      <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder ?? "Select..."}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
