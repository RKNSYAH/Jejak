// components/icons/FootprintIcon.tsx

import type { SVGProps } from "react";

export default function FootprintIcon(
    props: SVGProps<SVGSVGElement>
) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            {...props}
        >
            {/* foot */}
            <path d="M10.7 7.3c2.3-.5 4.4 1 4.8 3.3.3 1.8-.6 3.3-1.5 4.8-.8 1.3-1.3 2.4-1.4 3.8-.1 1.8-1.3 3-2.8 2.8-1.5-.2-2.4-1.5-2.1-3.3.2-1.4.7-2.5.4-4.1-.3-1.5-1-2.8-.7-4.4.3-1.5 1.4-2.6 3.3-2.9Z" />

            {/* toes */}
            <circle cx="8" cy="4.5" r="1.4" />
            <circle cx="11.2" cy="3.2" r="1.25" />
            <circle cx="14.2" cy="3.5" r="1.1" />
            <circle cx="16.6" cy="4.8" r="0.9" />
        </svg>
    );
}