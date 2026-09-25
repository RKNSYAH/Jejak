import { Building2 } from "lucide-react";

type Buildings3dToggleProps = {
    enabled: boolean;
    onToggle: () => void;
};

export default function Buildings3dToggle({ enabled, onToggle }: Buildings3dToggleProps) {
    const label = "Bangunan 3D (terlihat saat peta diperbesar)";

    return (
        <button type="button" onClick={onToggle} aria-pressed={enabled} aria-label={label} title={label}
            className={`btn min-h-11 gap-1.5 rounded-xl px-3 font-body text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${enabled ? "border-primary bg-primary text-primary-content" : "border-rule bg-panel-surface text-ink-muted"}`}>
            <Building2 aria-hidden="true" className="size-4" />3D
        </button>
    );
}
