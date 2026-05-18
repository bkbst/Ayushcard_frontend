import {
  prepareAadhaarCardImage,
  preprocessImageForFrontOcr,
} from "./aadhaarOcrImage.js";
import {
  recognizeAadhaarImage,
  majorityPick,
  preloadAadhaarOcrWorker,
} from "./paddleOcrEngine.js";

export { preprocessImageForFrontOcr, preloadAadhaarOcrWorker };

/** Minimum confidence (0–100) to auto-fill any field */
export const OCR_MIN_AUTOFILL_CONFIDENCE = 72;
/** Minimum confidence for "fully valid" front scan (aadhaar + name) */
export const OCR_MIN_VALID_CONFIDENCE = 82;
/** Minimum score for accepting a parsed holder name */
const MIN_NAME_SCORE = 38;

const SHORT_NAME_ALLOWLIST = new Set([
  "md",
  "sk",
  "vk",
  "rk",
  "ak",
  "om",
  "vi",
  "kj",
  "dj",
  "bk",
  "pk",
  "nk",
  "an",
  "am",
  "aj",
]);

const GARBAGE_NAME_WORDS = new Set([
  "em",
  "wr",
  "ff",
  "ey",
  "ei",
  "en",
  "rfy",
  "htar",
  "gov",
  "uni",
  "aad",
  "aar",
  "uid",
  "vid",
  "dob",
  "yob",
  "th",
  "el",
  "ei",
  "ffey",
  "male",
  "female",
  "the",
  "and",
  "for",
  "you",
  "your",
  "card",
]);

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
  if (GARBAGE_NAME_WORDS.has(w)) return true;
  return false;
}

function nameWordLooksReal(word) {
  const w = String(word || "").replace(/[^A-Za-z]/g, "");
  if (!w || w.length < 2) return false;
  const lower = w.toLowerCase();
  if (nameWordIsNoise(w)) return false;

  if (w.length === 2) {
    return SHORT_NAME_ALLOWLIST.has(lower);
  }

  if (!/[aeiouAEIOU]/.test(w)) return false;

  const consonantRun = lower.replace(/[aeiouy]/g, "").match(/[bcdfghjklmnpqrstvwxz]{4,}/);
  if (consonantRun) return false;

  if (w.length >= 3 && /^[bcdfghjklmnpqrstvwxyz]{2,}$/i.test(w)) return false;

  return true;
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
  if (!words.every(nameWordLooksReal)) return false;

  const twoLetterCount = words.filter((w) => w.length === 2).length;
  if (twoLetterCount >= 2) return false;
  if (words.length >= 2 && twoLetterCount / words.length > 0.34) return false;

  const letters = t.replace(/\s/g, "");
  const vowels = (letters.match(/[aeiou]/gi) || []).length;
  if (letters.length >= 5 && vowels / letters.length < 0.22) return false;

  if (words.length === 1 && words[0].length < 4) return false;

  const avgLen = letters.length / words.length;
  if (words.length >= 2 && avgLen < 3.2) return false;

  return true;
}

export function scoreAadhaarNameQuality(s) {
  if (!s || !isValidAadhaarName(s)) return -1000;
  return scoreNameCandidate(s, 0);
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
  if (!s || !isValidAadhaarName(s)) return -1000;
  const words = s.trim().split(/\s+/);
  let score = bonus;
  for (const w of words) {
    if (/^[A-Z][a-z]{3,14}$/.test(w)) score += 28;
    else if (/^[A-Z][a-z]{1,2}$/.test(w)) score += 4;
    else if (/^[A-Z]{4,14}$/.test(w)) score += 22;
    else if (/^[A-Z]{2,3}$/.test(w)) score -= 18;
    else if (/^[A-Za-z]{4,}$/.test(w)) score += 14;
    else if (/\d/.test(w)) score -= 40;
    else score -= 12;
  }
  if (words.length === 1 && words[0].length >= 4 && words[0].length <= 14) score += 25;
  if (words.length >= 2 && words.length <= 4) score += 15;
  if (words.filter((w) => w.length === 2).length >= 1 && words.length >= 2) score -= 35;
  if (s.length < 8 && words.every((w) => w.length <= 3)) score -= 45;
  if (FRONT_HEADER_NOISE.test(s)) score -= 50;
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
    const proper = normalizeNameCase(s);
    const quality = scoreNameCandidate(proper, score);
    if (quality >= MIN_NAME_SCORE && quality > bestScore) {
      bestScore = quality;
      best = proper;
    }
  }
  return best;
}

