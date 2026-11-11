import type { SVGProps } from "react";

export default function TurboIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <path d="M10 4h10v5h-3.1A8 8 0 1 1 10 4Z"/>
    <circle cx="10" cy="12" r="4"/>
    <path d="M10 8v4l3.5 2M10 12l-3.5 2M20 4h2v5h-2"/>
  </svg>;
}
