import React, { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { DEFECT_PRESETS } from '../types/pallet';

const CUSTOM_DEFECTS_STORAGE_KEY = 'palletguard_custom_defects_v1';

function loadStoredCustomDefects(): string[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_DEFECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveStoredCustomDefects(items: string[]): void {
  try {
    window.localStorage.setItem(
      CUSTOM_DEFECTS_STORAGE_KEY,
      JSON.stringify(items)
    );
  } catch {
    // Ignore storage quota errors
  }
}

interface DefectTypeSelectorProps {
  selectedDefects: string[];
  onChange: (next: string[]) => void;
  historicalDefects?: string[];
  label?: string;
  inputId?: string;
}

export const DefectTypeSelector: React.FC<DefectTypeSelectorProps> = ({
  selectedDefects,
  onChange,
  historicalDefects = [],
  label = 'Phân loại lỗi hư hỏng cụ thể',
  inputId = 'custom-defect-input',
}) => {
  const [customInput, setCustomInput] = useState('');
  const [savedCustomDefects, setSavedCustomDefects] = useState<string[]>(() =>
    loadStoredCustomDefects()
  );

  // Merge presets + locally saved custom defects + defects seen in records + currently selected
  const allOptions = useMemo(() => {
    const seenLower = new Set<string>();
    const merged: Array<{ label: string; isPreset: boolean; isRemovable: boolean }> = [];

    const addItem = (raw: string, isPreset: boolean, isRemovable: boolean) => {
      const clean = raw.trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seenLower.has(key)) return;
      seenLower.add(key);
      merged.push({ label: clean, isPreset, isRemovable });
    };

    DEFECT_PRESETS.forEach((d) => addItem(d, true, false));
    savedCustomDefects.forEach((d) => addItem(d, false, true));
    historicalDefects.forEach((d) => addItem(d, false, false));
    selectedDefects.forEach((d) => addItem(d, false, false));

    return merged;
  }, [savedCustomDefects, historicalDefects, selectedDefects]);

  const toggleDefect = (defect: string) => {
    const exists = selectedDefects.some(
      (d) => d.toLowerCase() === defect.toLowerCase()
    );
    if (exists) {
      onChange(
        selectedDefects.filter((d) => d.toLowerCase() !== defect.toLowerCase())
      );
    } else {
      onChange([...selectedDefects, defect]);
    }
  };

  const handleAddCustomDefect = () => {
    const parts = customInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    const nextSelected = [...selectedDefects];
    const nextSavedCustom = [...savedCustomDefects];

    parts.forEach((part) => {
      // Match existing option casing if already present
      const existingOption = allOptions.find(
        (opt) => opt.label.toLowerCase() === part.toLowerCase()
      );
      const finalLabel = existingOption ? existingOption.label : part;

      if (
        !nextSelected.some((s) => s.toLowerCase() === finalLabel.toLowerCase())
      ) {
        nextSelected.push(finalLabel);
      }

      const isPreset = DEFECT_PRESETS.some(
        (p) => p.toLowerCase() === finalLabel.toLowerCase()
      );
      if (
        !isPreset &&
        !nextSavedCustom.some(
          (c) => c.toLowerCase() === finalLabel.toLowerCase()
        )
      ) {
        nextSavedCustom.push(finalLabel);
      }
    });

    setSavedCustomDefects(nextSavedCustom);
    saveStoredCustomDefects(nextSavedCustom);
    onChange(nextSelected);
    setCustomInput('');
  };

  const handleRemoveSavedCustom = (
    e: React.MouseEvent,
    defectLabel: string
  ) => {
    e.stopPropagation();
    const updatedCustom = savedCustomDefects.filter(
      (d) => d.toLowerCase() !== defectLabel.toLowerCase()
    );
    setSavedCustomDefects(updatedCustom);
    saveStoredCustomDefects(updatedCustom);
    onChange(
      selectedDefects.filter(
        (d) => d.toLowerCase() !== defectLabel.toLowerCase()
      )
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-slate-700"
        >
          {label}
        </label>
        <span className="text-xs text-slate-500 tabular-nums">
          Đã chọn: {selectedDefects.length}
        </span>
      </div>

      {/* Interactive Toggle Grid */}
      <div className="mt-2 flex flex-wrap gap-2">
        {allOptions.map((opt) => {
          const selected = selectedDefects.some(
            (d) => d.toLowerCase() === opt.label.toLowerCase()
          );
          return (
            <div
              key={opt.label}
              className={`inline-flex min-h-[36px] items-center rounded-lg border text-xs font-medium transition-colors ${
                selected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleDefect(opt.label)}
                className="inline-flex h-full items-center gap-1.5 px-3 py-1.5 whitespace-nowrap"
              >
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                <span>{opt.label}</span>
              </button>
              {opt.isRemovable && (
                <button
                  type="button"
                  onClick={(e) => handleRemoveSavedCustom(e, opt.label)}
                  title={`Xóa "${opt.label}" khỏi danh sách gợi ý`}
                  aria-label={`Xóa ${opt.label}`}
                  className={`mr-1 rounded p-1 transition-colors ${
                    selected
                      ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom Defect Input */}
      <div className="mt-2.5 flex gap-2">
        <input
          id={inputId}
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCustomDefect();
            }
          }}
          placeholder="Nhập thêm loại hư hỏng khác (VD: Nứt ván đáy, Móp bên hông ...)"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
        />
        <button
          type="button"
          onClick={handleAddCustomDefect}
          disabled={!customInput.trim()}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Thêm lỗi</span>
        </button>
      </div>
    </div>
  );
};