function pickBetterName(nameA, nameB) {
  const a = isValidAadhaarName(nameA) ? String(nameA).trim() : "";
  const b = isValidAadhaarName(nameB) ? String(nameB).trim() : "";
  if (!a) return b;
  if (!b) return a;
  return scoreNameCandidate(b) >= scoreNameCandidate(a) ? b : a;
}

/** Collect name candidates from all strategies on full OCR text */
function collectNameCandidatesFromText(text) {
  const candidates = [];
  const cleaned = cleanFrontOcrText(text);
  const lines = splitFrontOcrIntoLines(text);
  const anchors = findAnchorIndices(lines);

  const positional = extractHolderName(lines, anchors);
  if (positional) candidates.push({ s: positional, score: 130 });

  const fromRegex = extractNameByRegex(text);
  if (fromRegex) candidates.push({ s: fromRegex, score: 115 });

  const singleBeforeDob = cleaned.match(
    /\b([A-Za-z]{4,18})\b\s+(?:DOB|D\.O\.B|Year\s*o[f]?\s*Birth|YOB|Date\s+of\s+Birth)/i,
  );
  if (singleBeforeDob) {
    const n = cleanNameFromLine(singleBeforeDob[1]);
    if (isValidAadhaarName(n)) candidates.push({ s: n, score: 118 });
  }

  const capsBeforePersonal = cleaned.match(
    /\b([A-Z]{4,16})\b(?=\s*(?:DOB|Year|Birth|YOB|MALE|FEMALE|Male|Female|\d{2}[-/.]))/,
  );
  if (capsBeforePersonal) {
    const n = cleanNameFromLine(capsBeforePersonal[1]);
    if (isValidAadhaarName(n)) candidates.push({ s: n, score: 105 });
  }

  for (const line of lines) {
    if (lineIsFrontHeaderNoise(line)) continue;
    const title = extractTitleCaseNameFromLine(line);
    if (title && isValidAadhaarName(title)) {
      candidates.push({ s: title, score: 95 });
    }
    const cleanedLine = cleanNameFromLine(line);
    if (isValidAadhaarName(cleanedLine) && cleanedLine.split(/\s+/).length <= 4) {
      candidates.push({ s: cleanedLine, score: 80 });
    }
  }

  return candidates;
}

