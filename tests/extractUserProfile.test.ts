import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRelocationProfileInterpretationInput,
  extractUserProfile,
  onboardingTaxonomy,
  type RelocationProfileTaxonomy,
} from "../app/engine/extractUserProfile";

const taxonomy: RelocationProfileTaxonomy = {
  version: "2026-09",
  sectors: [
    { id: "software_and_it_services", label: "Software and IT services", aliases: ["IT"] },
    { id: "digital_commerce", label: "Digital commerce", aliases: ["e-commerce"] },
  ],
  occupations: [
    { id: "software_engineer", label: "Software engineer", aliases: ["developer"] },
  ],
};

test("detects only topics stated in casual Indonesian story", () => {
  const profile = extractUserProfile("mau kerja di IT, budget maksimal 4 juta, perjalanan paling lama 45 menit");
  const activeTopics = Object.entries(profile.topics)
    .filter(([, match]) => match !== null)
    .map(([topic]) => topic);

  assert.deepEqual(activeTopics, ["goal", "sector", "budget", "commute"]);
  assert.equal(profile.goal, "work");
  assert.deepEqual(profile.targetSectors.map(({ id, matchedText }) => ({ id, matchedText })), [
    { id: "software_and_it_services", matchedText: "IT" },
  ]);
  assert.deepEqual(profile.targetOccupations, []);
  assert.equal(profile.targetCity, null);
  assert.equal(profile.topics.housing, null);
  assert.deepEqual(profile.priorities, []);
});

test("separates explicit city, occupation, housing, commute, and priority mentions", () => {
  const profile = extractUserProfile(
    "Saya mau pindah ke Jakarta Selatan untuk kerja sebagai software engineer. Budget kos maksimal 4 juta per bulan, waktu tempuh ke kantor paling lama 45 menit. Karier paling penting buat saya.",
  );

  assert.equal(profile.targetCity, "Jakarta Selatan");
  assert.deepEqual(profile.targetOccupations.map(({ id }) => id), ["software_engineer"]);
  assert.deepEqual(profile.targetSectors.map(({ id }) => id), ["software_and_it_services"]);
  assert.equal(profile.topics.budget, "Budget");
  assert.equal(profile.topics.housing, "kos");
  assert.equal(profile.topics.commute, "waktu tempuh");
  assert.equal(profile.topics.workplace, "kantor");
  assert.deepEqual(profile.priorities, ["career"]);
});

test("does not treat sector or occupation as a destination", () => {
  assert.equal(extractUserProfile("mau pindah ke IT untuk kerja").targetCity, null);
  assert.equal(extractUserProfile("mau pindah ke developer").targetCity, null);
});

test("matches every sector and occupation from the onboarding taxonomy", () => {
  const profile = extractUserProfile(
    "programming, telco, digital banking, analitik, online retail, infosec, IT consulting. backend engineer, BI analyst, desainer UI, network admin, product owner, SOC analyst.",
  );

  assert.deepEqual(profile.targetSectors.map(({ id }) => id), onboardingTaxonomy.sectors.map(({ id }) => id));
  assert.deepEqual(profile.targetOccupations.map(({ id }) => id), onboardingTaxonomy.occupations.map(({ id }) => id));
});

test("resolves a district to its city and reads the rest of a casual story", () => {
  const profile = extractUserProfile(
    "Saya mau pindah kerja ke kuningan sebagai cyber security analyst dengan gaji 10 juta perbulan, dan mau cari apartemen 4-5 jutaan per bulan. saya bawa mobil.",
  );

  assert.equal(profile.targetCity, "Jakarta Selatan");
  assert.deepEqual(profile.areaMentions.map(({ label, matchedText }) => ({ label, matchedText })), [
    { label: "Jakarta Selatan", matchedText: "kuningan" },
  ]);
  assert.equal(profile.topics.workplace, "kuningan");
  assert.deepEqual(profile.targetOccupations.map(({ id }) => id), ["cybersecurity_analyst"]);
  assert.deepEqual(profile.targetSectors.map(({ id }) => id), ["cybersecurity"]);
  assert.equal(profile.topics.budget, "gaji");
  assert.equal(profile.topics.housing, "apartemen");
  assert.equal(profile.topics.transport, "mobil");
  assert.equal(profile.topics.commute, null);
});

test("counts rupiah amounts and durations in common formats, and nothing else", () => {
  for (const text of ["kos Rp 1.500.000", "sewa IDR 2,000,000", "sewa 1.8jt", "sewa 500rb", "sewa 4 jutaan", "sewa 3500k"]) {
    assert.notEqual(extractUserProfile(text).topics.budget, null, text);
  }
  assert.equal(extractUserProfile("tahun 2026 ada 3 kamar").topics.budget, null);
  assert.equal(extractUserProfile("maks 1 jam dari kos").topics.commute, "1 jam");
  assert.equal(extractUserProfile("setengah jam aja").topics.commute, "setengah jam");
});

test("needs a specific area, keeps places outside the list, and finds the office district", () => {
  assert.equal(extractUserProfile("mau pindah ke Jakarta untuk kerja").targetCity, null);
  assert.equal(extractUserProfile("mau pindah ke Bandung untuk kerja").targetCity, "Bandung");
  assert.equal(extractUserProfile("mau tinggal di jaksel").targetCity, "Jakarta Selatan");

  const profile = extractUserProfile("tinggal di Tebet tapi kantor di mega kuningan");
  assert.equal(profile.targetCity, "Jakarta Selatan");
  assert.equal(profile.topics.workplace, "mega kuningan");
});

test("uses caller-supplied taxonomy entries beyond the bundled set", () => {
  const customTaxonomy: RelocationProfileTaxonomy = {
    version: "custom-2026-10",
    sectors: [{ id: "agriculture", label: "Agriculture", aliases: ["farming"] }],
    occupations: [{ id: "veterinarian", label: "Veterinarian", aliases: ["vet"] }],
  };
  const profile = extractUserProfile("Looking for farming jobs as a vet", customTaxonomy);

  assert.deepEqual(profile.targetSectors.map(({ id }) => id), ["agriculture"]);
  assert.deepEqual(profile.targetOccupations.map(({ id }) => id), ["veterinarian"]);
});

test("builds the exact relocation profile interpretation onboarding input shape", () => {
  assert.deepEqual(buildRelocationProfileInterpretationInput("mau kerja di IT", taxonomy, "onboarding-session-001"), {
    mode: "onboarding",
    language: "id",
    session_reference: "onboarding-session-001",
    privacy_screened: true,
    taxonomy,
    message: "mau kerja di IT",
  });
  assert.deepEqual(buildRelocationProfileInterpretationInput("I want to study", taxonomy, "onboarding-session-001", "en"), {
    mode: "onboarding",
    language: "en",
    session_reference: "onboarding-session-001",
    privacy_screened: true,
    taxonomy,
    message: "I want to study",
  });
});
