import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { formatRupiah } from "@/app/engine/onboarding/demoData";

export type Choice<T> = { value: T; label: string; shortLabel?: string; description?: string; icon?: ReactNode };

export function RadioChoices<T extends string | number>({ name, label, value, choices, onChange, cards = false, stacked = false, compactMobile = false, className = "" }: {
    name: string; label: ReactNode; value: T; choices: Choice<T>[]; onChange: (value: T) => void; cards?: boolean; stacked?: boolean; compactMobile?: boolean; className?: string;
}) {
    return (
        <fieldset className="min-w-0">
            <legend className="mb-3 font-semibold text-sm">{label}</legend>
            <div className={`${cards ? "grid grid-cols-2 gap-2.5" : "flex flex-wrap gap-2"} ${className}`}>
                {choices.map((choice) => {
                    const selected = value === choice.value;
                    return (
                        <label key={choice.value} className="relative min-w-0 cursor-pointer">
                            <input type="radio" name={name} value={choice.value} checked={selected} aria-label={choice.label}
                                onChange={() => onChange(choice.value)} className="radio absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 peer" />
                            <span className={`flex min-h-11 h-full gap-2 rounded-xl border px-3.5 py-2.5 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${stacked ? "min-h-20 flex-col items-start justify-end" : cards ? "items-start" : "items-center justify-center"} ${selected ? cards ? `border-primary bg-primary-tint ring-1 ring-primary ${compactMobile ? "bg-primary! text-primary-content md:bg-primary-tint! md:text-ink" : ""}` : "border-primary bg-primary text-primary-content" : "border-ink/25 bg-base-100 hover:border-primary"}`}>
                                {choice.icon && <span aria-hidden="true" className={`shrink-0 ${cards ? "mt-0.5 text-primary" : ""}`}>{choice.icon}</span>}
                                <span className="min-w-0 font-semibold leading-snug">{choice.shortLabel ? <><span className="md:hidden">{choice.shortLabel}</span><span className="hidden md:inline">{choice.label}</span></> : choice.label}
                                    {choice.description && <span className={`mt-1 text-xs font-normal text-ink-muted ${compactMobile ? "hidden md:block" : "block"}`}>{choice.description}</span>}
                                </span>
                                {cards ? <span aria-hidden="true" className={`ml-auto mt-0.5 size-4.5 shrink-0 items-center justify-center rounded-full border ${stacked ? "absolute right-3 top-3" : ""} ${compactMobile ? "hidden md:flex" : "flex"} ${selected ? "border-primary bg-primary text-primary-content" : "border-ink/25"}`}>{selected && <Check className="size-3" />}</span>
                                    : selected && <Check aria-hidden="true" className="order-first size-3.5 shrink-0" />}
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

export function CheckboxChoices<T extends string>({ name, label, values, choices, onToggle, error }: {
    name: string; label: ReactNode; values: T[]; choices: Choice<T>[]; onToggle: (value: T) => void; error?: string;
}) {
    return (
        <fieldset className="min-w-0" aria-describedby={error ? `${name}-error` : undefined}>
            <legend className="mb-3 text-sm font-semibold">{label}</legend>
            <div className="flex flex-wrap gap-2">
                {choices.map((choice) => {
                    const selected = values.includes(choice.value);
                    return <label key={choice.value} className="relative cursor-pointer">
                        <input type="checkbox" name={name} value={choice.value} checked={selected} onChange={() => onToggle(choice.value)} className="checkbox absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 peer" />
                        <span className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${selected ? "border-primary bg-primary text-primary-content" : "border-ink/25 bg-base-100 hover:border-primary"}`}>
                            {selected && <Check aria-hidden="true" className="size-3.5" />}{choice.label}
                        </span>
                    </label>;
                })}
            </div>
            {error && <p id={`${name}-error`} className="mt-2 text-sm text-error">{error}</p>}
        </fieldset>
    );
}

export function MoneyField({ name, label, mobileLabel, amount, onChange, hint, error }: {
    name: string; label: string; mobileLabel?: string; amount: number; onChange: (amount: number) => void; hint: string; error?: string;
}) {
    return <div className="min-w-0">
        <label htmlFor={`form-${name}`} className="mb-2 block text-sm font-semibold">{mobileLabel ? <><span className="md:hidden">{mobileLabel}</span><span className="hidden md:inline">{label}</span></> : label}</label>
        <div className={`input flex h-12 w-full gap-2 rounded-lg border bg-base-100 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary ${error ? "border-error" : "border-ink/25"}`}>
            <span aria-hidden="true" className="text-ink-muted">Rp</span>
            <input id={`form-${name}`} name={name} type="text" inputMode="numeric" required autoComplete="off" maxLength={15} aria-label={label}
                value={amount ? formatRupiah(amount) : ""} onChange={(event) => {
                    const text = event.target.value;
                    if (/^[\d.,\s]*$/.test(text)) onChange(Number(text.replace(/[^\d]/g, "")));
                }} aria-invalid={!!error} aria-describedby={`form-${name}-hint${error ? ` form-${name}-error` : ""}`}
                className="min-w-0 flex-1 text-base md:text-sm" />
        </div>
        <p id={`form-${name}-hint`} className="mt-2 hidden text-xs leading-relaxed text-ink-muted md:block">{hint}</p>
        {error && <p id={`form-${name}-error`} className="mt-1 text-sm text-error">{error}</p>}
    </div>;
}
