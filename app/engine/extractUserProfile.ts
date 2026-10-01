type LF05TaxonomyEntry = {
    id: string;
    label: string;
    aliases: string[];
};

export type LF05Taxonomy = {
    version: string;
    sectors: LF05TaxonomyEntry[];
    occupations: LF05TaxonomyEntry[];
    /** Destination areas. Any alias (kecamatan, district) resolves to the area label, here and in LF-05. */
    areas?: LF05TaxonomyEntry[];
};

type TaxonomyMatch = {
    id: string;
    label: string;
    matchedText: string;
};

export const onboardingTaxonomy: LF05Taxonomy = {
    version: "2026-09",
    sectors: [
        { id: "software_and_it_services", label: "Software and IT services", aliases: ["IT", "software", "teknologi informasi", "programming"] },
        { id: "telecommunications", label: "Telecommunications", aliases: ["telko", "telekomunikasi", "telco"] },
        { id: "financial_technology", label: "Financial technology", aliases: ["fintech", "digital banking"] },
        { id: "data_and_analytics", label: "Data and analytics", aliases: ["data", "data science", "analitik"] },
        { id: "digital_commerce", label: "Digital commerce", aliases: ["e-commerce", "marketplace", "online retail"] },
        { id: "cybersecurity", label: "Cybersecurity", aliases: ["keamanan siber", "security", "infosec"] },
        { id: "technology_consulting", label: "Technology consulting", aliases: ["IT consulting", "konsultan teknologi"] },
    ],
    occupations: [
        { id: "software_engineer", label: "Software engineer", aliases: ["developer", "programmer", "backend engineer", "frontend engineer"] },
        { id: "data_analyst", label: "Data analyst", aliases: ["analis data", "BI analyst"] },
        { id: "ui_ux_designer", label: "UI/UX designer", aliases: ["product designer", "desainer UI"] },
        { id: "network_engineer", label: "Network engineer", aliases: ["network admin", "teknisi jaringan"] },
        { id: "product_manager", label: "Product manager", aliases: ["PM", "product owner"] },
        { id: "cybersecurity_analyst", label: "Cybersecurity analyst", aliases: ["cyber security analyst", "security analyst", "SOC analyst", "security engineer", "analis keamanan siber"] },
    ],
    // Kecamatan and well-known districts resolve to their city ("kerja ke Kuningan" -> Jakarta Selatan).
    // Names that straddle two cities (Sudirman, Senayan, Gatot Subroto, Kota Tua) or lie mostly outside
    // Jakarta (Bintaro, Cibubur) are left out on purpose. LF-05 receives this list as taxonomy.areas.
    areas: [
        { id: "jakarta_selatan", label: "Jakarta Selatan", aliases: ["jaksel", "south jakarta", "cilandak", "jagakarsa", "kebayoran baru", "kebayoran lama", "kebayoran", "mampang prapatan", "mampang", "pancoran", "pasar minggu", "pesanggrahan", "setiabudi", "setia budi", "tebet", "kuningan", "mega kuningan", "karet", "semanggi", "scbd", "rasuna said", "blok m", "senopati", "kemang", "tb simatupang", "simatupang", "fatmawati", "pondok indah", "lebak bulus", "kalibata", "cipete", "gandaria", "ragunan", "manggarai", "tanjung barat", "radio dalam"] },
        { id: "jakarta_pusat", label: "Jakarta Pusat", aliases: ["jakpus", "central jakarta", "cempaka putih", "gambir", "johar baru", "kemayoran", "menteng", "sawah besar", "senen", "tanah abang", "thamrin", "monas", "cikini", "bendungan hilir", "benhil", "salemba", "pasar baru", "harmoni"] },
        { id: "jakarta_barat", label: "Jakarta Barat", aliases: ["jakbar", "west jakarta", "cengkareng", "grogol petamburan", "grogol", "kalideres", "kebon jeruk", "kembangan", "palmerah", "taman sari", "tambora", "puri indah", "slipi", "tomang", "meruya", "kedoya", "taman anggrek"] },
        { id: "jakarta_timur", label: "Jakarta Timur", aliases: ["jaktim", "east jakarta", "cakung", "cipayung", "ciracas", "duren sawit", "jatinegara", "kramat jati", "matraman", "pasar rebo", "pulo gadung", "pulogadung", "rawamangun", "pulomas", "cawang", "kampung melayu", "halim"] },
        { id: "jakarta_utara", label: "Jakarta Utara", aliases: ["jakut", "north jakarta", "cilincing", "kelapa gading", "koja", "pademangan", "penjaringan", "tanjung priok", "sunter", "pantai indah kapuk", "pik", "ancol", "pluit", "muara karang"] },
        { id: "kepulauan_seribu", label: "Kepulauan Seribu", aliases: ["thousand islands", "pulau seribu"] },
    ],
};

