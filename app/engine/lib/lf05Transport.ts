export type LF05TransportMode = "transit" | "motorcycle" | "car" | "active";

export function getLF05TransportQuestion(language: "id" | "en" = "id"): string {
    return language === "en" ? "Which transport mode do you choose?" : "Moda transportasi apa yang kamu pilih?";
}

const modes: [LF05TransportMode, RegExp][] = [
    ["transit", /\b(?:transit|transport(?:asi)? umum|angkutan umum|public transport(?:ation)?|mrt|lrt|krl|transjakarta|bus|angkot)\b/iu],
    ["motorcycle", /\b(?:motorcycle|motorbike|sepeda motor|motor)\b/iu],
    ["car", /\b(?:mobil|car)\b/iu],
    ["active", /\b(?:active|jalan kaki|bersepeda|walk(?:ing)?|cycl(?:e|ing)|bicycle|bike)\b/iu],
];

export function parseLF05TransportAnswer(answer: string): LF05TransportMode | null {
    const value = answer.trim();
    return modes.find(([, pattern]) => {
        const match = value.match(pattern);
        return match?.[0].toLowerCase() === value.toLowerCase();
    })?.[0] ?? null;
}

// Require a stated choice/use, not vehicle ownership, job context, negation or alternatives.
// Unrecognized phrasing stays unresolved: asking is safer than choosing for the user.
export function extractLF05TransportMode(story: string): LF05TransportMode | null {
    const choices = new Set<LF05TransportMode>();
    for (const clause of story.split(/[.!?;\n]+|\b(?:tapi|tetapi|but)\b/iu)) {
        const mentions = modes.flatMap(([mode, pattern]) => {
            const match = clause.match(pattern);
            return match ? [{ mode, match }] : [];
        });
        if (mentions.length !== 1) continue;
        const { mode, match } = mentions[0];
        const before = clause.slice(0, match.index).trimEnd();
        const after = clause.slice((match.index ?? 0) + match[0].length).trimStart();
        if (/\b(?:tidak|tak|nggak|gak|ga|bukan|tanpa|belum|mungkin|not|never|without|maybe|avoid|don't|undecided)\b(?:\s+\S+){0,3}\s*$/iu.test(before) ||
            /^(?:belum tahu|belum pasti|tidak jadi|not sure|maybe)\b/iu.test(after)) continue;
        const chosen = parseLF05TransportAnswer(clause) !== null ||
            /\b(?:naik|pakai|menggunakan|gunakan|memilih|pilih|andalkan|commute by|travel by|go by|drive(?: a)?|ride(?: a)?|use|prefer)\s*$/iu.test(before) ||
            /\b(?:moda transportasi(?:ku|mu|nya)?|transport mode)\s*[:=]?\s*$/iu.test(before) ||
            /^(?:sebagai )?(?:pilihan utama|pilihan saya|untuk (?:perjalanan|ke kantor)|for (?:my commute|commuting))\b/iu.test(after);
        if (chosen) choices.add(mode);
    }
    return choices.size === 1 ? [...choices][0] : null;
}
