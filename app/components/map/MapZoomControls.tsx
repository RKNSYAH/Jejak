import { Minus, Plus } from "lucide-react";

const buttonClass = "btn btn-outline btn-neutral join-item size-11 min-h-11 min-w-11 bg-base-100 p-0 hover:bg-neutral";

export default function MapZoomControls({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
    return (
        <div data-hci-region="zoom-controls" role="group" aria-label="Zoom peta" className="join join-vertical w-fit">
            <button type="button" aria-label="Perbesar peta" title="Perbesar peta" onClick={onZoomIn} className={buttonClass}>
                <Plus aria-hidden="true" className="size-5" />
            </button>
            <button type="button" aria-label="Perkecil peta" title="Perkecil peta" onClick={onZoomOut} className={buttonClass}>
                <Minus aria-hidden="true" className="size-5" />
            </button>
        </div>
    );
}