type LF05Input = {
    mode: "onboarding";
    language: "id" | "en";
    session_reference: string;
    privacy_screened: true;
    taxonomy: LF05Taxonomy;
    message: string;
};

export const onboardingTopics = [
    { key: "goal", label: "Tujuan" },
    { key: "destination", label: "Kota" },
    { key: "occupation", label: "Pekerjaan" },
    { key: "sector", label: "Bidang" },
    { key: "budget", label: "Anggaran" },
    { key: "housing", label: "Sewa" },
    { key: "commute", label: "Waktu tempuh" },
    { key: "priority", label: "Prioritas" },
    { key: "transport", label: "Moda" },
    { key: "workplace", label: "Lokasi kantor" },
] as const;

type OnboardingTopicKey = (typeof onboardingTopics)[number]["key"];

type ExtractedUserProfile = {
    topics: Record<OnboardingTopicKey, string | null>;
    goal: "work" | "study" | "both" | null;
    targetCity: string | null;
    /** Every named area in order, with the words the user wrote (e.g. "kuningan" -> Jakarta Selatan). */
    areaMentions: TaxonomyMatch[];
    targetSectors: TaxonomyMatch[];
    targetOccupations: TaxonomyMatch[];
    budgetMention: string | null;
    commuteMention: string | null;
    priorities: string[];
};

const workTerms = ["kerja", "bekerja", "pekerjaan", "work", "job", "find a job", "cari kerja"];
const studyTerms = ["kuliah", "sekolah", "belajar", "studi", "study", "studying", "university"];
const housingTerms = ["kos", "kost", "sewa", "kontrakan", "rent", "housing", "apartment", "apartemen", "hunian", "tempat tinggal"];
// LF-05 treats a stated salary as the monthly budget when no budget amount is given.
const budgetTerms = ["budget", "gaji", "salary", "penghasilan", "anggaran", "biaya bulanan", "dana bulanan", "pengeluaran", "monthly budget"];
const commuteTerms = ["waktu tempuh", "waktu perjalanan", "perjalanan", "commute", "travel time"];
// "Jakarta" alone is a city, not an area: LF-05 still asks which part of Jakarta.
const wholeCityNames = ["jakarta", "dki", "dki jakarta", "jkt"];
// "kerja ke", "kantor di", "office in" right before an area names the workplace, not only the destination.
const workplaceCue = /(?:kerja|bekerja|kantor(?:nya)?|ngantor|office|work(?:ing)?)(?:\s+(?:saya|aku|gue|gw|my))?\s+(?:di|ke|in|at|to|dekat|near)\s*$/iu;
// Mirrors LF-05's parser: a currency prefix or a unit suffix is required, so "45 menit" or "2026" never count.
const moneyPattern =
    /(?<![\p{L}\p{N}.,])(?:(?:rp\.?|idr)\s*(?:\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)(?:\s*(?:juta(?:an)?|jt|mio|million|ribu(?:an)?|rb|k))?|\d+(?:[.,]\d+)?\s*(?:juta(?:an)?|jt|mio|million|miliar|milyar|ribu(?:an)?|rb|k|rupiah|idr))(?![\p{L}])/iu;
