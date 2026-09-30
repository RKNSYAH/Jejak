"use client";

import { useRef, useState, type FormEvent, type Ref } from "react";
import { ArrowUp, House, Map, MessageSquareText, Route, SlidersHorizontal, X } from "lucide-react";

import type { MapCategory } from "@/app/engine/types";
import { mapCategories } from "./mapMetrics";

const suggestions = [
    { label: "Kos < Rp1,5 jt", prompt: "Tampilkan area dengan kos di bawah Rp1,5 juta.", Icon: House },
    { label: "≤ 30 menit ke Kuningan", prompt: "Area mana yang berjarak maksimal 30 menit dari Kuningan?", Icon: Route },
    { label: "Bagaimana jika kerja remote?", prompt: "Bagaimana rekomendasi berubah jika saya kerja remote?", Icon: SlidersHorizontal },
];

type MapChatComposerProps = {
    containerRef: Ref<HTMLDivElement>;
    visible: boolean;
    isDragging: boolean;
    sheetHeight: number;
    sidebarWidth: number;
    category: MapCategory | null;
    selectedZoneName: string | null;
    onClearContext: () => void;
    onSubmit?: (question: string) => void;
};

export default function MapChatComposer({
    containerRef,
    visible,
    isDragging,
    sheetHeight,
    sidebarWidth,
    category,
    selectedZoneName,
    onClearContext,
    onSubmit,
}: MapChatComposerProps) {
    const [prompt, setPrompt] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const canSubmit = !!onSubmit && !!prompt.trim();
    const categoryLabel = mapCategories[category ?? "summary"].panelLabel;
    const contextLabel = selectedZoneName
        ? `${selectedZoneName} · ${categoryLabel}`
        : `Peta · ${categoryLabel}`;

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canSubmit || !onSubmit) return;
        onSubmit(prompt.trim());
        setPrompt("");
    }

    return (
        <div
            ref={containerRef}
            data-hci-region="map-chat"
            aria-hidden={!visible}
            hidden={!visible}
            className={`pointer-events-none absolute bottom-0 left-0 z-100 flex justify-center px-[max(0.75rem,env(safe-area-inset-left))] md:px-4 ${isDragging ? "" : "transition-[bottom,right] duration-200 ease-out motion-reduce:transition-none"}`}
            style={{
                right: sidebarWidth,
                bottom: `calc(var(--map-sheet-height, ${sheetHeight}px) + 16px)`,
            }}
        >
            <section aria-label="Tanya tentang peta" className="pointer-events-auto w-full max-w-2xl">
                <div role="group" className="map-chat-suggestions flex gap-2 overflow-x-auto overscroll-x-contain pb-2" aria-label="Pertanyaan yang disarankan">
                    {suggestions.map(({ label, prompt: suggestedPrompt, Icon }) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => {
                                setPrompt(suggestedPrompt);
                                inputRef.current?.focus();
                            }}
                            className="btn btn-sm h-9 min-h-9 shrink-0 gap-1.5 rounded-2xl border border-rule bg-panel-surface px-3 text-xs font-semibold text-ink shadow-overlay hover:border-primary hover:bg-base-100 pointer-coarse:h-11 pointer-coarse:min-h-11"
                        >
                            <Icon aria-hidden="true" className="size-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                <form
                    aria-label="Tanya atau ubah asumsi"
                    onSubmit={handleSubmit}
                    className="flex min-h-14 items-center gap-1.5 rounded-2xl border border-rule bg-panel-surface px-2.5 shadow-overlay md:gap-2 md:px-3"
                >
                    <MessageSquareText aria-hidden="true" className="size-5 shrink-0 text-ink max-[420px]:hidden" />
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
                         <span className="hidden max-w-[48%] min-w-0 shrink-0 items-center gap-1 rounded-lg bg-primary-tint px-2 py-1.5 text-xs font-semibold text-ink min-[400px]:flex">
                            <Map aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                            <span className="truncate">{contextLabel}</span>
                            {selectedZoneName && (
                                <button
                                    type="button"
                                    onClick={onClearContext}
                                    aria-label="Hapus konteks area"
                                    className="btn btn-ghost btn-xs size-5 min-h-5 shrink-0 p-0 text-ink-muted pointer-coarse:size-11 pointer-coarse:min-h-11"
                                >
                                    <X aria-hidden="true" className="size-3" />
                                </button>
                            )}
                        </span>
                        <label htmlFor="map-chat-prompt" className="sr-only">Tanya atau ubah asumsi peta</label>
                        <input
                            ref={inputRef}
                            id="map-chat-prompt"
                            name="question"
                            type="text"
                            maxLength={500}
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="Tanya atau ubah asumsi…"
                            className="input input-ghost h-10 min-h-10 min-w-0 flex-1 border-0 bg-transparent px-1 text-base text-ink shadow-none focus:bg-transparent focus:outline-none md:text-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        title={onSubmit ? "Kirim pertanyaan" : "Tanya peta belum tersedia"}
                        aria-label="Kirim pertanyaan"
                        aria-describedby="map-chat-send-description"
                        className="btn btn-primary btn-square size-11 shrink-0 rounded-xl"
                    >
                        <ArrowUp aria-hidden="true" className="size-5" />
                    </button>
                    <span id="map-chat-send-description" className="sr-only">
                        {onSubmit ? "Kirim pertanyaan untuk memperbarui peta." : "Tanya peta belum tersedia. Pertanyaan belum dikirim."}
                    </span>
                </form>
            </section>
        </div>
    );
}
