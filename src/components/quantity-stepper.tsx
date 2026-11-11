"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";

export default function QuantityStepper({
  max,
  label = "Jumlah diberikan",
  disabled = false,
  onChange,
}: {
  max: number;
  label?: string;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState("1");
  const limit = Math.max(1, max);
  const unavailable = disabled || max < 1;
  const amount = Number(value);
  function update(next: string) {
    setValue(next);
    onChange?.();
  }
  function clamp(amount: number) {
    return Math.min(
      limit,
      Math.max(1, Number.isFinite(amount) ? Math.trunc(amount) : 1),
    );
  }

  return (
    <div className="quantity-field">
      <label htmlFor={id}>{label}</label>
      <div className="quantity-stepper">
        <button
          type="button"
          className="quantity-minus"
          aria-label="Kurangi jumlah"
          aria-controls={id}
          disabled={unavailable || amount <= 1}
          onClick={() => update(String(clamp(amount - 1)))}
        >
          <Minus size={19} />
        </button>
        <input
          id={id}
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={limit}
          step={1}
          value={value}
          disabled={unavailable}
          required
          onChange={(event) => update(event.target.value)}
          onBlur={() => {
            const next = String(clamp(amount));
            if (next !== value) update(next);
          }}
        />
        <button
          type="button"
          className="quantity-plus"
          aria-label="Tambah jumlah"
          aria-controls={id}
          disabled={unavailable || amount >= limit}
          onClick={() => update(String(clamp(amount + 1)))}
        >
          <Plus size={19} />
        </button>
      </div>
    </div>
  );
}
