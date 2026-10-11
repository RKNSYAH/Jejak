import { startHciTelemetry } from "./app/engine/lib/hciTelemetry";

// Anonymous click telemetry for the alpha; set NEXT_PUBLIC_HCI_TELEMETRY=false to turn it off.
if (process.env.NEXT_PUBLIC_HCI_TELEMETRY !== "false") {
    try {
        startHciTelemetry();
    } catch (error) {
        console.error("HCI telemetry failed to start:", error);
    }
}
