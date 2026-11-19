import React from 'react';
import { ParamDef } from '../types';

interface SliderRowProps {
  def: ParamDef;
  value: number;
  onChange: (key: string, value: number) => void;
}

export const SliderRow: React.FC<SliderRowProps> = ({ def, value, onChange }) => {
  const displayValue = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(def.step < 0.1 ? 2 : 1);

  return (
    <div className="row">
      <label>
        {def.label} <span>{displayValue}</span>
      </label>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(def.key, parseFloat(e.target.value))}
      />
    </div>
  );
};
