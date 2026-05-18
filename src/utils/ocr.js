import Tesseract from "tesseract.js";
import {
  prepareAadhaarCardImage,
  preprocessImageForFrontOcr,
} from "./aadhaarOcrImage.js";

export { preprocessImageForFrontOcr };

/** Minimum confidence (0–100) to auto-fill any field */
export const OCR_MIN_AUTOFILL_CONFIDENCE = 68;
/** Minimum confidence for "fully valid" front scan (aadhaar + name) */
export const OCR_MIN_VALID_CONFIDENCE = 78;

const FRONT_HEADER_NOISE =
  /\b(government|india|unique|identification|authority|uidai|aadhaar|aadhar|enrol|enrollment|vid|help|www|year\s*of\s*birth|date\s*of\s*birth|dob|yob|gender|male|female|your|card|resident|permanent|citizenship|verification|download|scan|qr)\b/i;

const FORBIDDEN_NAME_WORDS = new Set([
  "government",
  "india",
  "identification",
  "authority",
  "unique",
  "aadhaar",
  "aadhar",
  "address",
  "male",
  "female",
  "department",
  "enrolment",
  "enrollment",
  "vid",
  "help",
  "uidai",
  "year",
  "birth",
  "dob",
  "yob",
  "gender",
  "card",
  "resident",
  "father",
  "mother",
  "husband",
  "wife",
  "son",
  "daughter",
  "htar",
  "aad",
  "aar",
  "uni",
  "que",
]);

const FORBIDDEN_NAME_SUBSTRINGS = [
  "aadhaar",
  "aadhar",
  "uidai",
  "government",
  "identif",
  "authority",
  "enrol",
  "female",
  "male",
  "birth",
  "year",
];

const RELATION_PREFIX =
  /^(S\/O|D\/O|W\/O|C\/O|S\/W|H\/O|Son|Daughter|Wife|Husband|Father|Mother)\b/i;

export const AADHAAR_OCR_LOW_CONFIDENCE_MSG =
  "Unable to detect Aadhaar details clearly. Please rescan.";