const durationPattern =
    /(?<![\p{L}\p{N}.,])(?:\d+(?:[.,]\d+)?\s*(?:menit|mnt|minutes?|mins?|jam|hours?|hrs?)|setengah jam|sejam|satu jam|half an hour|an hour|one hour)(?![\p{L}])/iu;
const priorityTerms = ["prioritas utama", "prioritas", "paling penting", "fokus", "paling utama", "terpenting", "matters most", "most important", "top priority", "priority", "prioritize", "prioritise"];

const priorityDimensions = [
    { key: "career", terms: ["karier", "karir", "career", "gaji", "salary"] },
    { key: "education", terms: ["pendidikan", "edukasi", "education", "kuliah"] },
    { key: "affordability", terms: ["keterjangkauan", "terjangkau", "affordability", "affordable", "biaya"] },
    { key: "mobility", terms: ["mobilitas", "waktu tempuh", "perjalanan", "commute", "transportasi"] },
];

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function findTerm(message: string, terms: string[]) {
    if (!message || !terms.length) return null;

    const choices = [...terms]
        .sort((left, right) => right.length - left.length)
        .map(escapeRegExp)
        .join("|");
    const match = message.match(new RegExp(`(?<![\\p{L}\\p{N}])(?:${choices})(?![\\p{L}\\p{N}])`, "iu"));
    return match?.[0] ?? null;
}

function findTermOccurrences(message: string, term: string) {
    const expression = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    return [...message.matchAll(expression)].map((match) => ({
        text: match[0],
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
    }));
}

function findTaxonomyMatches(message: string, entries: LF05TaxonomyEntry[]): TaxonomyMatch[] {
    const candidates = entries.flatMap((entry) =>
        [entry.label, ...entry.aliases]
            .filter((term) => term.trim())
            .flatMap((term) => findTermOccurrences(message, term).map((match) => ({ ...match, entry }))),
    ).sort((left, right) => left.start - right.start || right.text.length - left.text.length);

    const selected: Array<{ start: number; end: number; match: TaxonomyMatch }> = [];
    for (const candidate of candidates) {
        if (selected.some(({ start, end }) => candidate.start < end && candidate.end > start)) continue;
        if (selected.some(({ match }) => match.id === candidate.entry.id)) continue;

        selected.push({
            start: candidate.start,
            end: candidate.end,
            match: { id: candidate.entry.id, label: candidate.entry.label, matchedText: candidate.text },
        });
    }

    return selected.sort((left, right) => left.start - right.start).map(({ match }) => match);
}