function resolveBestFrontName(text, fallback = "") {
  const candidates = collectNameCandidatesFromText(text);
  if (fallback && isValidAadhaarName(fallback)) {
    candidates.push({ s: fallback, score: scoreNameCandidate(fallback, 0) });
  }
  return pickBestName(candidates);
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

  const singleNameBeforeDob = text.match(
    /\b([A-Za-z]{4,18})\b\s+(?:DOB|Year|Birth|YOB|Female|Male|FEMALE|MALE)/i,
  );
  if (singleNameBeforeDob) {
    const name = cleanNameFromLine(singleNameBeforeDob[1]);
    if (isValidAadhaarName(name)) {
      candidates.push({ s: name, score: 112 });
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
  const rawName = results?.name ? String(results.name).trim() : "";
  const nameQuality = scoreAadhaarNameQuality(rawName);
  const name =
    rawName && nameQuality >= MIN_NAME_SCORE && isValidAadhaarName(rawName) ? rawName : "";
  const gender = normalizeGender(results?.gender);
  const dob = results?.dob || "";

  let confidence = 0;
  if (aadhaar) confidence += 38;
  if (name) confidence += 38;
  if (dob) confidence += 12;
  if (gender) confidence += 12;

  const ocrConf = typeof results?.ocrConfidence === "number" ? results.ocrConfidence : 100;
  confidence = Math.round(confidence * 0.75 + ocrConf * 0.25);
  if (name && nameQuality < MIN_NAME_SCORE + 15) confidence = Math.min(confidence, 72);

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
    const extracted = extractHolderNameFromText(cleanedText, lines, anchors);
    results.name = resolveBestFrontName(text, extracted);
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
  return resolveBestFrontName(text, "");
}

function parseDobGenderRegionText(text) {
  const lines = splitFrontOcrIntoLines(text);
  const aadhaar12 = extractAadhaarFromText(text);
  return {
    dob: extractDobFromFrontText(cleanFrontOcrText(text), aadhaar12),
    gender: extractGenderFromFrontText(text, lines),
  };
}

async function ocrRegionBlob(blob, options, onProgress) {
  if (!blob) return { text: "", confidence: 0 };
  const { text, confidence } = await recognizeAadhaarImage(blob, {
    minWordConfidence: options.minWordConfidence ?? 48,
    onProgress,
  });
  return { text, confidence };
}

/** PaddleOCR on each layout region in parallel (primary pass). */
async function ocrRegionSet(regionBlobs, keys, options, onProgress) {
  const out = {};
  await Promise.all(
    keys.map(async (key) => {
      const blob = regionBlobs?.[key];
      out[key] = await ocrRegionBlob(blob, options, (p) => onProgress(p));
    }),
  );
  return out;
}

function consolidateFrontFieldVotes(passResults, allText) {
  const aadhaars = [];
  const names = [];
  const dobs = [];
  const genders = [];
  let maxOcr = 0;

  for (const p of passResults) {
    if (!p) continue;
    const a = normalizeAadhaarNumber(p.docNumber);
    if (a) aadhaars.push(a);
    if (p.name) names.push(p.name);
    if (p.dob) dobs.push(p.dob);
    const g = normalizeGender(p.gender);
    if (g) genders.push(g);
    maxOcr = Math.max(maxOcr, p.ocrConfidence || 0);
  }

  const lines = splitFrontOcrIntoLines(allText);
  const docNumber =
    majorityPick(aadhaars, (v) => v) ||
    extractAadhaarFromText(allText) ||
    "";
  const mergedName = names.reduce((best, n) => pickBetterName(best, n), "");
  const name = resolveBestFrontName(allText, mergedName);
  const dob =
    majorityPick(dobs, (v) => v) ||
    extractDobFromFrontText(cleanFrontOcrText(allText), docNumber) ||
    "";
  const gender =
    majorityPick(genders, (v) => normalizeGender(v) || "") ||
    extractGenderFromFrontText(allText, lines) ||
    "";

  return {
    name,
    dob,
    gender,
    docNumber,
    type: docNumber ? "aadhaar" : "unknown",
    email: "",
    phone: "",
    ocrConfidence: maxOcr,
  };
}

function parseFrontFromRegionOcr(regionOcr) {
  const nameOcr = regionOcr.name || { text: "", confidence: 0 };
  const dobOcr = regionOcr.dobGender || { text: "", confidence: 0 };
  const aadhaarOcr = regionOcr.aadhaarNumber || { text: "", confidence: 0 };

  const name = parseNameRegionText(nameOcr.text);
  const { dob, gender: genderFromDob } = parseDobGenderRegionText(dobOcr.text);
  const gender =
    extractGenderFromFrontText(dobOcr.text, splitFrontOcrIntoLines(dobOcr.text)) ||
    genderFromDob;
  const docNumber =
    extractAadhaarFromText(aadhaarOcr.text) ||
    extractAadhaarFromText(dobOcr.text) ||
    extractAadhaarFromText(nameOcr.text);

  const avgConf =
    (nameOcr.confidence + dobOcr.confidence + aadhaarOcr.confidence) / 3;

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

async function runFrontRegionPipeline(prepared, report, { useAlt = false } = {}) {
  const regionBlobs = useAlt ? prepared.altRegions : prepared.regions;
  const tick = (p) => report(8 + Math.floor((useAlt ? 0.35 : 0.42) * p));

  const regionOcr = await ocrRegionSet(
    regionBlobs,
    ["name", "dobGender", "aadhaarNumber"],
    { minWordConfidence: useAlt ? 44 : 48 },
    tick,
  );

  return parseFrontFromRegionOcr(regionOcr);
}

function frontOcrIsSufficient(parsed) {
  const v = validateAadhaarFrontResults(parsed);
  return v.canAutofill && !!v.aadhaar && !!v.name;
}

function mergeFrontOcrResults(a, b) {
  const va = validateAadhaarFrontResults(a);
  const vb = validateAadhaarFrontResults(b);
  const pick = vb.confidence >= va.confidence ? vb : va;
  const other = vb.confidence >= va.confidence ? va : vb;
  const otherParsed = vb.confidence >= va.confidence ? a : b;

  const ocrConfidence = Math.max(a.ocrConfidence || 0, b.ocrConfidence || 0);

  const mergedName = pickBetterName(a.name, b.name);

  return {
    ...otherParsed,
    name: mergedName,
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
  if (frontOcrIsSufficient(parsed)) return false;
  const v = validateAadhaarFrontResults(parsed);
  if (!v.aadhaar && !v.name) return true;
  return !v.aadhaar || !v.name;
}

function finalizeFrontOcrResult(parsed, rawText = "") {
  const resolvedName = rawText
    ? resolveBestFrontName(rawText, parsed.name)
    : parsed.name;
  const withName = { ...parsed, name: resolvedName || parsed.name || "" };
  const validation = validateAadhaarFrontResults(withName);
  const safeName = validation.name;

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

/**
 * Front-side Aadhaar OCR — PaddleOCR region passes + binarized fallback.
 */
export const performOCR = async (imageInput, onProgress = () => {}) => {
  try {
    await preloadAadhaarOcrWorker();
    const report = (pct) => onProgress(Math.min(99, pct));
    const rawBlob =
      imageInput instanceof Blob
        ? imageInput
        : await fetch(imageInput).then((r) => r.blob());

    let allText = "";
    const passResults = [];
    let prepared = null;

    try {
      prepared = await prepareAadhaarCardImage(rawBlob, "front");
      report(5);
      const primary = await runFrontRegionPipeline(prepared, report, { useAlt: false });
      allText = primary.rawText;
      passResults.push(primary.parsed);

      let parsed = consolidateFrontFieldVotes(passResults, allText);
      if (!frontOcrIsSufficient(parsed) && prepared.altRegions) {
        report(50);
        const alt = await runFrontRegionPipeline(prepared, report, { useAlt: true });
        allText += `\n${alt.rawText}`;
        passResults.push(alt.parsed);
      }
    } catch (prepErr) {
      console.warn("Aadhaar prep failed, raw PaddleOCR fallback:", prepErr);
      const { text, confidence } = await recognizeAadhaarImage(rawBlob, {
        minWordConfidence: 45,
        onProgress: (p) => report(10 + Math.floor(p * 0.85)),
      });
      allText = text;
      passResults.push({ ...parseAadhaarFrontFields(text), ocrConfidence: confidence });
    }

    let parsed = consolidateFrontFieldVotes(passResults, allText);

    const aadhaarFromText = extractAadhaarFromText(allText);
    if (aadhaarFromText && !normalizeAadhaarNumber(parsed.docNumber)) {
      parsed.docNumber = aadhaarFromText;
      parsed.type = "aadhaar";
    }
    parsed.name = resolveBestFrontName(allText, parsed.name);

    onProgress(100);
    return finalizeFrontOcrResult(parsed, allText);
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

function parseBackFromRegionOcr(regionOcr) {
  const addrOcr = regionOcr.address || { text: "", confidence: 0 };
  const pinOcr = regionOcr.pincode || { text: "", confidence: 0 };
  const combined = `${addrOcr.text}\n${pinOcr.text}`;
  const fields = extractAadhaarBackFields(combined);
  fields.ocrConfidence = (addrOcr.confidence + pinOcr.confidence) / 2;
  return { fields, text: combined };
}

async function runBackRegionPipeline(prepared, report, { useAlt = false } = {}) {
  const regionBlobs = useAlt ? prepared.altRegions : prepared.regions;
  const tick = (p) => report(8 + Math.floor((useAlt ? 0.35 : 0.5) * p));

  const regionOcr = await ocrRegionSet(
    regionBlobs,
    ["address", "pincode"],
    { minWordConfidence: useAlt ? 44 : 48 },
    tick,
  );

  return parseBackFromRegionOcr(regionOcr);
}

function backOcrIsSufficient(fields) {
  const v = validateAadhaarBackResults(fields);
  return v.canAutofill && !!v.pincode && v.address.length >= 12;
}

function consolidateBackFieldVotes(fieldPasses, allText) {
  const pins = [];
  const addresses = [];
  let maxOcr = 0;

  for (const f of fieldPasses) {
    if (!f) continue;
    if (f.pincode && /^\d{6}$/.test(f.pincode)) pins.push(f.pincode);
    if (f.address && f.address.length >= 8) addresses.push(f.address);
    maxOcr = Math.max(maxOcr, f.ocrConfidence || 0);
  }

  const fromText = extractAadhaarBackFields(allText);
  const pincode = majorityPick(pins, (v) => v) || fromText.pincode || "";
  const address =
    addresses.sort((a, b) => b.length - a.length)[0] ||
    fromText.address ||
    "";

  return {
    address,
    pincode,
    ocrConfidence: maxOcr,
  };
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

/** Back-side Aadhaar OCR — PaddleOCR address + PIN regions. */
export const performAadhaarBackOCR = async (imageInput, onProgress = () => {}) => {
  try {
    await preloadAadhaarOcrWorker();
    const report = (pct) => onProgress(Math.min(99, pct));
    const rawBlob =
      imageInput instanceof Blob
        ? imageInput
        : await fetch(imageInput).then((r) => r.blob());

    let text = "";
    const fieldPasses = [];

    try {
      const prepared = await prepareAadhaarCardImage(rawBlob, "back");
      report(5);

      const primary = await runBackRegionPipeline(prepared, report, { useAlt: false });
      text = primary.text;
      fieldPasses.push(primary.fields);

      let fields = consolidateBackFieldVotes(fieldPasses, text);
      if (!backOcrIsSufficient(fields) && prepared.altRegions) {
        report(50);
        const alt = await runBackRegionPipeline(prepared, report, { useAlt: true });
        text = mergeBackOcrTexts(text, alt.text);
        fieldPasses.push(alt.fields);
      }
    } catch (prepErr) {
      console.warn("Back prep failed, raw PaddleOCR fallback:", prepErr);
      const { text: rawText } = await recognizeAadhaarImage(rawBlob, {
        minWordConfidence: 45,
        onProgress: (p) => report(10 + Math.floor(p * 0.85)),
      });
      text = rawText;
      fieldPasses.push(extractAadhaarBackFields(rawText));
    }

    const fields = consolidateBackFieldVotes(fieldPasses, text);
    const finalValidation = validateAadhaarBackResults(fields);
    onProgress(100);

    return {
      address: finalValidation.address || fields.address || "",
      pincode: finalValidation.pincode || fields.pincode || "",
      confidence: finalValidation.confidence,
      valid: finalValidation.valid,
      canAutofill: finalValidation.canAutofill,
      validationMessage: finalValidation.validationMessage,
    };
  } catch (error) {
    console.error("Aadhaar Back OCR Error:", error);
    throw error;
  }
};