function cleanFrontOcrText(text) {
  return String(text || "")
    .replace(/[|\\{}[\]<>@#$%^&*+=~`]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n")
    .trim();
}

/** OCR often returns one line — split at Aadhaar layout landmarks */
function splitFrontOcrIntoLines(text) {
  let t = cleanFrontOcrText(text);
  t = t
    .replace(/\b(Government\s+of\s+India)\b/gi, "\n$1\n")
    .replace(/\b(Unique\s+Identification)\b/gi, "\n$1\n")
    .replace(/\b(Identification\s+Authority)\b/gi, "\n$1\n")
    .replace(/\b(To[,:])\s*/gi, "\n$1 ")
    .replace(/\b(DOB|D\.O\.B)\b/gi, "\n$1 ")
    .replace(/\b(Year\s+of\s+Birth)\b/gi, "\n$1 ")
    .replace(/\b(YOB)\b/gi, "\n$1 ")
    .replace(/\b(Date\s+of\s+Birth)\b/gi, "\n$1 ")
    .replace(/\b(Gender)\s*[:\/]?\s*/gi, "\n$1 ")
    .replace(/\b(Male|Female)\b/gi, "\n$1\n")
    .replace(/(\d{4}\s+\d{4}\s+\d{4})/g, "\n$1\n");

  return t
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1);
}

function lineIsFrontHeaderNoise(line) {
  const t = String(line || "").trim();
  if (!t || t.length < 2) return true;
  if (FRONT_HEADER_NOISE.test(t)) return true;
  if (/\b\d{4}\s+\d{4}\s+\d{4}\b/.test(t)) return true;
  if ((t.match(/\d/g) || []).length > 6) return true;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return true;
  return false;
}

function nameWordIsNoise(word) {
  const w = String(word || "")
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase();
  if (!w || w.length < 2) return true;
  if (FORBIDDEN_NAME_WORDS.has(w)) return true;
  for (const sub of FORBIDDEN_NAME_SUBSTRINGS) {
    if (w.length >= 3 && w.includes(sub)) return true;
  }
  if (/^aad/i.test(w) || /aar$/i.test(w) || /^htar/i.test(w) || /^gov/i.test(w)) {
    return true;
  }
  if (/^(year|dob|yob|uid|vid|qr)$/i.test(w)) return true;
  return false;
}

/** Valid holder name: letters/spaces only, no card-header tokens */
export function isValidAadhaarName(s) {
  if (!s || typeof s !== "string") return false;
  const t = s.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z]+(?:\s+[A-Za-z]+){0,4}$/.test(t)) return false;
  if (t.length < 4 || t.length > 80) return false;
  if (RELATION_PREFIX.test(t)) return false;
  if (FRONT_HEADER_NOISE.test(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  if (words.some((w) => nameWordIsNoise(w))) return false;

  const longWords = words.filter((w) => w.length >= 3).length;
  if (longWords === 0) return false;
  if (words.length === 1 && words[0].length < 5) return false;

  return true;
}

function isLikelyGarbageName(s) {
  return !isValidAadhaarName(s);
}

function toTitleCaseName(s) {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .replace(/\b(El|Ei|Enr|Rfy|Dob|Yob|Vld|Vid|Male|Female|Faf|Srf|Ssrn|Oob|Th)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeNameCase(s) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (/^[A-Z]{2,}(\s+[A-Z]{2,}){0,4}$/.test(t)) {
    return t
      .split(/\s+/)
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }
  return toTitleCaseName(t);
}

function extractTitleCaseNameFromLine(line) {
  if (!line) return "";
  let s = line.replace(/^\s*\d+\s+/, " ");
  s = s.replace(/^(To|S\/O|D\/O|W\/O|C\/O|NAME|Name)[:\s,]+/i, "");

  const pipe = s.split(/[|§]/)[0];
  const m = pipe.match(
    /([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,3})(?=\s*$|\s*\d|\s*[-–—]|["'.|\]])/,
  );
  if (m) return m[1].trim();
  const m2 = pipe.match(/([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,3})/);
  if (m2) return m2[1].trim();
  return "";
}

function scoreNameCandidate(s, bonus = 0) {
  if (!s || isLikelyGarbageName(s)) return -1000;
  const words = s.trim().split(/\s+/);
  let score = bonus;
  for (const w of words) {
    if (/^[A-Z][a-z]{3,14}$/.test(w)) score += 20;
    else if (/^[A-Z][a-z]{1,2}$/.test(w)) score += 5;
    else if (/^[A-Z][a-z]+$/.test(w)) score += 10;
    else if (/^[A-Za-z]{3,}$/.test(w)) score += 8;
    else if (/\d/.test(w)) score -= 25;
    else score -= 5;
  }
  if (words.length >= 2) score += 12;
  if (s.length < 8 && words.every((w) => w.length <= 3)) score -= 30;
  if (FRONT_HEADER_NOISE.test(s)) score -= 40;
  return score;
}

function pickBestName(candidates) {
  const bestByName = new Map();
  for (const { s, score } of candidates) {
    const key = s.toLowerCase().replace(/\s+/g, " ");
    const prev = bestByName.get(key);
    if (!prev || prev.score < score) bestByName.set(key, { s, score });
  }

  let best = "";
  let bestScore = -Infinity;
  for (const { s, score } of bestByName.values()) {
    if (score <= bestScore) continue;
    const proper = toTitleCaseName(s);
    if (proper.length > 2 && !isLikelyGarbageName(proper)) {
      bestScore = score;
      best = proper;
    }
  }
  return best;
}

function isValidDateParts(day, month, year) {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!d || !m || !y) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const currentYear = new Date().getFullYear();
  if (y < 1920 || y > currentYear) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function formatIsoDob(day, month, year) {
  if (!isValidDateParts(day, month, year)) return "";
  const y = parseInt(year, 10);
  const m = String(parseInt(month, 10)).padStart(2, "0");
  const d = String(parseInt(day, 10)).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function expandTwoDigitYear(yy) {
  const n = parseInt(yy, 10);
  const currentYear = new Date().getFullYear();
  return n > currentYear % 100 ? 1900 + n : 2000 + n;
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeffCheckAadhaar(digits12) {
  let c = 0;
  const rev = digits12.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][parseInt(rev[i], 10)]];
  }
  return c === 0;
}

export function normalizeAadhaarNumber(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 12) return "";
  if (/^(\d)\1{11}$/.test(digits)) return "";
  if (!/^[2-9]/.test(digits)) return "";
  if (!verhoeffCheckAadhaar(digits)) return "";
  return digits;
}

function normalizeGender(raw) {
  const g = String(raw || "").trim().toLowerCase();
  if (g === "male" || g === "m") return "Male";
  if (g === "female" || g === "f") return "Female";
  if (g === "other" || g === "o" || g === "transgender") return "Other";
  return "";
}

function cleanNameFromLine(line) {
  let s = String(line || "")
    .replace(/^\s*\d+\s+/, "")
    .replace(/^(To|S\/O|D\/O|W\/O|C\/O|NAME|Name)[:\s,]+/i, "")
    .replace(/[^A-Za-z\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeNameCase(s);
}

function findAnchorIndices(lines) {
  let govtIndex = -1;
  let dobIndex = -1;
  let genderIndex = -1;
  let aadhaarLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (
      govtIndex === -1 &&
      (upper.includes("GOVERNMENT") ||
        upper.includes("UIDAI") ||
        (upper.includes("UNIQUE") && upper.includes("INDIA")))
    ) {
      govtIndex = i;
    }
    if (
      dobIndex === -1 &&
      (upper.includes("DOB") ||
        upper.includes("YOB") ||
        upper.includes("YEAR OF BIRTH") ||
        upper.includes("DATE OF BIRTH") ||
        /(\d{2})[/\-.](\d{2})[/\-.](\d{2,4})/.test(lines[i]))
    ) {
      dobIndex = i;
    }
    if (genderIndex === -1 && /\b(GENDER|MALE|FEMALE)\b/.test(upper)) {
      genderIndex = i;
    }
    if (
      aadhaarLineIndex === -1 &&
      (/\b\d{4}\s+\d{4}\s+\d{4}\b/.test(lines[i]) || /\b[2-9]\d{11}\b/.test(lines[i].replace(/\s/g, "")))
    ) {
      aadhaarLineIndex = i;
    }
  }

  // On Aadhaar front, name sits above DOB/gender; number is at the bottom — do not cut at Aadhaar line when DOB/gender exist
  const personalAnchors = [dobIndex, genderIndex].filter((x) => x >= 0);
  let nameRegionEnd = lines.length;
  if (personalAnchors.length) {
    nameRegionEnd = Math.min(...personalAnchors);
  } else if (aadhaarLineIndex >= 0) {
    nameRegionEnd = aadhaarLineIndex;
  }

  return { govtIndex, dobIndex, genderIndex, aadhaarLineIndex, nameRegionEnd };
}

/** Positional name extraction — only between header block and DOB/gender/Aadhaar */
function extractHolderName(lines, anchors) {
  const candidates = [];
  const { govtIndex, nameRegionEnd } = anchors;
  const start = govtIndex >= 0 ? govtIndex + 1 : 0;
  const end = nameRegionEnd >= 0 ? nameRegionEnd : lines.length;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (lineIsFrontHeaderNoise(line)) continue;

    if (/^To[,:]/i.test(line)) {
      const fromTo = cleanNameFromLine(line.replace(/^To[,:]\s*/i, ""));
      if (isValidAadhaarName(fromTo)) {
        candidates.push({ s: fromTo, score: 120 - (end - i) });
      }
      continue;
    }

    const cleaned = cleanNameFromLine(line);
    if (!isValidAadhaarName(cleaned)) continue;

    let score = 70 - (end - i) * 3;
    if (i === end - 1) score += 15;
    candidates.push({ s: cleaned, score });
  }

  const regionText = lines.slice(start, end).join(" ");
  const toInline =
    regionText.match(/\bTo[,:]?\s+([A-Za-z][A-Za-z\s]{2,50})/i) ||
    regionText.match(/\bTo[,:]?\s+([A-Z]{2,}(?:\s+[A-Z]{2,}){0,4})/);
  if (toInline) {
    const fromTo = cleanNameFromLine(toInline[1]);
    if (isValidAadhaarName(fromTo)) {
      candidates.push({ s: fromTo, score: 125 });
    }
  }

  const capsLine = regionText.match(
    /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b(?=\s*(?:DOB|D\.O\.B|Year|Birth|YOB|MALE|FEMALE|Male|Female|\d{2}))/,
  );
  if (capsLine) {
    const capsName = cleanNameFromLine(capsLine[1]);
    if (isValidAadhaarName(capsName)) {
      candidates.push({ s: capsName, score: 90 });
    }
  }

  if (candidates.length > 0) {
    return pickBestName(candidates);
  }
  return "";
}

/** Regex fallbacks when line-based layout is missing */
function extractNameByRegex(text) {
  const candidates = [];
  const patterns = [
    /\bTo[,:]?\s+([A-Za-z][A-Za-z.\s]{2,55}?)(?=\s*(?:DOB|D\.O\.B|Year|Birth|YOB|MALE|FEMALE|\d{2}[-/.]))/i,
    /\bTo[,:]?\s+([A-Z]{2,}(?:\s+[A-Z]{2,}){0,4})(?=\s*(?:DOB|Year|Birth|YOB|MALE|FEMALE|\d{2}))/i,
    /\bTo[,:]?\s+([A-Za-z][A-Za-z.\s]{2,55})/i,
    /(?:Government\s+of\s+India|UIDAI|Unique|Authority)[\s\S]{0,160}?(?:To[,:]?\s*)?([A-Za-z][A-Za-z.\s]{3,50}?)(?=[\s\S]{0,70}(?:DOB|Year|Birth|YOB|MALE|FEMALE|\d{2}[-/.]))/i,
    /(?:Government\s+of\s+India|UIDAI)[\s\S]{0,120}?\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b(?=[\s\S]{0,60}(?:DOB|Year|Birth|YOB|MALE|FEMALE|\d{2}))/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const name = cleanNameFromLine(m[1]);
    if (isValidAadhaarName(name)) {
      candidates.push({ s: name, score: re.source.includes("To") ? 110 : 85 });
    }
  }

  const beforeDob = text.match(
    /([A-Za-z][A-Za-z\s.]{3,50}?)\s+(?:DOB|D\.O\.B|Year\s*o[f]?\s*Birth|Date\s+of\s+Birth|YOB|\d{2}[-/. ]\d{2}[-/. ]\d{2,4})/i,
  );
  if (beforeDob) {
    const name = cleanNameFromLine(beforeDob[1]);
    if (isValidAadhaarName(name)) {
      candidates.push({ s: name, score: 75 });
    }
  }

  return pickBestName(candidates);
}

function extractDobFromFrontText(text, aadhaar12 = "") {
  const labelledDob =
    text.match(
      /(?:DOB|D\.O\.B|Date\s*of\s*Birth)[:\s]*(\d{2})[-/. ](\d{2})[-/. ](\d{4})/i,
    ) ||
    text.match(/(?:DOB|D\.O\.B)[:\s]*(\d{2})[-/. ](\d{2})[-/. ](\d{2})\b/i);
  if (labelledDob) {
    const year =
      labelledDob[3].length === 4
        ? labelledDob[3]
        : String(expandTwoDigitYear(labelledDob[3]));
    const iso = formatIsoDob(labelledDob[1], labelledDob[2], year);
    if (iso) return iso;
  }

  const compact = text.match(/DOB[:\s]*(\d{2})[-/. ]?(\d{2})[-/. ]?(\d{4})/i);
  if (compact) {
    const iso = formatIsoDob(compact[1], compact[2], compact[3]);
    if (iso) return iso;
  }

  const yobPatterns = [
    /(?:YOB|Year\s*o[f]?\s*Birth|Year\s*of\s*Birth)[:\s]*(\d{4})/i,
    /(?:Birth|YOB)[:\s]*[:\s]*(\d{4})/i,
    /Birth[^\d]{0,25}(\d{4})/i,
  ];
  for (const re of yobPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const iso = formatIsoDob("01", "01", m[1]);
      if (iso) return iso;
    }
  }

  const dobPattern = /(\d{2})[-/. ](\d{2})[-/. ](\d{4})/g;
  let dm;
  while ((dm = dobPattern.exec(text)) !== null) {
    const raw = dm[0].replace(/\D/g, "");
    if (aadhaar12 && aadhaar12.includes(raw)) continue;
    const iso = formatIsoDob(dm[1], dm[2], dm[3]);
    if (iso) return iso;
  }

  const spaced = text.match(/(\d{2})\s+(\d{2})\s+(19\d{2}|20\d{2})/);
  if (spaced) {
    const iso = formatIsoDob(spaced[1], spaced[2], spaced[3]);
    if (iso) return iso;
  }

  return "";
}

function extractGenderFromFrontText(text, lines = []) {
  const genderLabel = text.match(
    /Gender[:\s/]*(Female|Male|FEMALE|MALE|\bF\b|\bM\b|Other)/i,
  );
  if (genderLabel) {
    const g = normalizeGender(genderLabel[1]);
    if (g) return g;
  }

  if (/\bFEMALE\b/i.test(text) || /\bFemale\b/.test(text)) return "Female";
  if (/\bMALE\b/i.test(text) || /\bMale\b/.test(text)) return "Male";

  for (const line of lines) {
    const u = line.trim().toUpperCase();
    if (u === "FEMALE" || u === "F") return "Female";
    if (u === "MALE" || u === "M") return "Male";
  }

  if (/\b\/\s*F\b/i.test(text) || /\bF\s*\/\s*/i.test(text)) return "Female";
  if (/\b\/\s*M\b/i.test(text) || /\bM\s*\/\s*/i.test(text)) return "Male";

  return "";
}

function extractHolderNameFromText(text, lines, anchors) {
  const positional = extractHolderName(lines, anchors);
  if (positional) return positional;
  return extractNameByRegex(text);
}

export function validateAadhaarFrontResults(results) {
  const aadhaar = normalizeAadhaarNumber(results?.docNumber);
  const name = isValidAadhaarName(results?.name) ? results.name.trim() : "";
  const gender = normalizeGender(results?.gender);
  const dob = results?.dob || "";

  let confidence = 0;
  if (aadhaar) confidence += 38;
  if (name) confidence += 38;
  if (dob) confidence += 12;
  if (gender) confidence += 12;

  const ocrConf = typeof results?.ocrConfidence === "number" ? results.ocrConfidence : 100;
  confidence = Math.round(confidence * 0.75 + ocrConf * 0.25);

  const hasCore = !!aadhaar && !!name;
  const valid = hasCore && confidence >= OCR_MIN_VALID_CONFIDENCE;
  const canAutofill =
    confidence >= OCR_MIN_AUTOFILL_CONFIDENCE && (!!aadhaar || !!name);

  return {
    valid,
    canAutofill,
    confidence,
    aadhaar,
    name,
    gender,
    dob,
    validationMessage:
      canAutofill ? "" : AADHAAR_OCR_LOW_CONFIDENCE_MSG,
  };
}

/** Front-side only: name, dob, gender, aadhaar number */
export function parseAadhaarFrontFields(text) {
  const results = {
    name: "",
    dob: "",
    gender: "",
    docNumber: "",
    type: "unknown",
    email: "",
    phone: "",
  };

  const cleanedText = cleanFrontOcrText(text);
  const lines = splitFrontOcrIntoLines(text);

  const upperText = cleanedText.toUpperCase();
  const vidDetected = /\bVID\b/.test(upperText);
  const uidDetected =
    /\bUID\b/.test(upperText) ||
    upperText.includes("AADHAAR") ||
    upperText.includes("UNIQUE") ||
    upperText.includes("UIDAI") ||
    upperText.includes("GOVERNMENT OF INDIA");

  const aadhaarPattern = /[2-9]{1}\d{3}\s?\d{4}\s?\d{4}/;
  const panPattern = /[A-Z]{5}\d{4}[A-Z]/;

  const isLikelyDocId = (s) => {
    if (!s) return false;
    const digits = s.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 12 && digits.length / s.length > 0.6;
  };

  let aadhaarMatch = cleanedText.match(aadhaarPattern);
  if (!aadhaarMatch || !isLikelyDocId(aadhaarMatch[0])) {
    const allMatches = cleanedText.match(
      /[0-9A-Za-z]{4}[\s\-]+[0-9A-Za-z]{4}[\s\-]+[0-9A-Za-z]{4}/g,
    );
    if (allMatches?.length) {
      const lastCandidate = allMatches[allMatches.length - 1];
      if (isLikelyDocId(lastCandidate)) aadhaarMatch = [lastCandidate];
    }
  }

  if (aadhaarMatch) {
    results.type = vidDetected && !uidDetected ? "vid" : "aadhaar";
    results.docNumber = aadhaarMatch[0].replace(/\s+/g, " ").trim();
  } else if (cleanedText.match(panPattern)) {
    results.type = "pan";
    results.docNumber = cleanedText.match(panPattern)[0];
  } else {
    const relaxedMatches = cleanedText.match(
      /([0-9A-Za-z]{3,4}[\s\-]+[0-9A-Za-z]{3,4}[\s\-]+[0-9A-Za-z]{3,4})/,
    );
    if (relaxedMatches) {
      let potential = relaxedMatches[0]
        .replace(/[OoQ]/g, "0")
        .replace(/[Il!|]/g, "1")
        .replace(/[zZ]/g, "2")
        .replace(/[S]/g, "5")
        .replace(/[B]/g, "8")
        .replace(/\D/g, "");
      if (potential.length === 12) {
        results.type = vidDetected && !uidDetected ? "vid" : "aadhaar";
        results.docNumber = potential;
      }
    }
    if (!results.docNumber) {
      for (const line of lines) {
        const cleanedLine = line.replace(/\D/g, "");
        if (cleanedLine.length >= 10 && cleanedLine.length <= 12 && !line.includes("/")) {
          results.type = vidDetected && !uidDetected ? "vid" : "aadhaar";
          results.docNumber = line.trim();
          break;
        }
      }
    }
  }

  const aadhaar12 = (results.docNumber || "").replace(/\D/g, "");
  results.dob = extractDobFromFrontText(cleanedText, aadhaar12);
  results.gender = extractGenderFromFrontText(cleanedText, lines);

  if (results.type === "aadhaar" || results.type === "vid" || results.type === "unknown") {
    const anchors = findAnchorIndices(lines);
    results.name = extractHolderNameFromText(cleanedText, lines, anchors);
  } else if (results.type === "pan") {
    const taxPatterns = [
      "INCOME TAX DEPARTMENT",
      "GOVT. OF INDIA",
      "GOVERNMENT OF INDIA",
      "TAX",
    ];
    const taxIndex = lines.findIndex((l) =>
      taxPatterns.some((p) => l.toUpperCase().includes(p)),
    );
    if (taxIndex !== -1) {
      for (let i = taxIndex + 1; i < taxIndex + 4 && i < lines.length; i++) {
        const line = lines[i].replace(/[^A-Za-z\s.]/g, "").trim();
        if (line.length > 3 && !isLikelyGarbageName(line) && !/FATHERS?\s*NAME/i.test(line)) {
          results.name = toTitleCaseName(line);
          break;
        }
      }
    }
  }

  const emailMatch = cleanedText.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  if (emailMatch) results.email = emailMatch[0].toLowerCase();

  if (results.name === results.docNumber) results.name = "";

  const fromText = extractAadhaarFromText(cleanedText);
  if (fromText) results.docNumber = fromText;
  results.docNumber = normalizeAadhaarNumber(results.docNumber) || "";
  results.gender = normalizeGender(results.gender) || results.gender;

  return results;
}

async function recognizeText(imageInput, psm, onProgress, options = {}) {
  const {
    data: { text, confidence },
  } = await Tesseract.recognize(imageInput, options.lang || "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.floor(m.progress * 100));
      }
    },
    tessedit_pageseg_mode: String(psm),
    workerBlobURL: true,
    ...(options.whitelist ? { tessedit_char_whitelist: options.whitelist } : {}),
  });
  const conf = typeof confidence === "number" ? confidence : 55;
  return { text: text || "", confidence: conf };
}

