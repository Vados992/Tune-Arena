import type { SVGProps } from "react";

export default function RaceTrackIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <path d="M7 3h9a5 5 0 0 1 5 5v2a5 5 0 0 1-5 5h-2a2 2 0 0 0-2 2v1a3 3 0 0 1-3 3H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"/>
    <path d="M7 7h9a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a6 6 0 0 0-6 6H7V7Z"/>
    <path d="M11 3v4"/>
  </svg>;
}
