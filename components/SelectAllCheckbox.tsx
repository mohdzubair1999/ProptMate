"use client";

// Ticks or unticks every row checkbox that belongs to the form with this id.
export default function SelectAllCheckbox({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      data-testid="select-all"
      onChange={(e) => {
        const on = e.currentTarget.checked;
        document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"][data-bulk-row]`).forEach((c) => { c.checked = on; });
      }}
    />
  );
}