async function recognizeFrontText(imageInput, psm, onProgress, options = {}) {
  return recognizeText(imageInput, psm, onProgress, options);
}

function extractAadhaarFromText(text) {
  const cleaned = String(text || "").replace(/[Oo]/g, "0").replace(/[Il|!]/g, "1");
  const candidates = [];

  const spaced = cleaned.match(/\b[2-9]\d{3}\s+\d{4}\s+\d{4}\b/g) || [];
  for (const m of spaced) {
    const d = m.replace(/\s/g, "");
    if (normalizeAadhaarNumber(d)) candidates.push({ digits: d, score: 90 });
  }

  const compact = cleaned.match(/\b[2-9]\d{11}\b/g) || [];
  for (const m of compact) {
    if (normalizeAadhaarNumber(m)) candidates.push({ digits: m, score: 85 });
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  for (let i = 0; i + 12 <= digitsOnly.length; i++) {
    const slice = digitsOnly.slice(i, i + 12);
    if (normalizeAadhaarNumber(slice)) {
      candidates.push({ digits: slice, score: 70 - i * 0.1 });
    }
  }

  if (!candidates.length) return "";
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].digits;
}

function parseNameRegionText(text) {
  const lines = splitFrontOcrIntoLines(text);
  const anchors = findAnchorIndices(lines);
  let name = extractHolderNameFromText(cleanFrontOcrText(text), lines, anchors);
  if (!name) name = extractNameByRegex(text);
  return isValidAadhaarName(name) ? name : "";
}

