'use client';
export function PrintButton() {
  return (
    <button
      type="button"
      className="button secondary no-print"
      onClick={() => window.print()}
    >
      Print or save PDF
    </button>
  );
}