function findDestination(message: string, taxonomy: LF05Taxonomy, areaMentions: TaxonomyMatch[]) {
    // A named area, kecamatan or district wins: "kerja ke Kuningan" -> Jakarta Selatan.
    if (areaMentions.length) return areaMentions[0].label;

    const match = message.match(
        /\b(?:pindah|relokasi|move|kerja|moving|relocate|relocating)\s+(?:ke|to)\s+([\p{L}][\p{L}\s.'-]*?)(?=\s+(?:untuk|buat|agar|dengan|sebagai|karena|yang|dan|tapi|budget|anggaran|biaya|kos|sewa|waktu|perjalanan|commute|paling|maksimal|supaya)\b|[,.;!?]|$)/iu,
    );
    const city = match?.[1]?.trim() ?? null;

    // A field or occupation after "pindah ke" is not a destination, and neither is Jakarta as a whole.
    if (
        city &&
        (findTaxonomyMatches(city, taxonomy.sectors).length > 0 ||
            findTaxonomyMatches(city, taxonomy.occupations).length > 0 ||
            findTerm(city, workTerms) ||
            wholeCityNames.includes(city.toLocaleLowerCase()))
    ) {
        return null;
    }

    return city;
}

function findWorkplaceArea(message: string, taxonomy: LF05Taxonomy) {
    // Every mention counts here, even a second one in the same city ("tinggal di Tebet, kantor di SCBD").
    const office = (taxonomy.areas ?? [])
        .flatMap((entry) => [entry.label, ...entry.aliases].flatMap((term) => findTermOccurrences(message, term)))
        .sort((left, right) => left.start - right.start || right.text.length - left.text.length)
        .find(({ start }) => workplaceCue.test(message.slice(Math.max(0, start - 30), start)));
    return office?.text ?? null;
}

function hasPriorityCueNearTerm(message: string, terms: string[]) {
    const term = findTerm(message, terms);
    if (!term) return false;

    const lowerMessage = message.toLocaleLowerCase();
    const termIndex = lowerMessage.indexOf(term.toLocaleLowerCase());
    const sentenceStart = Math.max(
        lowerMessage.lastIndexOf(".", termIndex),
        lowerMessage.lastIndexOf("!", termIndex),
        lowerMessage.lastIndexOf("?", termIndex),
        lowerMessage.lastIndexOf(";", termIndex),
    );
    const sentenceEnd = [".", "!", "?", ";"]
        .map((punctuation) => lowerMessage.indexOf(punctuation, termIndex + term.length))
        .filter((index) => index >= 0)
        .reduce((earliest, index) => Math.min(earliest, index), lowerMessage.length);

    return findTerm(lowerMessage.slice(sentenceStart + 1, sentenceEnd), priorityTerms) !== null;
}

export function extractUserProfile(message: string, taxonomy: LF05Taxonomy = onboardingTaxonomy): ExtractedUserProfile {
    const work = findTerm(message, workTerms);
    const study = findTerm(message, studyTerms);
    const areaMentions = findTaxonomyMatches(message, taxonomy.areas ?? []);
    const targetCity = findDestination(message, taxonomy, areaMentions);
    const targetSectors = findTaxonomyMatches(message, taxonomy.sectors);
    const targetOccupations = findTaxonomyMatches(message, taxonomy.occupations);
    const housing = findTerm(message, housingTerms);
    // Any rupiah amount covers the budget topic: LF-05 accepts a monthly budget, a rent cap or a salary.
    const budgetMention = findTerm(message, budgetTerms) ?? message.match(moneyPattern)?.[0] ?? null;
    const commuteMention = findTerm(message, commuteTerms) ?? message.match(durationPattern)?.[0] ?? null;
    const priorityMention = findTerm(message, priorityTerms);
    const prioritySignals = priorityMention
        ? priorityDimensions.filter(({ terms }) => hasPriorityCueNearTerm(message, terms)).map(({ key }) => key)
        : [];
    const transport = findTerm(message, [
        "transportasi umum", "angkutan umum", "public transport", "public transit", "motor", "mobil", "bus", "kereta", "motorcycle", "car",
    ]);
    const workplace = findWorkplaceArea(message, taxonomy) ?? findTerm(message, ["lokasi kantor", "tempat kerja", "kantor", "office", "workplace"]);

    const topics: ExtractedUserProfile["topics"] = {
        goal: work ?? study,
        destination: targetCity,
        occupation: targetOccupations[0]?.matchedText ?? null,
        sector: targetSectors[0]?.matchedText ?? null,
        budget: budgetMention,
        housing,
        commute: commuteMention,
        priority: priorityMention,
        transport,
        workplace,
    };

    return {
        topics,
        goal: work && study ? "both" : work ? "work" : study ? "study" : null,
        targetCity,
        areaMentions,
        targetSectors,
        targetOccupations,
        budgetMention,
        commuteMention,
        priorities: prioritySignals,
    };
}

/** Call only after server-side screening; serialize result as Chat Input input_value. */
export function buildLF05Input(
    message: string,
    taxonomy: LF05Taxonomy,
    sessionReference: string,
    language: LF05Input["language"] = "id",
): LF05Input {
    return {
        mode: "onboarding",
        language,
        session_reference: sessionReference,
        privacy_screened: true,
        message,
        taxonomy,
    };
}