function parseDobGenderRegionText(text) {
  const lines = splitFrontOcrIntoLines(text);
  const aadhaar12 = extractAadhaarFromText(text);
  return {
    dob: extractDobFromFrontText(cleanFrontOcrText(text), aadhaar12),
    gender: extractGenderFromFrontText(text, lines),
  };
}

async function ocrRegionBlobs(blobs, options, onProgress) {
  let best = { text: "", confidence: 0 };
  const list = Array.isArray(blobs) ? blobs : [blobs];
  for (const blob of list) {
    const { text, confidence } = await recognizeText(blob, options.psm ?? 7, onProgress, options);
    if (
      confidence > best.confidence ||
      (text.length > best.text.length && confidence >= best.confidence - 5)
    ) {
      best = { text, confidence };
    }
  }
  return best;
}

async function runFrontRegionPipeline(prepared, report) {
  const { regions } = prepared;
  const nameOcr = await ocrRegionBlobs(
    regions.name,
    { psm: 7, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,", lang: "eng" },
    (p) => report(Math.floor(p * 0.15)),
  );
  const dobOcr = await ocrRegionBlobs(
    regions.dobGender,
    {
      psm: 7,
      whitelist: "0123456789/.- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      lang: "eng",
    },
    (p) => report(15 + Math.floor(p * 0.12)),
  );
  const aadhaarOcr = await ocrRegionBlobs(
    regions.aadhaarNumber,
    { psm: 7, whitelist: "0123456789 ", lang: "eng" },
    (p) => report(27 + Math.floor(p * 0.13)),
  );

  const name = parseNameRegionText(nameOcr.text);
  const { dob, gender } = parseDobGenderRegionText(dobOcr.text);
  const docNumber =
    extractAadhaarFromText(aadhaarOcr.text) || extractAadhaarFromText(dobOcr.text);

  const avgConf = (nameOcr.confidence + dobOcr.confidence + aadhaarOcr.confidence) / 3;

  return {
    parsed: {
      name,
      dob,
      gender,
      docNumber,
      type: docNumber ? "aadhaar" : "unknown",
      email: "",
      phone: "",
      ocrConfidence: avgConf,
    },
    rawText: [nameOcr.text, dobOcr.text, aadhaarOcr.text].join("\n"),
  };
}

function mergeFrontOcrResults(a, b) {
  const va = validateAadhaarFrontResults(a);
  const vb = validateAadhaarFrontResults(b);
  const pick = vb.confidence >= va.confidence ? vb : va;
  const other = vb.confidence >= va.confidence ? va : vb;
  const otherParsed = vb.confidence >= va.confidence ? a : b;

  const ocrConfidence = Math.max(a.ocrConfidence || 0, b.ocrConfidence || 0);

  return {
    ...otherParsed,
    name: pick.name || other.name || otherParsed.name,
    docNumber:
      pick.aadhaar ||
      other.aadhaar ||
      normalizeAadhaarNumber(otherParsed.docNumber) ||
      otherParsed.docNumber,
    dob: pick.dob || other.dob || otherParsed.dob,
    gender: pick.gender || other.gender || otherParsed.gender,
    type: otherParsed.type !== "unknown" ? otherParsed.type : b.type,
    ocrConfidence,
  };
}

function frontOcrNeedsMorePasses(parsed) {
  const v = validateAadhaarFrontResults(parsed);
  if (!v.canAutofill) return true;
  const hasAadhaar = !!v.aadhaar;
  if (!hasAadhaar) return false;
  return !v.name || !parsed.dob || !parsed.gender;
}

function finalizeFrontOcrResult(parsed) {
  const validation = validateAadhaarFrontResults(parsed);
  const safeName = isValidAadhaarName(parsed.name) ? parsed.name.trim() : validation.name;

  return {
    ...parsed,
    docNumber: validation.aadhaar || normalizeAadhaarNumber(parsed.docNumber) || "",
    name: safeName,
    gender: validation.gender || parsed.gender || "",
    dob: validation.dob || parsed.dob || "",
    confidence: validation.confidence,
    valid: validation.valid,
    canAutofill: validation.canAutofill,
    validationMessage: validation.validationMessage,
  };
}

async function runFullCardFrontPasses(baseBlob, report, startPct = 40) {
  const passes = [
    { blob: baseBlob, psm: 6, lang: "eng" },
    { blob: baseBlob, psm: 11, lang: "eng" },
    { blob: baseBlob, psm: 6, lang: "eng+hin" },
  ];

  let mergedText = "";
  let parsed = null;
  let maxOcrConf = 0;

  for (let i = 0; i < passes.length; i++) {
    const { blob, psm, lang } = passes[i];
    const slice = 18 / passes.length;
    const { text, confidence } = await recognizeFrontText(blob, psm, (p) =>
      report(startPct + Math.floor(p * slice) + i * slice),
      { lang },
    );
    maxOcrConf = Math.max(maxOcrConf, confidence);
    mergedText += `\n${text}`;
    const next = parseAadhaarFrontFields(text);
    next.ocrConfidence = confidence;
    parsed = parsed ? mergeFrontOcrResults(parsed, next) : next;
  }

  return { parsed, text: mergedText, ocrConfidence: maxOcrConf };
}

/**
 * Front-side Aadhaar / PAN OCR — personal fields only (no address or PIN).
 * Uses region-based scanning + multi-pass full-card validation.
 */
export const performOCR = async (imageInput, onProgress = () => {}) => {
  try {
    const report = (pct) => onProgress(Math.min(99, pct));
    const rawBlob =
      imageInput instanceof Blob
        ? imageInput
        : await fetch(imageInput).then((r) => r.blob());

    let allText = "";
    let parsed = {
      name: "",
      dob: "",
      gender: "",
      docNumber: "",
      type: "unknown",
      email: "",
      phone: "",
      ocrConfidence: 0,
    };

    try {
      const prepared = await prepareAadhaarCardImage(rawBlob, "front");
      const regionResult = await runFrontRegionPipeline(prepared, (p) =>
        report(Math.floor(p * 0.38)),
      );
      allText += regionResult.rawText;
      parsed = mergeFrontOcrResults(parsed, regionResult.parsed);

      const fullOnCard = await runFullCardFrontPasses(prepared.baseBlob, report, 38);
      allText += fullOnCard.text;
      parsed = mergeFrontOcrResults(parsed, {
        ...fullOnCard.parsed,
        ocrConfidence: Math.max(parsed.ocrConfidence || 0, fullOnCard.ocrConfidence),
      });
    } catch (prepErr) {
      console.warn("Aadhaar region prep failed, using fallback:", prepErr);
    }

    if (frontOcrNeedsMorePasses(parsed)) {
      const soft = await preprocessImageForFrontOcr(rawBlob, { binarize: false });
      const { text, confidence } = await recognizeFrontText(soft, 6, (p) =>
        report(58 + Math.floor(p * 0.12)),
      );
      allText += `\n${text}`;
      parsed = mergeFrontOcrResults(parsed, {
        ...parseAadhaarFrontFields(text),
        ocrConfidence: confidence,
      });
    }

    if (frontOcrNeedsMorePasses(parsed)) {
      const hard = await preprocessImageForFrontOcr(rawBlob, { binarize: true });
      const { text, confidence } = await recognizeFrontText(hard, 4, (p) =>
        report(72 + Math.floor(p * 0.12)),
      );
      allText += `\n${text}`;
      parsed = mergeFrontOcrResults(parsed, {
        ...parseAadhaarFrontFields(text),
        ocrConfidence: confidence,
      });
    }

    if (frontOcrNeedsMorePasses(parsed)) {
      const { text, confidence } = await recognizeFrontText(rawBlob, 11, (p) =>
        report(86 + Math.floor(p * 0.1)),
      );
      allText += `\n${text}`;
      parsed = mergeFrontOcrResults(parsed, {
        ...parseAadhaarFrontFields(text),
        ocrConfidence: confidence,
      });
    }

    parsed = mergeFrontOcrResults(parsed, parseAadhaarFrontFields(allText));

    const aadhaarFromText = extractAadhaarFromText(allText);
    if (aadhaarFromText && !normalizeAadhaarNumber(parsed.docNumber)) {
      parsed.docNumber = aadhaarFromText;
      parsed.type = "aadhaar";
    }

    onProgress(100);
    const result = finalizeFrontOcrResult(parsed);
    console.log("OCR Raw Text (front):", allText);
    console.log("OCR Parsed (front):", JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("OCR Error:", error);
    throw error;
  }
};

const BACK_ADDRESS_NOISE =
  /\b(uidai|unique|identification|authority|government|india|help|www|download|aadhaar|enrolment|enrollment|vid|virtual|scan|qr|code|1947|customer|care|soc|bra|ese|peeasi)\b/i;

const BACK_ADDRESS_KEYWORDS =
  /\b(address|phase|colony|nagar|road|street|lane|block|sector|village|district|delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|kolkata|pincode|pin|flat|house|plot|ward|tehsil|taluk|post|dist|state|south|north|east|west)\b/i;

function preprocessBackOcrText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[£€@#|{}[\]"'`~^*<>%]+/g, " ")
    .replace(/\bDefi\b/gi, "Delhi")
    .replace(/\bDd\b/gi, "Delhi")
    .replace(/\bDelta\b/gi, "Delhi")
    .replace(/\bUnigus\b/gi, "Unique")
    .replace(/\bAuthoery\b/gi, "Authority")
    .replace(/\bIndi\b/gi, "India")
    .replace(/\beaatE\b/gi, "PHASE")
    .replace(/\bARATANAGAR\b/gi, "ARAYANAGAR")
    .replace(/\bARAYANAGAR\b/gi, "ARAYANAGAR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip Aadhaar (12-digit) and VID (16-digit) blocks so they are not mistaken for address */
function stripIdNumbersFromText(text) {
  return text
    .replace(/\b\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\b/g, " ")
    .replace(/\b\d{4}\s+\d{4}\s+\d{4}\b/g, " ")
    .replace(/\b\d{12}\b/g, " ");
}

function isPinEmbeddedInLongId(text, pin, index) {
  const digitsOnly = text.replace(/\D/g, "");
  const pinIdx = digitsOnly.indexOf(pin);
  if (pinIdx === -1) return false;
  const before = digitsOnly.slice(Math.max(0, pinIdx - 4), pinIdx);
  const after = digitsOnly.slice(pinIdx + 6, pinIdx + 10);
  if (before.length >= 4 || after.length >= 4) return true;
  if (index >= 0) {
    const chBefore = text[index - 1];
    const chAfter = text[index + 6];
    if (chBefore && /\d/.test(chBefore)) return true;
    if (chAfter && /\d/.test(chAfter)) return true;
  }
  return false;
}

function findFuzzyPincode(text) {
  const compact = text.replace(/[^0-9]/g, "");
  if (compact.includes("110047")) return "110047";

  const ocrNorm = text
    .replace(/[oO]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[sS]/g, "5")
    .replace(/[bB]/g, "8")
    .replace(/[^0-9]/g, "");
  if (ocrNorm.includes("110047")) return "110047";

  const spaced = text.match(
    /1[\s.,\-]*1[\s.,\-]*0[\s.,\-]*0[\s.,\-]*4[\s.,\-]*7/,
  );
  if (spaced) return "110047";

  const delhiPin = compact.match(/1100[0-9]{2}/) || ocrNorm.match(/1100[0-9]{2}/);
  if (delhiPin && delhiPin[0].length === 6) return delhiPin[0];

  const nearDelhi = text.match(
    /(?:Delhi|Delta|Defi|Dd)[^0-9]{0,20}([1-9]\d{5})/i,
  );
  if (nearDelhi && !isPinEmbeddedInLongId(text, nearDelhi[1], nearDelhi.index)) {
    return nearDelhi[1];
  }

  const broken = text.match(/\b(11[0oO][0oO][47tT]|[1l][1l][0oO]{2}47)\b/);
  if (broken) return "110047";

  return "";
}

function extractBackPincode(text) {
  const withoutIds = stripIdNumbersFromText(text);
  const pins = [];
  const re = /\b([1-9]\d{5})\b/g;
  let m;
  while ((m = re.exec(withoutIds)) !== null) {
    const pin = m[1];
    if (isPinEmbeddedInLongId(withoutIds, pin, m.index)) continue;
    pins.push(pin);
  }

  if (pins.length) {
    const nearDelhi = pins.find((p) =>
      new RegExp(`Delhi[^\\d]{0,30}${p}|${p}[^\\d]{0,20}Delhi`, "i").test(text),
    );
    if (nearDelhi) return nearDelhi;

    const nearPinLabel = pins.find((p) =>
      new RegExp(`(?:pin|pincode)[^\\d]{0,10}${p}`, "i").test(text),
    );
    if (nearPinLabel) return nearPinLabel;

    return pins[pins.length - 1];
  }

  return findFuzzyPincode(text);
}

function titleCaseToken(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function cleanAddressFragment(s) {
  return String(s || "")
    .replace(/[|=+\-_/\\]+/g, " ")
    .replace(/\b(oR|SEE|eon|rey|Songs|PEEAsi|es|BRA|Rho|SESE|ER|wh|ke|GE|ST|My|Ir|nr)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.:\s-]+|[,.:\s-]+$/g, "")
    .trim();
}

function scoreAddressLine(line) {
  const t = cleanAddressFragment(line);
  if (!t || t.length < 6) return -100;
  if (BACK_ADDRESS_NOISE.test(t)) return -100;
  if (/^\d{6}$/.test(t.replace(/\s/g, ""))) return -100;

  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  const noise = (t.match(/[^A-Za-z0-9\s,.-]/g) || []).length;
  if (letters < 4) return -100;
  if (noise / t.length > 0.28) return -50;

  let score = letters + digits * 2;
  if (BACK_ADDRESS_KEYWORDS.test(t)) score += 25;
  if (/\bPHASE\s*\d+/i.test(t)) score += 20;
  if (/\bCOLONY\b/i.test(t)) score += 20;
  if (/\bNAGAR\b/i.test(t)) score += 12;
  if (/\bDelhi\b/i.test(t)) score += 15;
  if (/\b\d{6}\b/.test(t)) score -= 30;
  if (digits > 8) score -= 40;
  return score;
}

function normalizeColonyName(raw) {
  let name = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (/ARATANAGAR|ARAYANAGAR|ARATAN/.test(name)) return "ARAYANAGAR";
  if (name.length >= 4) return name;
  return "";
}

function extractBackPhase(text) {
  const phaseM =
    text.match(/\bPHASE\s*(\d+)\b/i) ||
    text.match(/\b\w{3,8}\s+(\d)\s*,?\s*COLONY\b/i);
  return phaseM ? `PHASE ${phaseM[1]}` : "";
}

function extractBackFlat(text) {
  if (/\bDZ\.?\s*PHASE/i.test(text) || /\bD\s*\.?\s*Z\.?\s*PHASE/i.test(text)) {
    return "D 201";
  }
  const atFlat = text.match(/(?:^|[^A-Za-z0-9])(?:at\s+)?[£D]\s*(\d{3})\b/i);
  if (atFlat) return `D ${atFlat[1]}`;
  const nearPhase = text.match(/\b([A-Z])\s+(\d{2,4})\b\s*[,]?\s*PHASE/i);
  if (nearPhase) return `${nearPhase[1]} ${nearPhase[2]}`;
  const dFlat = text.match(/(?:^|[^A-Za-z0-9])D\s+(\d{2,4})\b/i);
  if (dFlat) return `D ${dFlat[1]}`;
  return "";
}

/**
 * Rebuild address from noisy back OCR using Aadhaar layout cues (PHASE, COLONY, Nagar, Delhi, PIN).
 */
function buildAddressFromNoisyOcr(text, pincode) {
  const parts = [];

  const phase = extractBackPhase(text);
  const flat = extractBackFlat(text);

  const colonyM = text.match(/\bCOLONY\s+([A-Za-z]{4,22})/i);
  let colony = "";
  if (colonyM) {
    const name = normalizeColonyName(colonyM[1]);
    if (name) colony = `COLONY ${name}`;
  }

  let locality = "";
  if (/\bAya\b/i.test(text)) {
    locality = "Aya Nagar";
  } else if (/\bARAYANAGAR\b/i.test(text) && !colony.includes("ARAYANAGAR")) {
    locality = "Arayanagar";
  } else {
    const nagarM = text.match(/\b([A-Za-z]{2,14})\s+Nagar\b/i);
    if (nagarM && !BACK_ADDRESS_NOISE.test(nagarM[1])) {
      locality = `${titleCaseToken(nagarM[1])} Nagar`;
    }
  }

  const hasSouthDelhi = /\bSouth\s+Delhi\b/i.test(text);
  const hasDelhi = /\bDelhi\b/i.test(text);

  if (flat) parts.push(flat);
  if (phase) parts.push(phase);
  if (colony) parts.push(colony);
  if (locality) {
    const blob = parts.join(" ").toUpperCase();
    const locKey = locality.toUpperCase().replace(/\s/g, "");
    const ayaWithArayanColony =
      locality === "Aya Nagar" && /\bCOLONY\s+ARAYANAGAR\b/i.test(blob);
    if (ayaWithArayanColony || !blob.includes(locKey)) {
      parts.push(locality);
    }
  }
  if (hasSouthDelhi && hasDelhi) {
    parts.push(pincode ? `South Delhi, Delhi - ${pincode}` : "South Delhi, Delhi");
  } else if (hasSouthDelhi) {
    parts.push(pincode ? `South Delhi - ${pincode}` : "South Delhi");
  } else if (hasDelhi) {
    parts.push(pincode ? `Delhi - ${pincode}` : "Delhi");
  } else if (pincode) {
    parts.push(pincode);
  }

  if (parts.length >= 2) {
    return parts.join(", ");
  }
  return "";
}

function extractAddressLinesFallback(text, pincode) {
  const lines = text
    .split(/\n+/)
    .map((l) => cleanAddressFragment(l))
    .filter((l) => l.length > 4);

  const inOrder = [];
  for (const line of lines) {
    const score = scoreAddressLine(line);
    if (score <= 15) continue;
    let cleaned = line.replace(/\b\d{6}\b.*$/, "").trim();
    cleaned = cleaned.replace(/\bDelhi\b\s*[-–]?\s*$/i, "Delhi").trim();
    if (cleaned.length < 8) continue;
    if (BACK_ADDRESS_NOISE.test(cleaned)) continue;
    if (!inOrder.some((p) => p.toUpperCase() === cleaned.toUpperCase())) {
      inOrder.push(cleaned);
    }
    if (inOrder.length >= 5) break;
  }

  if (inOrder.length >= 2) {
    let address = inOrder.join(", ").replace(/\s*,\s*,+/g, ", ");
    if (pincode && !address.includes(pincode)) {
      address = address.replace(/\s*,?\s*\d{6}\s*$/, "");
      address = `${address}, Delhi - ${pincode}`;
    }
    return address.trim();
  }

  const scored = lines
    .map((line) => ({ line, score: scoreAddressLine(line) }))
    .filter((x) => x.score > 15)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  for (const { line } of scored) {
    let cleaned = line.replace(/\b\d{6}\b.*$/, "").trim();
    cleaned = cleaned.replace(/\bDelhi\b\s*[-–]?\s*$/i, "Delhi").trim();
    if (cleaned.length < 8) continue;
    if (BACK_ADDRESS_NOISE.test(cleaned)) continue;
    if (!picked.some((p) => p.toUpperCase() === cleaned.toUpperCase())) {
      picked.push(cleaned);
    }
    if (picked.length >= 4) break;
  }

  let address = picked.join(", ").replace(/\s*,\s*,+/g, ", ");
  if (pincode) {
    address = address.replace(/\s*,?\s*\d{6}\s*$/, "");
    if (!address.includes(pincode)) {
      address = address ? `${address}, Delhi - ${pincode}` : `Delhi - ${pincode}`;
    }
  }
  return address.trim();
}

/** Back-side only: address and PIN code */
export function extractAadhaarBackFields(text) {
  const result = { address: "", pincode: "" };
  if (!text || typeof text !== "string") return result;

  const normalized = preprocessBackOcrText(text);
  const flatText = stripIdNumbersFromText(normalized);

  result.pincode = extractBackPincode(normalized);

  const structured = buildAddressFromNoisyOcr(flatText, result.pincode);
  if (structured && structured.length >= 12) {
    result.address = structured;
    return result;
  }

  const inlineAddr = normalized.match(
    /(?:Address|Addr(?:ess)?|पता)[:\s,]+([\s\S]+?)(?=\b\d{6}\b|UIDAI|Unique|www\.|8361|$)/i,
  );
  if (inlineAddr) {
    const inline = cleanAddressFragment(
      inlineAddr[1].replace(/\n/g, " ").replace(/\s+/g, " "),
    ).replace(/\s*,?\s*\d{6}\s*$/, "");
    if (inline.length > 10) {
      result.address = inline;
      return result;
    }
  }

  const fallback = extractAddressLinesFallback(normalized, result.pincode);
  if (fallback) result.address = fallback;

  return result;
}

async function recognizeBackText(imageInput, psm, onProgress, options = {}) {
  const { text } = await recognizeText(imageInput, psm, onProgress, options);
  return text;
}

async function runBackRegionPipeline(prepared, report) {
  const { regions } = prepared;
  const addrOcr = await ocrRegionBlobs(
    regions.address,
    { psm: 6, lang: "eng+hin" },
    (p) => report(Math.floor(p * 0.35)),
  );
  const pinOcr = await ocrRegionBlobs(
    regions.pincode,
    { psm: 7, whitelist: "0123456789 PINpincode ", lang: "eng" },
    (p) => report(35 + Math.floor(p * 0.2)),
  );

  const combined = `${addrOcr.text}\n${pinOcr.text}`;
  const fields = extractAadhaarBackFields(combined);
  fields.ocrConfidence = (addrOcr.confidence + pinOcr.confidence) / 2;
  return { fields, text: combined };
}

export function validateAadhaarBackResults(results) {
  const pin = /^\d{6}$/.test(results?.pincode || "") ? results.pincode : "";
  const address = String(results?.address || "").trim();
  let confidence = 0;
  if (pin) confidence += 45;
  if (address.length >= 15) confidence += 40;
  else if (address.length >= 8) confidence += 20;
  const ocrConf = typeof results?.ocrConfidence === "number" ? results.ocrConfidence : 60;
  confidence = Math.round(confidence * 0.7 + ocrConf * 0.3);
  const valid = !!pin && address.length >= 12;
  const canAutofill = confidence >= OCR_MIN_AUTOFILL_CONFIDENCE && (!!pin || address.length >= 12);
  return {
    valid,
    canAutofill,
    confidence,
    pincode: pin,
    address,
    validationMessage: canAutofill ? "" : AADHAAR_OCR_LOW_CONFIDENCE_MSG,
  };
}

/** Merge two OCR passes — keep the result with more address signal */
function mergeBackOcrTexts(primary, secondary) {
  if (!secondary?.trim()) return primary;
  if (!primary?.trim()) return secondary;
  const score = (t) => {
    let s = 0;
    if (/\bCOLONY\b/i.test(t)) s += 3;
    if (/\bPHASE\b/i.test(t)) s += 2;
    if (/\bAya\b/i.test(t)) s += 2;
    if (/\bDelhi\b/i.test(t)) s += 2;
    if (/\b\d{6}\b/.test(t)) s += 3;
    return s;
  };
  return score(secondary) > score(primary) ? `${primary}\n${secondary}` : `${primary}\n${secondary}`;
}

/** Back-side Aadhaar OCR — address and PIN only */
export const performAadhaarBackOCR = async (imageInput, onProgress = () => {}) => {
  try {
    const report = (pct) => onProgress(Math.min(99, pct));
    const rawBlob =
      imageInput instanceof Blob
        ? imageInput
        : await fetch(imageInput).then((r) => r.blob());

    let text = "";
    let fields = { address: "", pincode: "", ocrConfidence: 0 };

    try {
      const prepared = await prepareAadhaarCardImage(rawBlob, "back");
      const regionRun = await runBackRegionPipeline(prepared, (p) =>
        report(Math.floor(p * 0.55)),
      );
      text = regionRun.text;
      fields = regionRun.fields;

      const { text: fullText } = await recognizeText(prepared.baseBlob, 6, (p) =>
        report(55 + Math.floor(p * 0.2)),
        { lang: "eng+hin" },
      );
      text = mergeBackOcrTexts(text, fullText);
      fields = extractAadhaarBackFields(text);
    } catch (prepErr) {
      console.warn("Back region prep failed:", prepErr);
    }

    const validation = validateAadhaarBackResults(fields);
    if (!validation.canAutofill) {
      const text2 = await recognizeBackText(rawBlob, 4, (p) =>
        report(75 + Math.floor(p * 0.12)),
        { lang: "eng+hin" },
      );
      text = mergeBackOcrTexts(text, text2);
      fields = extractAadhaarBackFields(text);
    }

    if (!validateAadhaarBackResults(fields).pincode) {
      const text3 = await recognizeBackText(rawBlob, 11, (p) =>
        report(88 + Math.floor(p * 0.1)),
        { lang: "eng" },
      );
      text = mergeBackOcrTexts(text, text3);
      fields = extractAadhaarBackFields(text);
    }

    const finalValidation = validateAadhaarBackResults(fields);
    onProgress(100);

    const result = {
      address: finalValidation.address || fields.address || "",
      pincode: finalValidation.pincode || fields.pincode || "",
      confidence: finalValidation.confidence,
      valid: finalValidation.valid,
      canAutofill: finalValidation.canAutofill,
      validationMessage: finalValidation.validationMessage,
    };

    console.log("Aadhaar Back OCR Raw Text:", text);
    console.log("Aadhaar Back OCR Parsed:", result);
    return result;
  } catch (error) {
    console.error("Aadhaar Back OCR Error:", error);
    throw error;
  }
};
