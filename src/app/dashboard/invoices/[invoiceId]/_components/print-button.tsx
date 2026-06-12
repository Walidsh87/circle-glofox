'use client'

export function PrintButton() {
  // Printable page: literal brand colors — this surface never themes.
  return (
    <button
      onClick={() => window.print()}
      className="h-9 cursor-pointer rounded-lg border-none bg-[#C8F135] px-4 text-[13px] font-bold text-[#0A0A0A]"
    >
      Save as PDF
    </button>
  )
}
