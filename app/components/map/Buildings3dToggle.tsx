import { Building2 } from "lucide-react";

type Buildings3dToggleProps = {
    enabled: boolean;
    onToggle: () => void;
};

export default function Buildings3dToggle({ enabled, onToggle }: Buildings3dToggleProps) {
    const label = "Bangunan 3D (terlihat saat peta diperbesar)";

    return (
        <button type="button" data-hci-region="3d-toggle" onClick={onToggle} aria-pressed={enabled} aria-label={label} title={label}
            className={`btn min-h-11 px-3 text-sm ${enabled ? "btn-primary" : "border-rule bg-panel-surface text-ink-muted"}`}>
            <Building2 aria-hidden="true" className="size-4" />3D
        </button>
    );
}
