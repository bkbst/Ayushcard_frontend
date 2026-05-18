import React, { useState, useRef, useEffect } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  User,
  Plus,
  X as CloseIcon,
  Calendar,
  Image as ImageIcon,
  FileText,
  Check,
  ScanLine,
  Printer,
  Loader2,
  Camera,
  RefreshCw,
  Banknote,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import apiService from "../../api/service";
import {
  performOCR,
  performAadhaarBackOCR,
  AADHAAR_OCR_LOW_CONFIDENCE_MSG,
  isValidAadhaarName,
} from "../../utils/ocr";
import { load } from "@cashfreepayments/cashfree-js";
import AyushCardPreview from "../admin/AyushCardPreview";
import QRCode from "react-qr-code";
import { useAttendance } from "../../context/AttendanceContext";

/** Fixed ₹160 for 1–4 people (head + members); each additional person +₹40. */
const AYUSH_CARD_BASE_PACKAGE_RUPEES = 160;
const AYUSH_CARD_INCLUDED_MEMBERS = 4;
const AYUSH_CARD_EXTRA_MEMBER_RUPEES = 40;

function computeAyushCardFeeRupees(totalMembersIncludingHead) {
  const n = Math.max(1, Number(totalMembersIncludingHead) || 1);
  if (n <= AYUSH_CARD_INCLUDED_MEMBERS) return AYUSH_CARD_BASE_PACKAGE_RUPEES;
  return (
    AYUSH_CARD_BASE_PACKAGE_RUPEES +
    (n - AYUSH_CARD_INCLUDED_MEMBERS) * AYUSH_CARD_EXTRA_MEMBER_RUPEES
  );
}

/** Same splitting as submit payload: first / middle / last from full name string */
function splitFamilyHeadNameParts(fullName) {
  const nameParts = String(fullName || "")
    .trim()
    .split(" ")
    .filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
  const middleName =
    nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "";
  return { firstName, middleName, lastName };
}

const HEAD_DUPLICATE_INITIAL = {
  loading: false,
  exists: null,
  cardId: null,
  error: null,
};

/** Pull created card record from POST response: `{ success, data }` or flat body */
function extractCreatedCardRecord(res) {
  if (res == null || typeof res !== "object") return null;
  if (
    res.data != null &&
    typeof res.data === "object" &&
    !Array.isArray(res.data) &&
    (res.data.applicationId != null ||
      res.data._id != null ||
      res.data.contact != null)
  ) {
    return res.data;
  }
  if (res.applicationId != null || res._id != null) return res;
  return null;
}

function fullNameFromCardRecord(rec) {
  if (!rec) return "";
  const parts = [rec.firstName, rec.middleName, rec.lastName].filter(
    (p) => p != null && String(p).trim() !== "",
  );
  return parts.join(" ").trim();
}

function thermalMemberLabel(m) {
  if (!m) return "—";
  if (m.fullName) return m.fullName;
  if (m.name) return m.name;
  return "—";
}

function thermalMemberDocId(m) {
  const raw = m?.documentId ?? m?.docId ?? "";
  return String(raw);
}

const generateApplicationId = () =>
  `AC-${Math.floor(1000000 + Math.random() * 9000000)}`;

/**
 * Shared Ayush card application flow (same UI as public modal).
 * @param {'modal'|'page'} variant
 * @param {boolean} skipPayment — staff flow: no Cashfree step; submit from Review
 * @param {function} onStaffSubmit — optional override `(payload) => Promise` for POST /api/cards
 * @param {function} onBack — page variant: header back (e.g. navigate(-1))
 * @param {boolean} staffPaymentFlow — admin/employee: payment step with offline (camera) + online (Cashfree, auth APIs)
 */
const AyushCardApplicationForm = ({
  variant = "modal",
  isOpen = true,
  onClose = () => {},
  skipPayment = false,
  staffPaymentFlow = false,
  onStaffSubmit,
  onBack,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [applicationId, setApplicationId] = useState(() =>
    generateApplicationId(),
  );
  /** Server `data` from last successful card create — drives receipt / print */
  const [submissionReceipt, setSubmissionReceipt] = useState(null);
  const { toastWarn, toastError, toastSuccess } = useToast();
  const { todayCampId, todayCampName } = useAttendance();
  const [submitting, setSubmitting] = useState(false);
  // Step 1 State
  const [docFront, setDocFront] = useState(null);
  const [docBack, setDocBack] = useState(null);
  /** File input for OCR (1st document) — camera gallery + review replace */
  const ocrFileInputRef = useRef(null);
  const backOcrFileInputRef = useRef(null);
  const docBackInputRef = useRef(null);
  const docBackCameraInputRef = useRef(null);
  const headImageInputRef = useRef(null);
  const headCameraVideoRef = useRef(null);
  const headCameraCanvasRef = useRef(null);
  const headCameraStreamRef = useRef(null);
  const paymentInputRef = useRef(null);

  const todayForDob = new Date();
  const maxDobForAdult = `${todayForDob.getFullYear() - 18}-${String(todayForDob.getMonth() + 1).padStart(2, '0')}-${String(todayForDob.getDate()).padStart(2, '0')}`;

  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Payment States
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [onlinePaymentLoading, setOnlinePaymentLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [txnId, setTxnId] = useState("");
  const [saveError, setSaveError] = useState("");
  /** Admin/employee: null | 'cash' | 'online' */
  const [staffPaymentMode, setStaffPaymentMode] = useState(null);
  const [staffCashReceiptImage, setStaffCashReceiptImage] = useState(null);
  const staffCashVideoRef = useRef(null);
  const staffCashCanvasRef = useRef(null);
  const staffCashStreamRef = useRef(null);
  const [staffCashCameraActive, setStaffCashCameraActive] = useState(false);
  const [staffCashCameraLoading, setStaffCashCameraLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [backOcrLoading, setBackOcrLoading] = useState(false);
  const [backOcrProgress, setBackOcrProgress] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const docBackVideoRef = useRef(null);
  const docBackCanvasRef = useRef(null);
  const docBackStreamRef = useRef(null);
  const [docBackCameraActive, setDocBackCameraActive] = useState(false);
  const [docBackCameraLoading, setDocBackCameraLoading] = useState(false);

  // Helper: compress and binarize a base64 image to remove noise for improved OCR
  const compressBase64Image = (
    base64Src,
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8,
    applyOcrFilter = false,
  ) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          if (applyOcrFilter) {
            try {
              const imageData = ctx.getImageData(0, 0, width, height);
              const data = imageData.data;
              
              // Find average brightness to use as adaptive threshold baseline
              let totalLuma = 0;
              for (let i = 0; i < data.length; i += 4) {
                totalLuma += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              }
              const avgLuma = totalLuma / (width * height);
              const threshold = Math.max(100, Math.min(160, avgLuma * 0.95)); 

              // Binary Extraction (Binarization): everything below threshold becomes black, else white
              for (let i = 0; i < data.length; i += 4) {
                const r = data[i],
                  g = data[i + 1],
                  b = data[i + 2];
                // Luma formula for grayscale
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // True binary conversion
                const val = gray < threshold ? 0 : 255;

                data[i] = val;     // R
                data[i + 1] = val; // G
                data[i + 2] = val; // B
              }
              ctx.putImageData(imageData, 0, 0);
            } catch (err) {
              console.warn(
                "Binary OCR Filter failed, continuing with original colors",
                err,
              );
            }
          }

          const outputBase64 = canvas.toDataURL("image/jpeg", quality);
          resolve(outputBase64);
        };
        img.onerror = (e) => reject(e);
        img.src = base64Src;
      } catch (e) {
        reject(e);
      }
    });
  };

  // Step 2 State (Family Head)
  const [headImage, setHeadImage] = useState(null);
  const [headCameraActive, setHeadCameraActive] = useState(false);
  const [headCameraPermissionDenied, setHeadCameraPermissionDenied] =
    useState(false);
  const [familyHead, setFamilyHead] = useState({
    fullName: "",
    dob: "",
    gender: "",
    contactNumber: "",
    alternateContact: "",
    religion: "",
    aadhaarNumber: "",
    emailAddress: "",
    relation: "",
    relatedPerson: "",
    address: "",
    pincode: "",
  });

  const [headPhoneDuplicate, setHeadPhoneDuplicate] = useState(
    HEAD_DUPLICATE_INITIAL,
  );
  const [headAadhaarDuplicate, setHeadAadhaarDuplicate] = useState(
    HEAD_DUPLICATE_INITIAL,
  );
  const [headNameDuplicate, setHeadNameDuplicate] = useState(
    HEAD_DUPLICATE_INITIAL,
  );

  const [members, setMembers] = useState([]);
  const [activeMemberTab, setActiveMemberTab] = useState(0); // 0 is head, 1+ is members

  // Member scanning state
  const [memberScanningIndex, setMemberScanningIndex] = useState(null);
  const [memberScanProgress, setMemberScanProgress] = useState(0);
  const [memberOcrLoading, setMemberOcrLoading] = useState(false);
  const memberVideoRef = useRef(null);
  const memberCanvasRef = useRef(null);
  const memberStreamRef = useRef(null);
  const [memberCameraActive, setMemberCameraActive] = useState(false);
  const memberInputRef = useRef(null);
  /** Step 2: scroll to bottom “Add Member” block after Continue from step 1 */
  const addMemberScrollAnchorRef = useRef(null);

  const successStep = skipPayment ? 4 : 5;
  const totalMembersCount = 1 + members.length;
  const estimatedFee = computeAyushCardFeeRupees(totalMembersCount);
  const extraMembersBeyondIncluded = Math.max(
    0,
    totalMembersCount - AYUSH_CARD_INCLUDED_MEMBERS,
  );
  const stepperSteps = skipPayment
    ? [
        { num: 1, label: "Add Family Head" },
        { num: 2, label: "Add Members" },
        { num: 3, label: "Review" },
      ]
    : [
        { num: 1, label: "Add Family Head" },
        { num: 2, label: "Add Members" },
        { num: 3, label: "Review" },
        { num: 4, label: "Payment" },
      ];
  const stepperProgressPct =
    stepperSteps.length > 1
      ? ((Math.min(currentStep, stepperSteps.length) - 1) /
          (stepperSteps.length - 1)) *
        70
      : 0;
  const footerStepMax = skipPayment ? 3 : 4;

  const stopStaffCashCamera = () => {
    if (staffCashStreamRef.current) {
      staffCashStreamRef.current.getTracks().forEach((t) => t.stop());
      staffCashStreamRef.current = null;
    }
    if (staffCashVideoRef.current) staffCashVideoRef.current.srcObject = null;
    setStaffCashCameraActive(false);
    setStaffCashCameraLoading(false);
  };

  const handleRawBtPrint = () => {
    const receiptEl = document.getElementById("thermal-receipt-content");
    if (!receiptEl) {
      toastWarn("Receipt is not ready yet. Please try again.");
      return;
    }

    // Simplify the HTML for better thermal printer compatibility
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: sans-serif; color: black; background: white; margin: 0; padding: 0; }
            .public-thermal-receipt { width: 58mm; box-sizing: border-box; padding: 2mm; font-size: 6px; line-height: 1.2; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .font-black { font-weight: 900; }
            .font-semibold { font-weight: 600; }
            .uppercase { text-transform: uppercase; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .shrink-0 { flex-shrink: 0; }
            .text-right { text-align: right; }
            .break-all { word-break: break-all; }
            .break-words { word-break: break-word; }
            .tracking-tight { letter-spacing: -0.025em; }
            .tracking-wide { letter-spacing: 0.025em; }
            .leading-none { line-height: 1; }
            .mt-1 { margin-top: 4px; }
            .mb-2 { margin-bottom: 8px; }
            .pb-2 { padding-bottom: 8px; }
            .border-b { border-bottom: 1px solid black; }
            .border-dashed { border-style: dashed; }
            .border-dotted { border-style: dotted; }
            .border-gray-400 { border-color: #94A3B8; }
            .border-gray-300 { border-color: #CBD5E1; }
            .space-y-1 > * + * { margin-top: 4px; }
            .space-y-0\\.5 > * + * { margin-top: 2px; }
            /* Tailwind specific classes used in renderThermalReceipt */
            .text-\\[15px\\] { font-size: 0px; }
            .text-\\[10px\\] { font-size: 6px; }
            .text-\\[9px\\] { font-size: 6px; }
            .text-\\[8px\\] { font-size: 6px; }
            .text-\\[7px\\] { font-size: 6px; }
            .m-0 { margin: 0; }
            .p-0 { padding: 0; }
            .list-none { list-style-type: none; }
            .thermal-logo { width: 40px; height: 40px; margin: 0 auto 8px; display: block; object-fit: contain; }
          </style>
        </head>
        <body>
          <div class="public-thermal-receipt">
            ${receiptEl.innerHTML.replace('/logo1.svg', window.location.origin + '/logo1.svg')}
          </div>
        </body>
      </html>
    `;

    // Convert to UTF-8 base64
    const b64 = btoa(unescape(encodeURIComponent(htmlContent)));

    const playStoreUrl = "https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter";
    
    // Improved Intent structure for RawBT on Android Chrome
    // S.text is the data, S.ru.a402d.rawbtprinter.EXTRA_B64 tells it the text is base64 encoded
    const rawbtIntent = `intent:#Intent;action=ru.a402d.rawbtprinter.action.PRINT;category=android.intent.category.DEFAULT;type=text/html;S.text=${b64};S.ru.a402d.rawbtprinter.EXTRA_B64=true;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end;`;

    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);

    if (!isAndroid) {
      toastWarn("RawBT printing works on Android phones. Use normal Print on desktop.");
      return;
    }

    // Execute the intent
    window.location.href = rawbtIntent;

    // Show actionable hint for in-app browsers
    const isLikelyInAppBrowser = /(FBAN|FBAV|Instagram|Line|wv\)|Telegram|MiuiBrowser|EdgA)/i.test(userAgent);
    if (isLikelyInAppBrowser) {
      setTimeout(() => {
        toastWarn("If printing doesn't start, open this page in Chrome browser for best compatibility.");
      }, 1500);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setApplicationId(generateApplicationId());
    setSubmissionReceipt(null);
    setDocFront(null);
    setDocBack(null);
    setHeadImage(null);
    setPaymentScreenshot(null);
    setIsEditingReview(false);
    setOnlinePaymentLoading(false);
    setVerifyLoading(false);
    setOrderId(null);
    setTxnId("");
    setSaveError("");
    setPaymentMethod("online");
    setStaffPaymentMode(null);
    setStaffCashReceiptImage(null);
    stopStaffCashCamera();
    stopDocBackCamera();
    setFamilyHead({
      fullName: "",
      dob: "",
      gender: "",
      contactNumber: "",
      alternateContact: "",
      religion: "",
      aadhaarNumber: "",
      emailAddress: "",
      relation: "",
      relatedPerson: "",
      address: "",
      pincode: "",
    });
    setMembers([]);
    setActiveMemberTab(0);
  };

  const startStaffCashCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toastError("Camera is not supported in this browser.");
      return;
    }
    stopStaffCashCamera();
    setStaffCashCameraLoading(true);
    setSaveError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      staffCashStreamRef.current = stream;
      setStaffCashCameraActive(true);
    } catch (err) {
      console.error("Staff cash camera:", err);
      toastWarn(
        err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Camera permission denied. Allow camera access to capture the receipt."
          : "Could not open camera. Try again or use online payment.",
      );
    } finally {
      setStaffCashCameraLoading(false);
    }
  };

  const captureStaffCashReceipt = async () => {
    if (!staffCashVideoRef.current || !staffCashCanvasRef.current) return;
    const video = staffCashVideoRef.current;
    const canvas = staffCashCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const raw = canvas.toDataURL("image/jpeg", 0.85);
    stopStaffCashCamera();
    try {
      const compressed = await compressBase64Image(raw, 1200, 1200, 0.75);
      setStaffCashReceiptImage(compressed);
    } catch {
      setStaffCashReceiptImage(raw);
    }
    toastSuccess("Cash receipt photo saved.");
  };

  const handleStaffChooseOfflineCash = async () => {
    setStaffPaymentMode("cash");
    setOrderId(null);
    setTxnId("");
    setStaffCashReceiptImage(null);
    await startStaffCashCamera();
  };

  const handleStaffChooseOnline = () => {
    stopStaffCashCamera();
    setStaffPaymentMode("online");
    setStaffCashReceiptImage(null);
  };

  useEffect(() => {
    if (
      staffCashCameraActive &&
      staffCashVideoRef.current &&
      staffCashStreamRef.current
    ) {
      staffCashVideoRef.current.srcObject = staffCashStreamRef.current;
      staffCashVideoRef.current.play().catch(() => {});
    }
  }, [staffCashCameraActive]);

  useEffect(() => {
    if (variant === "modal" && isOpen) {
      resetForm();
    }
  }, [isOpen, variant]);

  useEffect(() => {
    if (variant === "page") {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (headCameraStreamRef.current) {
        headCameraStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }
      if (staffCashStreamRef.current) {
        staffCashStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (docBackStreamRef.current) {
        docBackStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || currentStep !== 1) {
      stopCamera();
      stopHeadCamera();
      stopDocBackCamera();
    }
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (currentStep !== 2 || !addMemberScrollAnchorRef.current) return;
    const t = window.setTimeout(() => {
      addMemberScrollAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 150);
    return () => window.clearTimeout(t);
  }, [currentStep]);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  useEffect(() => {
    if (
      docBackCameraActive &&
      docBackVideoRef.current &&
      docBackStreamRef.current
    ) {
      docBackVideoRef.current.srcObject = docBackStreamRef.current;
    }
  }, [docBackCameraActive]);

  useEffect(() => {
    if (
      headCameraActive &&
      headCameraVideoRef.current &&
      headCameraStreamRef.current
    ) {
      headCameraVideoRef.current.srcObject = headCameraStreamRef.current;
    }
  }, [headCameraActive]);

  useEffect(() => {
    if (
      memberCameraActive &&
      memberVideoRef.current &&
      memberStreamRef.current
    ) {
      memberVideoRef.current.srcObject = memberStreamRef.current;
    }
  }, [memberCameraActive]);

  useEffect(() => {
    return () => {
      if (memberStreamRef.current) {
        memberStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setOcrLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      toastWarn("Could not access camera. Please use Gallery Upload.");
    } finally {
      setOcrLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setOcrLoading(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    stopCamera();

    try {
      // 1. Try OCR directly on the binary blob for best accuracy
      let results = await performOCR(blob, (p) => setOcrProgress(p));

      if (!results?.canAutofill) {
        try {
          const filteredBase64 = await compressBase64Image(
            base64,
            1400,
            1400,
            0.9,
            true,
          );
          const filteredBlob = await fetch(filteredBase64).then((res) => res.blob());
          const filteredResults = await performOCR(filteredBlob, (p) => setOcrProgress(p));
          results = pickBetterFrontOcr(results, filteredResults);
        } catch (e) {}
      }

      if (!results?.canAutofill) {
        try {
          const croppedBase64 = await preprocessMemberImageForOCR(base64);
          const croppedBlob = await fetch(croppedBase64).then((res) => res.blob());
          const croppedResults = await performOCR(croppedBlob, (p) => setOcrProgress(p));
          results = pickBetterFrontOcr(results, croppedResults);
        } catch (e) {}
      }

      let storageBase64 = base64;
      try {
        storageBase64 = await compressBase64Image(base64, 1200, 1200, 0.7);
      } catch (e) {}

      setDocFront({
        name: "captured_id.jpg",
        size: "Live Capture",
        url: storageBase64,
        base64: storageBase64,
      });

      if (results && applyFrontOcrToFamilyHead(results)) {
        if (results.valid) {
          toastSuccess("Aadhaar details extracted successfully.");
        }
      }
    } catch (err) {
      console.error("Capture OCR Error:", err);
      toastWarn("Could not extract details. Please enter manually.");
      setDocFront({
        name: "captured_id.jpg",
        size: "Live Capture",
        url: base64,
        base64: base64,
      });
    } finally {
      setOcrLoading(false);
      setOcrProgress(0);
    }
  };

  const startDocBackCamera = async () => {
    try {
      setDocBackCameraLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      docBackStreamRef.current = stream;
      setDocBackCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      toastWarn("Could not access camera. Please use Gallery Upload.");
    } finally {
      setDocBackCameraLoading(false);
    }
  };

  const stopDocBackCamera = () => {
    if (docBackStreamRef.current) {
      docBackStreamRef.current.getTracks().forEach((track) => track.stop());
      docBackStreamRef.current = null;
    }
    if (docBackVideoRef.current) docBackVideoRef.current.srcObject = null;
    setDocBackCameraActive(false);
  };

  const applyBackOcrResults = (results) => {
    if (results?.canAutofill === false) {
      toastWarn(results?.validationMessage || AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }
    if (!results?.address && !results?.pincode) {
      toastWarn(AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }
    setFamilyHead((prev) => ({
      ...prev,
      ...(results.address ? { address: results.address } : {}),
      ...(results.pincode ? { pincode: results.pincode } : {}),
    }));
    if (!results?.valid) {
      toastWarn(
        "Some address details could not be read. Please verify the form or rescan.",
      );
    }
    return true;
  };

  const processBackOcrFromImage = async (blob, base64, fileMeta = null) => {
    setBackOcrLoading(true);
    setBackOcrProgress(0);
    try {
      let results = await performAadhaarBackOCR(blob, (p) => setBackOcrProgress(p));

      if (!results?.address && !results?.pincode) {
        try {
          const filteredBase64 = await compressBase64Image(
            base64,
            1400,
            1400,
            0.9,
            true,
          );
          const filteredBlob = await fetch(filteredBase64).then((res) => res.blob());
          const fallback = await performAadhaarBackOCR(filteredBlob, (p) =>
            setBackOcrProgress(p),
          );
          if (fallback) {
            results = {
              address: fallback.address || results?.address || "",
              pincode: fallback.pincode || results?.pincode || "",
            };
          }
        } catch (e) {
          /* filtered pass optional */
        }
      }

      const filled = applyBackOcrResults(results);

      let storageBase64 = base64;
      try {
        storageBase64 = await compressBase64Image(base64, 1200, 1200, 0.7);
      } catch (e) {
        /* keep original */
      }

      const fileData = fileMeta || {
        name: "captured_back.jpg",
        size: "Live Capture",
      };

      setDocBack({
        ...fileData,
        url: storageBase64,
        base64: storageBase64,
      });

      if (filled && results?.valid) {
        toastSuccess("Address and pincode extracted from back side.");
      } else if (filled) {
        toastWarn(
          "Address partially filled — please verify pincode and lines.",
        );
      } else {
        toastWarn(
          results?.validationMessage ||
            "Back image saved. Could not read address — please rescan or enter manually.",
        );
      }
    } catch (err) {
      console.error("Back OCR Error:", err);
      toastWarn("Could not scan back side. Image saved — enter address manually.");
      setDocBack({
        name: fileMeta?.name || "captured_back.jpg",
        size: fileMeta?.size || "Live Capture",
        url: base64,
        base64: base64,
      });
    } finally {
      setBackOcrLoading(false);
      setBackOcrProgress(0);
    }
  };

  const captureDocBackPhoto = async () => {
    if (!docBackVideoRef.current || !docBackCanvasRef.current) return;

    const video = docBackVideoRef.current;
    const canvas = docBackCanvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    stopDocBackCamera();

    await processBackOcrFromImage(blob, base64);
  };

  const handleBackScanImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toastWarn("Image size should be less than 5MB");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      toastWarn("Scanning back side… please wait.");
      await processBackOcrFromImage(file, base64, {
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      });
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const parseAadhaarQR = (text) => {
    try {
      const isXML =
        text.includes("<?xml") || text.includes("PrintLetterBarcodeData");
      if (isXML) {
        const uidMatch = text.match(/uid="([^"]+)"/i);
        const nameMatch = text.match(/name="([^"]+)"/i);
        const genderMatch = text.match(/gender="([^"]+)"/i);
        const dobMatch = text.match(/dob="([^"]+)"/i);
        const yobMatch = text.match(/yob="([^"]+)"/i);

        let dobStr = dobMatch
          ? dobMatch[1]
          : yobMatch
            ? `01/01/${yobMatch[1]}`
            : "";
        if (dobStr && dobStr.includes("/")) {
          const parts = dobStr.split("/");
          if (parts.length === 3)
            dobStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (
          dobStr &&
          dobStr.includes("-") &&
          dobStr.split("-")[0].length !== 4
        ) {
          const parts = dobStr.split("-");
          if (parts.length === 3)
            dobStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        return {
          uid: uidMatch ? uidMatch[1] : "",
          name: nameMatch ? nameMatch[1] : "",
          gender: genderMatch
            ? genderMatch[1] === "M"
              ? "Male"
              : genderMatch[1] === "F"
                ? "Female"
                : "Other"
            : "",
          dob: dobStr,
        };
      }
    } catch (e) {
      console.error("Aadhaar parse error", e);
    }
    return null;
  };

  const handleScanImage = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toastWarn("Image size should be less than 5MB");
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        setOcrLoading(true);
        setOcrProgress(0);
        toastWarn("Processing image... please wait.");

        try {
          // 1. Try OCR directly on the binary file
          let results = await performOCR(file, (p) => setOcrProgress(p));

          if (!results?.canAutofill) {
            try {
              const filteredBase64 = await compressBase64Image(
                base64,
                1400,
                1400,
                0.9,
                true,
              );
              const filteredBlob = await fetch(filteredBase64).then((res) => res.blob());
              const filteredResults = await performOCR(filteredBlob, (p) =>
                setOcrProgress(p),
              );
              results = pickBetterFrontOcr(results, filteredResults);
            } catch (fallbackErr) {
              console.error("Fallback OCR failed:", fallbackErr);
            }
          }
          let compressedBase64 = base64;
          try {
            compressedBase64 = await compressBase64Image(
              base64,
              1200,
              1200,
              0.7,
            );
          } catch (err) {
            console.warn("Compression failed for gallery image", err);
          }

          setDocFront({
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
            url: URL.createObjectURL(file),
            base64: compressedBase64,
          });

          if (results && applyFrontOcrToFamilyHead(results)) {
            if (results.valid) {
              toastSuccess("Aadhaar details extracted successfully.");
            }
          }
        } catch (err) {
          console.error("OCR failed", err);
          toastError("Scanning failed. Please try again or enter manually.");
        } finally {
          setOcrLoading(false);
          setOcrProgress(0);
          e.target.value = "";
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleHeadChange = (e) => {
    let { name, value } = e.target;

    // Validations
    if (name === "fullName" || name === "relatedPerson")
      value = value.replace(/[0-9]/g, "");
    if (name === "contactNumber" || name === "alternateContact")
      value = value.replace(/\D/g, "").slice(0, 10);
    if (name === "aadhaarNumber") value = value.replace(/\s/g, "");
    if (name === "pincode") value = value.replace(/\D/g, "").slice(0, 6);

    if (name === "dob") {
      const selectedDate = new Date(value);
      const today = new Date();
      let age = today.getFullYear() - selectedDate.getFullYear();
      const m = today.getMonth() - selectedDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < selectedDate.getDate())) {
        age--;
      }
      if (age < 18) {
        toastWarn("Family head must be at least 18 years old.");
        return;
      }
    }

    setFamilyHead((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const digits = familyHead.contactNumber.replace(/\D/g, "");
    if (digits.length !== 10) {
      setHeadPhoneDuplicate(HEAD_DUPLICATE_INITIAL);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setHeadPhoneDuplicate((p) => ({ ...p, loading: true, error: null }));
      apiService
        .checkCardPhoneExists(digits)
        .then((parsed) => {
          if (cancelled) return;
          if (parsed == null) {
            setHeadPhoneDuplicate({
              loading: false,
              exists: null,
              cardId: null,
              error: "Could not read registration check. Please try again.",
            });
            return;
          }
          setHeadPhoneDuplicate({
            loading: false,
            exists: parsed.exists,
            cardId: parsed.cardId,
            error: null,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setHeadPhoneDuplicate({
            loading: false,
            exists: null,
            cardId: null,
            error: "Could not verify this number.",
          });
        });
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [familyHead.contactNumber]);

  useEffect(() => {
    const digits = familyHead.aadhaarNumber.replace(/\D/g, "");
    if (digits.length !== 12) {
      setHeadAadhaarDuplicate(HEAD_DUPLICATE_INITIAL);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setHeadAadhaarDuplicate((p) => ({ ...p, loading: true, error: null }));
      apiService
        .checkCardAadhaarExists(digits)
        .then((parsed) => {
          if (cancelled) return;
          if (parsed == null) {
            setHeadAadhaarDuplicate({
              loading: false,
              exists: null,
              cardId: null,
              error: "Could not read registration check. Please try again.",
            });
            return;
          }
          setHeadAadhaarDuplicate({
            loading: false,
            exists: parsed.exists,
            cardId: parsed.cardId,
            error: null,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setHeadAadhaarDuplicate({
            loading: false,
            exists: null,
            cardId: null,
            error: "Could not verify this Aadhaar number.",
          });
        });
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [familyHead.aadhaarNumber]);

  useEffect(() => {
    const { firstName, middleName, lastName } = splitFamilyHeadNameParts(
      familyHead.fullName,
    );
    if (!firstName.trim()) {
      setHeadNameDuplicate(HEAD_DUPLICATE_INITIAL);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setHeadNameDuplicate((p) => ({ ...p, loading: true, error: null }));
      apiService
        .checkCardNameExists({ firstName, middleName, lastName })
        .then((parsed) => {
          if (cancelled) return;
          if (parsed == null) {
            setHeadNameDuplicate({
              loading: false,
              exists: null,
              cardId: null,
              error: "Could not read registration check. Please try again.",
            });
            return;
          }
          setHeadNameDuplicate({
            loading: false,
            exists: parsed.exists,
            cardId: parsed.cardId,
            error: null,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setHeadNameDuplicate({
            loading: false,
            exists: null,
            cardId: null,
            error: "Could not verify this name.",
          });
        });
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [familyHead.fullName]);

  const handleMemberChange = (index, e) => {
    let { name, value } = e.target;

    const updatedMembers = [...members];

    // Validations
    if (name === "fullName") value = value.replace(/[0-9]/g, "");
    if (name === "contactNumber") value = value.replace(/\D/g, "").slice(0, 10);
    if (name === "aadhaarNumber") value = value.replace(/\s/g, "");
    if (name === "documentId") {
      const docType = updatedMembers[index]?.documentType || "Aadhaar";
      if (docType === "Aadhaar") {
        value = value.replace(/\s/g, "");
      } else {
        value = value.toUpperCase();
      }
    }
    if (name === "documentType") {
      updatedMembers[index].documentId = "";
    }

    updatedMembers[index][name] = value;
    setMembers(updatedMembers);
  };

  /** 2nd document — back-side OCR for address & pincode */
  const handleDocumentUpload = handleBackScanImage;

  const handleHeadImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toastWarn("Image size should be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressedBase64 = await compressBase64Image(
            reader.result,
            800,
            800,
            0.7,
          );
          setHeadImage(compressedBase64);
        } catch (err) {
          console.error("Head image compression failed", err);
          toastWarn("Could not process photo. Please try another file.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startHeadCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHeadCameraPermissionDenied(false);
      toastWarn("Camera is not supported in this browser.");
      return;
    }

    try {
      setHeadCameraPermissionDenied(false);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // Prefer back/environment camera for family head photo capture.
            facingMode: { exact: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (primaryErr) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch (secondaryErr) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
        }
      }
      headCameraStreamRef.current = stream;
      setHeadCameraActive(true);
    } catch (err) {
      console.error("Head camera error:", err);
      const denied =
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError";
      setHeadCameraPermissionDenied(denied);
      toastWarn(
        denied
          ? "Camera permission denied. Click Allow Camera and permit camera access."
          : "Could not access camera. Please check camera availability.",
      );
    }
  };

  const stopHeadCamera = () => {
    if (headCameraStreamRef.current) {
      headCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      headCameraStreamRef.current = null;
    }
    if (headCameraVideoRef.current) headCameraVideoRef.current.srcObject = null;
    setHeadCameraActive(false);
  };

  const captureHeadPhoto = async () => {
    if (!headCameraVideoRef.current || !headCameraCanvasRef.current) return;

    const video = headCameraVideoRef.current;
    const canvas = headCameraCanvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    stopHeadCamera();

    try {
      const compressedBase64 = await compressBase64Image(base64, 800, 800, 0.7);
      setHeadImage(compressedBase64);
      setHeadCameraPermissionDenied(false);
    } catch (err) {
      console.error("Head camera compression failed", err);
      setHeadImage(base64);
      setHeadCameraPermissionDenied(false);
    }
  };

  const handlePaymentScreenshotUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toastWarn("Image size should be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressedBase64 = await compressBase64Image(
            reader.result,
            800,
            800,
            0.7,
          );
          setPaymentScreenshot({
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
            url: URL.createObjectURL(file),
            base64: compressedBase64,
          });
        } catch (err) {
          console.error("Payment screenshot compression failed", err);
          toastWarn("Could not process screenshot. Please try another file.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addMember = () => {
    if (members.length + 1 >= 7) return; // Max 7 including head
    setMembers([
      ...members,
      {
        fullName: "",
        relation: "",
        age: "",
        documentId: "",
        documentType: "Aadhaar",
      },
    ]);
    setActiveMemberTab(members.length + 1); // Switch to newly created member
  };

  const removeMember = (indexToRemove) => {
    // If we remove a member, we need to adjust the active tab
    const updatedMembers = members.filter((_, i) => i !== indexToRemove);
    setMembers(updatedMembers);

    // If we closed the currently active member tab, switch back to head
    if (activeMemberTab === indexToRemove + 1) {
      setActiveMemberTab(0);
    } else if (activeMemberTab > indexToRemove + 1) {
      // Shift active tab left if we removed a tab before it
      setActiveMemberTab(activeMemberTab - 1);
    }
  };

  // Member Scanning Functions
  const startMemberCamera = async (index) => {
    try {
      setMemberScanningIndex(index);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      memberStreamRef.current = stream;
      setMemberCameraActive(true);
    } catch (err) {
      console.error("Member camera error:", err);
      toastWarn("Could not access camera. Please use Gallery Upload.");
    }
  };

  const stopMemberCamera = ({ resetScanningIndex = true } = {}) => {
    if (memberStreamRef.current) {
      memberStreamRef.current.getTracks().forEach((track) => track.stop());
      memberStreamRef.current = null;
    }
    if (memberVideoRef.current) memberVideoRef.current.srcObject = null;
    setMemberCameraActive(false);
    if (resetScanningIndex) setMemberScanningIndex(null);
  };

  const calculateAge = (dobStr) => {
    if (!dobStr) return "";
    try {
      const [year, month, day] = dobStr.split("-");
      if (!year || !month || !day) return "";

      const today = new Date();
      const birthDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
      );
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      return age >= 0 && age < 120 ? age.toString() : "";
    } catch (e) {
      return "";
    }
  };

  const normalizeDigits = (s) => String(s || "").replace(/\D/g, "");

  const pickBetterFrontOcr = (a, b) => {
    if (!b) return a;
    if (!a) return b;
    if (b.valid && !a.valid) return b;
    if (a.valid && !b.valid) return a;
    if (b.canAutofill && !a.canAutofill) return b;
    if (a.canAutofill && !b.canAutofill) return a;
    return (b.confidence || 0) > (a.confidence || 0) ? b : a;
  };

  const applyFrontOcrToFamilyHead = (results) => {
    if (!results?.canAutofill) {
      toastWarn(results?.validationMessage || AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }

    const nextAadhaar =
      results.docNumber?.length === 12
        ? results.docNumber
        : normalizeDigits(results.docNumber).length === 12
          ? normalizeDigits(results.docNumber)
          : "";

    const nextName = isValidAadhaarName(results.name) ? results.name.trim() : "";

    setFamilyHead((prev) => ({
      ...prev,
      fullName: nextName || prev.fullName,
      gender: results.gender || prev.gender,
      dob: results.dob || prev.dob,
      aadhaarNumber: nextAadhaar || prev.aadhaarNumber,
    }));

    if (!results.valid) {
      toastWarn(
        "Some Aadhaar details could not be read. Please verify the form or rescan.",
      );
    }
    return true;
  };

  const isLikelyMemberName = (s) => isValidAadhaarName(s);

  const getNameConfidenceScore = (s) => {
    if (!s) return 0;
    const words = s.trim().split(/\s+/).filter(Boolean);
    let score = 0;
    for (const w of words) {
      if (/^[A-Z][a-z]{3,}$/.test(w)) score += 25; // 4+ letter title case (Mohd, Saif)
      else if (/^[A-Z][a-z]{1,2}$/.test(w)) score += 10; // 2-3 letter title case (Ali, Ram)
      else if (/^[A-Za-z]{3,}$/.test(w)) score += 10;
      if (w.length >= 4) score += 5;
    }
    if (words.length >= 2) score += 10; 
    // Moderate penalty for very short single words, but multi-word names are usually okay
    if (s.length < 8 && words.length < 2) score -= 30;
    return score;
  };

  const isLikelyMemberDocId = (docNumber) => {
    const digits = normalizeDigits(docNumber);
    // Member doc is Aadhaar: accept 10 or 12 digits (as per user request earlier).
    if (digits.length !== 12 && digits.length !== 10) return "";
    // Ignore obvious junk like "000000000000" or "111111111111".
    if (/^(\d)\1{9,11}$/.test(digits)) return "";
    return digits;
  };

  const preprocessMemberImageForOCR = async (base64Src) => {
    // 1) Compress and apply OCR filter (grayscale/contrast)
    let working = base64Src;
    try {
      working = await compressBase64Image(base64Src, 1200, 1200, 0.85, true);
    } catch (e) {
      working = base64Src;
    }

    // 2) Center-crop to reduce background noise
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.width || 0;
        const h = img.height || 0;
        if (w < 200 || h < 200) {
          resolve(working);
          return;
        }

        const cropScale = 0.92;
        const cropW = Math.round(w * cropScale);
        const cropH = Math.round(h * cropScale);
        const sx = Math.round((w - cropW) / 2);
        const sy = Math.round((h - cropH) / 2);

        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(working);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cropW, cropH);
        ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(working);
      img.src = working;
    });
  };

  const scanAndFillMember = async ({ base64Src, index, binaryBlob }) => {
    setMemberOcrLoading(true);
    setMemberScanProgress(0);
    try {
      // 1. Try OCR directly on the binary blob
      const optimalBlob = binaryBlob || await fetch(base64Src).then(res => res.blob());
      let details = await performOCR(optimalBlob, (p) =>
        setMemberScanProgress(p),
      );

      // 2. Fallback to cropped/filtered version if original scan failed
      let docAccepted =
        details?.type === "aadhaar" && isLikelyMemberDocId(details?.docNumber);
      if (!details || !docAccepted) {
        const processedBase64 = await preprocessMemberImageForOCR(base64Src);
        const processedBlob = await fetch(processedBase64).then(res => res.blob());
        const details2 = await performOCR(processedBlob, (p) =>
          setMemberScanProgress(p),
        );
        const docAccepted2 =
          details2?.type === "aadhaar" &&
          isLikelyMemberDocId(details2?.docNumber);
        if (docAccepted2) {
          details = details2;
          docAccepted = true;
        }
      }

      // 3. Fallback to full compressed/filtered (higher quality)
      if (!details || !docAccepted) {
        try {
          const fullFilteredBase64 = await compressBase64Image(
            base64Src,
            1400,
            1400,
            0.9,
            true,
          );
          const fullFilteredBlob = await fetch(fullFilteredBase64).then(res => res.blob());
          const details3 = await performOCR(fullFilteredBlob, (p) =>
            setMemberScanProgress(p),
          );
          const docAccepted3 =
            details3?.type === "aadhaar" &&
            isLikelyMemberDocId(details3?.docNumber);
          if (docAccepted3) {
            details = details3;
            docAccepted = true;
          }
        } catch (e) {}
      }

      if (!details) {
        toastWarn("Could not extract member details. Please enter manually.");
        return;
      }

      // ALWAYS compress for storage/request to save bandwidth
      let storageBase64 = base64Src;
      try {
        storageBase64 = await compressBase64Image(base64Src, 1200, 1200, 0.7);
      } catch (e) {}

      const nextName = isLikelyMemberName(details.name) ? details.name : "";
      const nextDocId =
        details?.type === "aadhaar"
          ? isLikelyMemberDocId(details.docNumber)
          : "";
      const nextAge = calculateAge(details.dob);

      const nextDocIdAccepted = nextDocId || "";
      const anyExtracted = Boolean(nextName || nextAge || nextDocIdAccepted);

      setMembers((prev) => {
        const updatedMembers = [...prev];
        const target = updatedMembers[index] || {};
        
        const nextScore = getNameConfidenceScore(nextName);
        const prevScore = getNameConfidenceScore(target.fullName);
        const currentAadhaarValid = target.documentId && target.documentId.replace(/\D/g, "").length >= 10;
        
        updatedMembers[index] = {
          ...target,
          fullName: (nextName && (!target.fullName || nextScore >= prevScore)) ? nextName : target.fullName,
          age: nextAge || target.age,
          documentId: nextDocIdAccepted || target.documentId,
          scannedImage: storageBase64,
        };
        return updatedMembers;
      });

      if (anyExtracted) {
        toastWarn("Member details extracted successfully!");
      } else {
        toastWarn(
          "OCR found data but could not confidently extract all fields. Please enter manually.",
        );
      }
    } catch (err) {
      console.error("Member OCR Error:", err);
      toastWarn("Could not extract details. Please enter manually.");
    } finally {
      setMemberOcrLoading(false);
      setMemberScanProgress(0);
      setMemberScanningIndex(null);
    }
  };

  const captureMemberPhoto = async () => {
    if (
      !memberVideoRef.current ||
      !memberCanvasRef.current ||
      memberScanningIndex === null
    )
      return;

    const targetIndex = memberScanningIndex;
    const video = memberVideoRef.current;
    const canvas = memberCanvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    // Stop camera but keep `memberScanningIndex` so the UI can show progress.
    stopMemberCamera({ resetScanningIndex: false });
    await scanAndFillMember({ base64Src: base64, index: targetIndex, binaryBlob: blob });
  };

  const handleMemberScanImage = async (e, index) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toastWarn("Image size should be less than 5MB");
      e.target.value = "";
      return;
    }

    const base64String = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    setMemberScanningIndex(index);
    setMemberScanProgress(0);
    await scanAndFillMember({ base64Src: base64String, index, binaryBlob: file });
    e.target.value = "";
  };

  const submitFinalApplication = async (resolvedTxnId = null) => {
    const finalTxnId = resolvedTxnId || txnId || `MANUAL-${Date.now()}`;

    // Build the API payload
    const today = new Date().toISOString().split("T")[0];
    const cardExpiry = new Date();
    cardExpiry.setFullYear(cardExpiry.getFullYear() + 1);
    const cardExpiryDate = cardExpiry.toISOString().split("T")[0];

    const { firstName, middleName, lastName } = splitFamilyHeadNameParts(
      familyHead.fullName,
    );

    const payload = {
      applicationDate: today,
      status: "pending",
      firstName,
      middleName,
      lastName,
      contact: familyHead.contactNumber,
      alternateContact: familyHead.alternateContact || "",
      email: familyHead.emailAddress,
      relation: familyHead.relation,
      relatedPerson: familyHead.relatedPerson,
      religion: familyHead.religion || "",
      gender: familyHead.gender,
      dob: familyHead.dob,
      address: familyHead.address,
      pincode: familyHead.pincode,
      aadhaarNumber: (familyHead.aadhaarNumber || "").replace(/\s/g, ""),
      cardIssueDate: today,
      cardExpiredDate: cardExpiryDate,
      verificationDate: today,
      totalMembers: 1 + members.length,
      totalMember: 1 + members.length,
      totalAmount: estimatedFee,
      documents: [
        docFront && {
          filename: docFront.name,
          originalName: docFront.name,
          path: docFront.base64 || docFront.url,
          size: 0,
          mimetype: "image/jpeg",
          type: "aadhaar_front",
          uploadedAt: new Date().toISOString(),
        },
        docBack && {
          filename: docBack.name,
          originalName: docBack.name,
          path: docBack.base64 || docBack.url,
          size: 0,
          mimetype: "image/jpeg",
          type: "aadhaar_back",
          uploadedAt: new Date().toISOString(),
        },
        headImage && {
          filename: "family_head_photo.jpg",
          originalName: "family_head_photo.jpg",
          path: headImage, // This is already base64 now
          size: 0,
          mimetype: "image/jpeg",
          type: "profile_photo",
          uploadedAt: new Date().toISOString(),
        },
        paymentScreenshot && {
          filename: paymentScreenshot.name,
          originalName: paymentScreenshot.name,
          path: paymentScreenshot.base64 || paymentScreenshot.url,
          size: 0,
          mimetype: "image/jpeg",
          type: "payment_screenshot",
          uploadedAt: new Date().toISOString(),
        },
      ].filter(Boolean),
      isPrint: false,
      members: members.map((m) => {
        const docType = m.documentType || "Aadhaar";
        let docId = m.documentId || "";
        if (docType === "Aadhaar") docId = (docId || "").replace(/\s/g, "");
        return {
          name: m.fullName,
          relation: m.relation || "Family Member",
          age: parseInt(m.age) || 0,
          documentId: docId,
          documentType: docType,
        };
      }),
      payment: {
        transactionId: finalTxnId,
        method: "online",
        totalAmount: estimatedFee,
        date: new Date().toISOString(),
        orderId: orderId || "",
      },
      campId: (localStorage.getItem("userRole") || sessionStorage.getItem("userRole")) === "Employee" ? (todayCampId || "") : "",
    };

    try {
      setSubmitting(true);
      const apiRes = await apiService.submitCardApplication(payload);
      const created = extractCreatedCardRecord(apiRes);
      setSubmissionReceipt(created);
      if (created?.applicationId) {
        setApplicationId(String(created.applicationId));
      }
      setCurrentStep(successStep);
    } catch (err) {
      console.error("Card application submission error:", err);
      const errMsg = err.response?.data?.message || err.message || "";

      if (errMsg.toLowerCase().includes("already exists")) {
        toastWarn(
          "Card already exists for this applicant. Receipt can be printed only after a new card is created.",
        );
        return;
      }

      toastError(errMsg || "Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const buildStaffHealthCardPayload = () => {
    const totalMembersCount = 1 + members.length;
    const fee = computeAyushCardFeeRupees(totalMembersCount);
    const today = new Date().toISOString().split("T")[0];
    const cardExpiry = new Date();
    cardExpiry.setFullYear(cardExpiry.getFullYear() + 1);
    const cardExpiryDate = cardExpiry.toISOString().split("T")[0];

    const { firstName, middleName, lastName } = splitFamilyHeadNameParts(
      familyHead.fullName,
    );

    const customerName = familyHead.fullName.trim();

    return {
      applicationId,
      firstName,
      middleName,
      lastName,
      email: familyHead.emailAddress?.trim() || "",
      contact: familyHead.contactNumber.trim(),
      alternateContact: familyHead.alternateContact?.trim() || "",
      totalAmount: fee,
      applicationDate: today,
      gender: familyHead.gender || "",
      dob: familyHead.dob || "",
      religion: familyHead.religion || "",
      relation: familyHead.relation || "",
      relatedPerson: familyHead.relatedPerson || "",
      address: familyHead.address || "",
      pincode: familyHead.pincode || "",
      aadhaarNumber: (familyHead.aadhaarNumber || "").replace(/\s/g, ""),
      cardNo: `${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      cardIssueDate: today,
      cardExpiredDate: cardExpiryDate,
      verificationDate: today,
      status: "pending",
      totalMembers: totalMembersCount,
      totalMember: totalMembersCount,
      members: members.map((m) => {
        const docType = m.documentType || "Aadhaar";
        let docId = m.documentId || "";
        if (docType === "Aadhaar") docId = (docId || "").replace(/\s/g, "");
        return {
          name: m.fullName,
          relation: m.relation || "Family Member",
          age: parseInt(m.age, 10) || 0,
          documentId: docId,
          documentType: docType,
        };
      }),
      documents: [
        docFront && {
          name: "documentFront",
          path: docFront.base64 || docFront.url,
          type: "image",
        },
        docBack && {
          name: "documentBack",
          path: docBack.base64 || docBack.url,
          type: "image",
        },
        headImage && {
          name: "family_head_photo.jpg",
          path: headImage,
          type: "profile_photo",
        },
        staffPaymentMode === "cash" &&
          staffCashReceiptImage && {
            name: "cashPaymentReceipt",
            path: staffCashReceiptImage,
            type: "payment_screenshot",
          },
      ].filter(Boolean),
      payment: {
        method: staffPaymentMode === "cash" ? "cash" : "online",
        transactionId:
          staffPaymentMode === "cash"
            ? `CASH-${Date.now()}`
            : txnId || `ONLINE-${Date.now()}`,
        orderId: orderId || "",
        amount: fee,
        totalAmount: fee,
        customerName,
        customerEmail: familyHead.emailAddress?.trim() || "",
        customerPhone: familyHead.contactNumber.trim(),
        date: new Date().toISOString(),
      },
      campId: (localStorage.getItem("userRole") || sessionStorage.getItem("userRole")) === "Employee" ? (todayCampId || "") : "",
    };
  };

  const submitStaffApplication = async () => {
    const payload = buildStaffHealthCardPayload();
    try {
      setSubmitting(true);
      let apiRes;
      if (onStaffSubmit) {
        apiRes = await onStaffSubmit(payload);
      } else {
        apiRes = await apiService.createHealthCard(payload);
      }
      const created = extractCreatedCardRecord(apiRes);
      setSubmissionReceipt(created);
      if (created?.applicationId) {
        setApplicationId(String(created.applicationId));
      }
      setCurrentStep(successStep);
      toastSuccess("Ayush card application submitted.");
    } catch (err) {
      console.error("Staff card create error:", err);
      const errMsg = err.response?.data?.message || err.message || "";
      if (errMsg.toLowerCase().includes("already exists")) {
        toastWarn(
          "Card already exists for this applicant. Receipt can be printed only after a new card is created.",
        );
        return;
      }
      toastError(errMsg || "Failed to create Ayush card. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitiateCashfreePayment = async () => {
    setOnlinePaymentLoading(true);
    setSaveError("");
    try {
      const amount = computeAyushCardFeeRupees(1 + (members || []).length);
      const payload = {
        amount,
        customerName: (familyHead.fullName || "").trim() || "Customer",
        customerEmail:
          (familyHead.emailAddress || "").trim() || "customer@example.com",
        customerPhone:
          (familyHead.contactNumber || "")
            .trim()
            .replace(/\D/g, "")
            .slice(0, 10) || "9999999999",
      };

      const res = staffPaymentFlow
        ? await apiService.createPaymentOrder(payload)
        : await apiService.createPublicPaymentOrder(payload);

      const possibleData = [
        res,
        res?.data,
        res?.data?.data,
        res?.order,
        res?.data?.order,
      ].filter(Boolean);
      let sessionId = null;
      let cOrderId = null;

      for (const d of possibleData) {
        sessionId =
          sessionId ||
          d.payment_session_id ||
          d.paymentSessionId ||
          d.cf_session_id ||
          d.sessionId;
        cOrderId = cOrderId || d.order_id || d.orderId || d.cf_order_id;
      }

      if (!sessionId) {
        throw new Error("Payment session could not be created.");
      }

      setOrderId(cOrderId);

      const cashfree = await load({ mode: "sandbox" });
      cashfree
        .checkout({
          paymentSessionId: sessionId,
          redirectTarget: "_modal",
        })
        .then(() => {
          setTimeout(() => {
            handleVerifyCashfreePayment(cOrderId);
          }, 1500);
        });
    } catch (err) {
      console.error("[Cashfree] Initiate failed:", err);
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Failed to initiate payment.";
      setSaveError(errorMsg);
      toastError(errorMsg);
    } finally {
      setOnlinePaymentLoading(false);
    }
  };

  const handleVerifyCashfreePayment = async (forcedOrderId = null) => {
    const activeOrderId = forcedOrderId || orderId;
    if (!activeOrderId) return;

    setVerifyLoading(true);
    try {
      const verifyData = {
        amount: estimatedFee,
        customerName: familyHead.fullName,
        customerEmail: familyHead.emailAddress,
        customerPhone: familyHead.contactNumber,
      };

      const verifyRes = staffPaymentFlow
        ? await apiService.verifyPayment(activeOrderId, verifyData)
        : await apiService.verifyPublicPayment(activeOrderId, verifyData);

      const isSuccess =
        verifyRes?.success === true ||
        verifyRes?.data?.payment?.status === "SUCCESS" ||
        verifyRes?.data?.gatewayOrder?.order_status === "PAID" ||
        verifyRes?.payment_status === "SUCCESS" ||
        verifyRes?.status === "SUCCESS";

      if (isSuccess) {
        const resolvedTxnId =
          verifyRes?.data?.payment?.transactionId ||
          verifyRes?.data?.gatewayOrder?.cf_order_id ||
          verifyRes?.transactionId ||
          `TXN${Date.now()}`;

        // Store transaction ID and show success state in Step 4.
        // User will click "Complete Registration" to submit, same as admin flow.
        setTxnId(resolvedTxnId);
      } else {
        toastWarn(
          "Payment verification pending or failed. Please check your bank or retry.",
        );
      }
    } catch (err) {
      console.error("Verification error:", err);
      setSaveError("Verification failed.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleNext = async () => {
    // Step 1 validation: Must have uploaded an identity document AND filled basic details
    if (currentStep === 1) {
      // Require at least one identity document (from upload or scanner)
      if (!docFront) {
        toastWarn(
          "Please complete OCR for the first document (camera or gallery in the middle column).",
        );
        return;
      }
      if (!docBack) {
        toastWarn(
          "Please scan the back of the Aadhaar card (right column — camera or gallery).",
        );
        return;
      }
      if (!headImage) {
        toastWarn("Please upload the family head photo.");
        return;
      }
      const fg = familyHead;
      const missingFields = [];
      if (!fg.fullName) missingFields.push("Full Name");
      if (!fg.dob) missingFields.push("Date of Birth");
      if (!fg.gender) missingFields.push("Gender");
      if (!fg.address?.trim()) missingFields.push("Address");
      if (!fg.pincode) missingFields.push("Pincode");
      if (!fg.contactNumber) missingFields.push("Contact Number");
      if (!fg.aadhaarNumber) missingFields.push("Aadhaar Number");

      if (missingFields.length > 0) {
        toastWarn(
          `Please fill missing family head details: ${missingFields.join(", ")}`,
        );
        return;
      }

      if (fg.contactNumber.replace(/\D/g, "").length < 10) {
        toastWarn("Contact number must be 10 digits.");
        return;
      }
      const adDigits = fg.aadhaarNumber.replace(/\D/g, "");
      if (adDigits.length < 8) {
        toastWarn("Please enter a valid Aadhaar number (at least 8-12 digits).");
        return;
      }
      if (fg.pincode.replace(/\D/g, "").length < 6) {
        toastWarn("Pincode must be 6 digits.");
        return;
      }

      // Logic to auto redirect to Member 1 on Step 3 if we add a member
      if (members.length > 0) {
        setActiveMemberTab(1);
      } else {
        setActiveMemberTab(0);
      }
    }

    // Step 2 validation: All members details if added
    if (currentStep === 2) {
      for (let i = 0; i < members.length; i++) {
        const p = members[i];
        if (!p.fullName || !p.relation || !p.age) {
          toastWarn(`Please fill all details for Member ${i + 1}`);
          return;
        }
        const pType = p.documentType || "Aadhaar";
        if (
          pType === "Aadhaar" &&
          (p.documentId || "").replace(/\D/g, "").length < 8
        ) {
          toastWarn(
            `Please enter a valid Aadhaar ID for Member ${i + 1}`,
          );
          return;
        } else if (pType !== "Aadhaar" && !(p.documentId || "").trim()) {
          toastWarn(`Please enter a valid Document ID for Member ${i + 1}`);
          return;
        }
      }
    }

    // Step 3 validation: Declaration checkbox must be accepted
    if (currentStep === 3) {
      if (!declarationAccepted) {
        toastWarn("Please accept the declaration before continuing.");
        return;
      }
    }

    if (skipPayment && currentStep === 3) {
      await submitStaffApplication();
      return;
    }

    // Step 4: payment + submit
    if (!skipPayment && currentStep === 4) {
      if (staffPaymentFlow) {
        if (!staffPaymentMode) {
          toastWarn("Choose offline/cash or online payment.");
          return;
        }
        if (staffPaymentMode === "cash") {
          if (!staffCashReceiptImage) {
            toastWarn("Capture a photo of the cash receipt to continue.");
            return;
          }
          await submitStaffApplication();
          return;
        }
        if (staffPaymentMode === "online") {
          if (!txnId) {
            toastWarn("Complete online payment and tap Verify, then continue.");
            return;
          }
          await submitStaffApplication();
          return;
        }
      } else {
        if (!txnId) {
          toastWarn(
            "Please complete and verify online payment before continuing.",
          );
          return;
        }
        await submitFinalApplication();
        return;
      }
    }

    if (currentStep < successStep) {
      const goingToMembersStep = currentStep === 1;
      setCurrentStep(currentStep + 1);
      if (!goingToMembersStep) {
        document.querySelector(".custom-scrollbar")?.scrollTo(0, 0);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 4 && staffPaymentFlow) stopStaffCashCamera();
      setCurrentStep(currentStep - 1);
    }
  };

  if (variant === "modal" && !isOpen) return null;

  const todayFormatted = new Date()
    .toLocaleDateString("en-GB")
    .replace(/\//g, "-");

  const cardPreviewData = {
    applicantFirstName: (familyHead.fullName || "").split(" ")[0] || "",
    applicantLastName:
      (familyHead.fullName || "").split(" ").slice(1).join(" ") || "",
    dob: familyHead.dob || "",
    phone: familyHead.contactNumber || "",
    aadhaarNumber: familyHead.aadhaarNumber || "",
    campName: todayCampName,
    dateApplied: todayFormatted,
    applicationDate: todayFormatted,
    members: members.map((m) => {
      const docType = m.documentType || "Aadhaar";
      let docId = m.documentId || "";
      if (docType === "Aadhaar") docId = docId; // Verbatim
      return {
        name: m.fullName,
        relation: m.relation || "Family Member",
        age: parseInt(m.age) || 0,
        documentId: docId,
        documentType: docType,
      };
    }),
    documentFront: docFront?.base64 || docFront?.url || "",
    profileImage: headImage || docFront?.base64 || docFront?.url || "",
    payment: {
      totalPaid: estimatedFee,
    },
  };

  const renderHeadDuplicateHint = (check, kind) => {
    if (check.error)
      return <p className="text-[12px] text-red-600 mt-1">{check.error}</p>;
    if (check.loading)
      return (
        <p className="text-[12px] text-gray-500 mt-1 flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          Checking registration…
        </p>
      );
    if (check.exists === null) return null;
    if (check.exists)
      return (
        <p className="text-[12px] text-amber-800 mt-1 leading-snug">
          A card is already registered with this {kind}.
        </p>
      );
    return (
      <p className="text-[12px] text-green-700 mt-1">
        No existing card found for this {kind}.
      </p>
    );
  };

  const thermalPaymentLabel = staffPaymentFlow
    ? staffPaymentMode === "cash"
      ? "Cash / offline"
      : txnId
        ? "Online (verified)"
        : "Online"
    : "UPI / Online";

  const thermalPaymentRef = staffPaymentFlow
    ? staffPaymentMode === "cash"
      ? "Receipt on file"
      : txnId || "—"
    : txnId || "—";

  const hasPrintableReceipt = Boolean(
    submissionReceipt &&
    (submissionReceipt._id != null ||
      submissionReceipt.applicationId != null ||
      submissionReceipt.cardNo != null),
  );

  const renderThermalReceipt = () => {
    if (!hasPrintableReceipt) return null;

    const rec = submissionReceipt;
    const displayAppId =
      rec?.applicationId != null ? String(rec.applicationId) : applicationId;
    const displayName =
      fullNameFromCardRecord(rec) || familyHead.fullName || "—";
    const displayPhone = rec?.contact ?? familyHead.contactNumber ?? "—";
    const displayAadhaarRaw = String(
      rec?.aadhaarNumber ?? familyHead.aadhaarNumber ?? "",
    );
    const displayAddress = rec?.address ?? familyHead.address ?? "";
    const displayPin = rec?.pincode ?? familyHead.pincode ?? "—";
    const receiptTotal =
      rec?.totalAmount != null && !Number.isNaN(Number(rec.totalAmount))
        ? Number(rec.totalAmount)
        : estimatedFee;
    const listMembers =
      Array.isArray(rec?.members) && rec.members.length > 0
        ? rec.members
        : members;
    const rawDateStr = rec?.applicationDate != null ? String(rec.applicationDate).trim() : "";
    // Prefer full ISO timestamps (createdAt / updatedAt) from the API — they carry the real time.
    // applicationDate is often a date-only string ("YYYY-MM-DD") sent back from the server,
    // which previously caused the hardcoded T12:00:00 workaround and the "always 12:00 pm" bug.
    const receiptDate = (() => {
      const fullTs = rec?.createdAt || rec?.updatedAt;
      if (fullTs) return new Date(fullTs);
      if (rawDateStr.length > 10) return new Date(rawDateStr.replace(/(Z|\+00:00)$/, ""));
      if (rawDateStr.length === 10) return new Date(); // date-only → use submission time
      return new Date();
    })();

    return (
      <div className="public-thermal-receipt-wrap hidden print:block">
        <div
          id="thermal-receipt-content"
          className="public-thermal-receipt w-[2in] max-w-[2in] box-border bg-white p-2 font-sans text-black leading-tight"
        >
          <div className="text-center border-b border-dashed border-black pb-2 mb-2">
            <img 
              src="/logo1.svg" 
              alt="logo" 
              className="w-10 h-10 mx-auto mb-2 object-contain"
              style={{ display: 'block', margin: '0 auto 8px', width: '40px', height: '40px' }}
            />
            <h1 className="font-black text-[12px] uppercase tracking-tight leading-none">
              BKBS
            </h1>
            <p className="text-[7px] font-semibold mt-1 uppercase tracking-wide">
              Ayush Card · Receipt
            </p>
          </div>

          <div className="text-[8px] space-y-0.5 mb-2 border-b border-dashed border-gray-400 pb-2">
            <div className="flex justify-between gap-1">
              <span className="font-bold shrink-0">App ID</span>
              <span className="font-mono text-right break-all">
                {displayAppId}
              </span>
            </div>
            {rec?.cardNo ? (
              <div className="flex justify-between gap-1">
                <span className="font-bold shrink-0">Card No</span>
                <span className="font-mono text-right break-all text-[7px]">
                  {String(rec.cardNo)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-1">
              <span className="font-bold shrink-0">Date</span>
              <span className="text-right">
                {receiptDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="font-bold shrink-0">Time</span>
              <span className="text-right">
                {receiptDate.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
            {todayCampName && (
              <div className="flex justify-between gap-1 border-t border-dotted border-gray-300 pt-0.5 mt-0.5">
                <span className="font-bold shrink-0">Camp</span>
                <span className="text-right break-words">{todayCampName}</span>
              </div>
            )}
          </div>

          <div className="text-[8px] mb-2 border-b border-dashed border-gray-400 pb-2">
            <p className="font-bold uppercase mb-1">Family head</p>
            <p className="font-bold text-[6px] uppercase break-words">
              {displayName}
            </p>
            <p className="mt-0.5">Ph: {displayPhone || "—"}</p>
            <p className="break-all">
              Aadhaar:{" "}
              {displayAadhaarRaw.length >= 4
                ? `****${displayAadhaarRaw.slice(-4)}`
                : "—"}
            </p>
            <p className="break-words mt-0.5">
              {displayAddress
                ? `${displayAddress.slice(0, 80)}${displayAddress.length > 80 ? "…" : ""}`
                : "—"}
            </p>
            <p>Pin: {displayPin || "—"}</p>
          </div>

          <div className="text-[8px] mb-2 border-b border-dashed border-gray-400 pb-2">
            <p className="font-bold uppercase mb-1">
              Members ({listMembers.length})
            </p>
            {listMembers.length === 0 ? (
              <p className="text-gray-600">None</p>
            ) : (
              <ul className="space-y-1 list-none p-0 m-0">
                {listMembers.map((m, idx) => (
                  <li
                    key={idx}
                    className="border-b border-dotted border-gray-300 pb-1 last:border-0"
                  >
                    <span className="font-bold">{idx + 1}.</span>{" "}
                    <span className="font-semibold uppercase">
                      {thermalMemberLabel(m)}
                    </span>
                    <br />
                    <span className="text-[7px]">
                      {m.relation || "—"} · Age {m.age ?? "—"}
                    </span>
                    <br />
                    <span className="font-mono text-[7px] break-all">
                      Doc:{" "}
                      {thermalMemberDocId(m).length >= 4
                        ? `****${thermalMemberDocId(m).slice(-4)}`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-[8px] space-y-0.5 mb-2">
            {extraMembersBeyondIncluded === 0 ? (
              <div className="flex justify-between">
                <span>Up to 4 members</span>
                <span className="font-semibold">
                  ₹{AYUSH_CARD_BASE_PACKAGE_RUPEES}.00
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Base (up to 4)</span>
                  <span>₹{AYUSH_CARD_BASE_PACKAGE_RUPEES}.00</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Extra {extraMembersBeyondIncluded}×₹
                    {AYUSH_CARD_EXTRA_MEMBER_RUPEES}
                  </span>
                  <span>
                    ₹
                    {extraMembersBeyondIncluded *
                      AYUSH_CARD_EXTRA_MEMBER_RUPEES}
                    .00
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between font-black text-[6px] border-t-2 border-black pt-1 mt-1">
              <span>TOTAL</span>
              <span>₹{receiptTotal}.00</span>
            </div>
          </div>

          <div className="text-[7px] font-semibold space-y-0.5 border-t border-dashed border-gray-400 pt-2 uppercase">
            <p>Pay: {thermalPaymentLabel}</p>
            <p className="break-all">Ref: {thermalPaymentRef}</p>
            <p className="text-center mt-2 font-black normal-case tracking-wide border border-black py-0.5">
              Submitted
            </p>
          </div>

          {/* QR Code Section */}
          <div className="flex justify-center py-2 border-t border-dashed border-gray-400">
             <div className="bg-white p-1">
               <QRCode 
                 value={displayAppId} 
                 size={64}
                 level="M"
               />
             </div>
          </div>

          <div className="text-[7px] mt-3 pt-2 border-t border-dashed border-gray-400 space-y-1">
            <p className="font-bold text-center text-[6px] mb-1">
              महत्वपूर्ण सूचना
            </p>
            <p className="text-[6px] leading-tight">
              1- रसीद सुरक्षित रखें; बिना रसीद आयुष कार्ड नहीं दिया जाएगा।
            </p>
            <p className="text-[6px] leading-tight">
              2- रसीद गुम होने पर ₹50 शुल्क (पेनल्टी) देकर ही कार्ड जारी होगा।
            </p>
            <p className="text-[6px] leading-tight">
              3- शुल्क (पेनल्टी) देने के साथ कार्ड केवल मुखिया/नामित सदस्य को,
              आधार सत्यापन के बाद मिलेगा।
            </p>
            <p className="text-[6px] leading-tight">
              4- संस्था को दिए गए नंबर पर किसी भी कारण संपर्क न होने पर आप स्वयं
              जिम्मेदार होंगे.
            </p>
            <p className="text-[6px] leading-tight">
              5- किसी भी विवाद में अंतिम निर्णय संस्था का होगा।
            </p>
            <p className="text-[6px] leading-tight">
              6- फोन नंबर: 8303902030
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      id="ayushcard-application-form-root"
      className={
        variant === "modal"
          ? "fixed inset-0 z-100 flex items-center justify-center bg-black/60 px-4"
          : "min-h-screen bg-[#f0f0f0] py-8 px-0"
      }
      style={{ fontFamily: "Quicksand, sans-serif" }}
    >
      {variant === "page" && (
        <style>{`
          /* Mobile (page variant only): make all text 12px */
          @media (max-width: 640px) {
            #ayushcard-application-form-root,
            #ayushcard-application-form-root * {
              font-size: 12px !important;
            }
          }
        `}</style>
      )}
      <div
        className={
          variant === "page"
            ? "w-full flex flex-col gap-4"
            : "w-full flex justify-center items-stretch"
        }
      >
        {variant === "page" && (
          <div className="flex flex-wrap items-center gap-3 px-2 sm:px-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-[#222222] font-semibold hover:text-[#fa8112] transition-colors"
              >
                <ArrowLeft size={20} />
                Back
              </button>
            )}
            <h1 className="text-xl font-bold text-[#222222] tracking-tight">
              Create Ayush Card
            </h1>
          </div>
        )}
        <div
          className="bg-white w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 relative rounded-xl shadow-xl"
          style={{ fontFamily: "'Quicksand', sans-serif" }}
        >
          {/* Header Section */}
          <div className="flex justify-between items-center px-3 py-2 bg-[#F5F5F5] shrink-0">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center justify-center shrink-0">
                <img
                  src="/logo_whitebg.svg"
                  alt="BKBS Trust"
                  className="h-20 w-20"
                />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-[14px] font-semibold text-[#222222]">
                  {variant === "page"
                    ? "New card registration"
                    : "Apply for Ayush Card"}
                </h3>
              </div>
              {variant === "modal" ? (
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-200 rounded-full transition-colors text-[#222222] shrink-0 border border-[#222222]"
                >
                  <X size={16} />
                </button>
              ) : (
                <div className="w-8 shrink-0" aria-hidden />
              )}
            </div>
          </div>

          {/* Hidden File Inputs — 2nd document (back OCR) + head photo */}
          <input
            type="file"
            accept=".jpg,.jpeg,.png"
            ref={docBackInputRef}
            className="hidden"
            onChange={handleDocumentUpload}
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={docBackCameraInputRef}
            className="hidden"
            onChange={handleDocumentUpload}
          />
          <input
            type="file"
            accept="image/*"
            ref={headImageInputRef}
            className="hidden"
            onChange={handleHeadImageUpload}
          />
          <input
            type="file"
            accept=".jpg,.jpeg,.png"
            ref={paymentInputRef}
            className="hidden"
            onChange={handlePaymentScreenshotUpload}
          />

          {currentStep < successStep ? (
            <>
              {/* <div className="text-center py-4 relative bg-white shrink-0">
              <h2 className="text-2xl font-semibold text-[#222222] inline-block relative pb-2">
                New Card Registration
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-[#fa8112] rounded-full"></span>
              </h2>
            </div> */}

              {/* Stepper */}
              <div className="px-4 sm:px-8 py-2 flex justify-center bg-white shrink-0">
                <div className="flex items-center max-w-xl w-full justify-between relative py-1">
                  {/* Step lines background */}
                  <div className="absolute top-[38%] left-[15%] w-[70%] h-[1.5px] bg-[#f7e5bc] -z-10"></div>
                  <div
                    className="absolute top-[38%] left-[15%] h-[1.5px] bg-[#fa8112] -z-10 transition-all duration-500"
                    style={{ width: `${stepperProgressPct}%` }}
                  ></div>

                  {stepperSteps.map((step) => (
                    <div
                      key={step.num}
                      className="flex flex-col items-center bg-white relative z-10 w-[72px] sm:w-[80px]"
                    >
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-[12px] font-bold mb-1 transition-colors ${
                          currentStep === step.num
                            ? "bg-[#fa8112] text-white"
                            : currentStep > step.num
                              ? "bg-[#fa8112] text-white"
                              : "border border-[#f7e5bc] text-[#222222] bg-white"
                        }`}
                      >
                        {currentStep > step.num ? (
                          <Check size={13} strokeWidth={3} />
                        ) : (
                          step.num
                        )}
                      </div>
                      <span
                        className={`text-[9px] sm:text-[10px] md:text-[11px] text-center max-w-[68px] sm:max-w-none leading-tight md:whitespace-nowrap ${
                          currentStep === step.num
                            ? "font-bold text-[#222222]"
                            : "font-semibold text-[#666666]"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-y-auto px-8 pb-24 pt-2 custom-scrollbar">
                {/* STEP 1: ADD FAMILY HEAD */}
                {currentStep === 1 && (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-[#FAF3E1] rounded-lg p-3 px-4 flex items-center gap-3 border-l-4 border-[#FA8112] mb-5">
                      <User size={20} className="text-[#222222]" />
                      <h3 className="font-medium text-[12px] text-[#222222]">
                        Family Head Details
                      </h3>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 md:gap-4 mb-6 relative w-full items-stretch md:items-stretch">
                      {/* Family Head Photo — first on mobile, left column on desktop */}
                      <div className="w-full md:flex-1 md:min-w-0 border-2 border-[#fa8112] bg-[#faf3e1] p-3 sm:p-4 rounded-xl min-h-0 flex flex-col items-center justify-center">
                        <h4 className="w-full text-[11px] sm:text-[12px] font-bold text-[#222222] mb-2 text-center">
                          Upload head photo
                        </h4>
                        {!headImage ? (
                          headCameraActive ? (
                            <div className="w-full max-w-[260px] border border-[#fa8112]/30 bg-white rounded-lg p-2">
                              <div className="relative aspect-square w-full max-w-[180px] mx-auto rounded-lg overflow-hidden border border-[#F6B579]">
                                <video
                                  ref={headCameraVideoRef}
                                  autoPlay
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex gap-2 mt-3">
                                <button
                                  type="button"
                                  onClick={captureHeadPhoto}
                                  className="flex-1 py-2 bg-[#fa8112] text-white rounded-lg font-semibold flex items-center justify-center gap-2"
                                >
                                  <Camera size={16} /> Capture
                                </button>
                                <button
                                  type="button"
                                  onClick={stopHeadCamera}
                                  className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="border border-dashed border-gray-300 bg-white rounded-lg py-4 px-4 flex flex-col items-center justify-center text-center w-full max-w-[260px]">
                              <UploadCloud
                                className="text-[#a4a4a4] mb-1.5"
                                size={20}
                              />
                              <div className="flex gap-2 mt-2 w-full">
                                <button
                                  type="button"
                                  onClick={() =>
                                    headImageInputRef.current?.click()
                                  }
                                  className="flex-1 px-2 py-1.5 border border-[#fa8112] text-[#fa8112] rounded-lg text-[11px] font-semibold hover:bg-orange-50"
                                >
                                  Upload
                                </button>
                                <button
                                  type="button"
                                  onClick={startHeadCamera}
                                  className="flex-1 px-2 py-1.5 bg-[#fa8112] text-white rounded-lg text-[11px] font-semibold"
                                >
                                  {headCameraPermissionDenied
                                    ? "Allow Camera"
                                    : "Camera"}
                                </button>
                              </div>
                              {headCameraPermissionDenied && (
                                <p className="text-[11px] text-red-500 mt-2 text-center">
                                  Camera access is blocked, please allow camera
                                  access in browser settings.
                                </p>
                              )}
                            </div>
                          )
                        ) : (
                          <div className="relative">
                            <img
                              src={headImage}
                              alt="Head"
                              className="w-20 h-20 rounded-full object-cover border-2 border-[#faf3e1]"
                            />
                            <button
                              className="absolute -top-2 -right-2 bg-white border border-gray-200 text-gray-600 rounded-full p-1 shadow-sm hover:bg-gray-100"
                              onClick={() => setHeadImage(null)}
                            >
                              <CloseIcon size={14} />
                            </button>
                          </div>
                        )}
                        <canvas ref={headCameraCanvasRef} className="hidden" />
                      </div>

                      {/* 1st document: OCR only — middle column */}
                      <div className="w-full md:flex-1 md:min-w-0 flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border border-[#fa8112]/30 bg-[#faf3e1] min-h-0">
                        <h4 className="w-full text-[11px] sm:text-[12px] font-bold text-[#222222] mb-1 text-center">
                          1st document — OCR scan
                        </h4>

                        {cameraActive ? (
                          <div className="w-full max-w-sm space-y-2 animate-in fade-in zoom-in-95">
                            <div className="relative aspect-[4/3] max-h-[200px] sm:max-h-[220px] bg-black rounded-lg overflow-hidden shadow border border-white">
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover scale-[1.4]"
                              />
                              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-2 border-white/50 border-dashed aspect-[1.6/1] rounded-lg pointer-events-none"></div>
                              {ocrLoading && (
                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-6 transition-all animate-in fade-in">
                                  <div className="w-full max-w-[160px] h-1.5 bg-white/20 rounded-full overflow-hidden mb-3 relative">
                                    <div
                                      className="h-full bg-[#fa8112] transition-all duration-300"
                                      style={{ width: `${ocrProgress}%` }}
                                    ></div>
                                  </div>
                                  <p className="text-white text-[12px] font-bold animate-pulse">
                                    Scanning... {ocrProgress}%
                                  </p>
                                  <div className="absolute left-0 right-0 h-0.5 bg-[#fa8112] shadow-[0_0_10px_#fa8112] blur-[1px] animate-[scan_2s_infinite]"></div>
                                </div>
                              )}
                            </div>
                            <style>{`
                              @keyframes scan {
                                0% { top: 20%; }
                                50% { top: 80%; }
                                100% { top: 20%; }
                              }
                            `}</style>
                            <div className="flex gap-2">
                              <button
                                onClick={stopCamera}
                                className="flex-1 py-2 text-[12px] bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={capturePhoto}
                                disabled={ocrLoading}
                                className="flex-[2] py-2 text-[12px] bg-[#fa8112] text-white rounded-lg font-semibold shadow flex items-center justify-center gap-1.5 active:scale-95"
                              >
                                {ocrLoading ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Camera size={16} />
                                )}
                                {ocrLoading ? "Scanning..." : "Capture & Scan"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center group w-full">
                            <div
                              className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow mb-3 cursor-pointer hover:scale-105 transition-all border border-orange-100 group-hover:border-[#fa8112]"
                              onClick={startCamera}
                            >
                              {ocrLoading ? (
                                <Loader2
                                  className="animate-spin text-[#fa8112]"
                                  size={24}
                                />
                              ) : (
                                <Camera size={24} className="text-[#fa8112]" />
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 text-center mb-3 px-1">
                              Camera or gallery — name, DOB, gender &amp; Aadhaar no.
                            </p>
                            <div className="flex gap-2 w-full text-[12px] justify-center flex-wrap">
                              <button
                                onClick={startCamera}
                                className="px-3 py-2 bg-[#fa8112] text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 shadow-sm hover:bg-[#e47510] transition-all"
                              >
                                <Camera size={13} /> Camera
                              </button>
                              <button
                                type="button"
                                onClick={() => ocrFileInputRef.current?.click()}
                                className="px-3 py-2 bg-white border border-[#fa8112] text-[#fa8112] rounded-lg font-semibold flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-all"
                              >
                                <UploadCloud size={13} /> Gallery
                              </button>
                            </div>
                          </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                        <input
                          ref={ocrFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleScanImage}
                        />
                      </div>

                      {/* 2nd document: back-side OCR — beside front scan */}
                      <div className="w-full md:flex-1 md:min-w-0 flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border border-[#fa8112]/30 bg-[#faf3e1] min-h-0">
                        <h4 className="w-full text-[11px] sm:text-[12px] font-bold text-[#222222] mb-1 text-center">
                          2nd document — back OCR scan
                        </h4>

                        {docBackCameraActive ? (
                          <div className="w-full max-w-sm space-y-2 animate-in fade-in zoom-in-95">
                            <div className="relative aspect-[4/3] max-h-[200px] sm:max-h-[220px] bg-black rounded-lg overflow-hidden shadow border border-white">
                              <video
                                ref={docBackVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover scale-[1.4]"
                              />
                              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-2 border-white/50 border-dashed aspect-[1.6/1] rounded-lg pointer-events-none"></div>
                              {backOcrLoading && (
                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-6 transition-all animate-in fade-in">
                                  <div className="w-full max-w-[160px] h-1.5 bg-white/20 rounded-full overflow-hidden mb-3 relative">
                                    <div
                                      className="h-full bg-[#fa8112] transition-all duration-300"
                                      style={{ width: `${backOcrProgress}%` }}
                                    ></div>
                                  </div>
                                  <p className="text-white text-[12px] font-bold animate-pulse">
                                    Scanning... {backOcrProgress}%
                                  </p>
                                  <div className="absolute left-0 right-0 h-0.5 bg-[#fa8112] shadow-[0_0_10px_#fa8112] blur-[1px] animate-[scan_2s_infinite]"></div>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={stopDocBackCamera}
                                className="flex-1 py-2 text-[12px] bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={captureDocBackPhoto}
                                disabled={backOcrLoading}
                                className="flex-[2] py-2 text-[12px] bg-[#fa8112] text-white rounded-lg font-semibold shadow flex items-center justify-center gap-1.5 active:scale-95"
                              >
                                {backOcrLoading ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Camera size={16} />
                                )}
                                {backOcrLoading ? "Scanning..." : "Capture & Scan"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center group w-full">
                            <div
                              className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow mb-3 cursor-pointer hover:scale-105 transition-all border border-orange-100 group-hover:border-[#fa8112]"
                              onClick={startDocBackCamera}
                            >
                              {backOcrLoading ? (
                                <Loader2
                                  className="animate-spin text-[#fa8112]"
                                  size={24}
                                />
                              ) : docBack ? (
                                <Check size={24} className="text-green-600" />
                              ) : (
                                <Camera size={24} className="text-[#fa8112]" />
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 text-center mb-3 px-1">
                              Camera or gallery to scan the back side (address &amp; pincode).
                            </p>
                            <div className="flex gap-2 w-full text-[12px] justify-center flex-wrap">
                              <button
                                type="button"
                                onClick={startDocBackCamera}
                                className="px-3 py-2 bg-[#fa8112] text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 shadow-sm hover:bg-[#e47510] transition-all"
                              >
                                <Camera size={13} /> Camera
                              </button>
                              <button
                                type="button"
                                onClick={() => backOcrFileInputRef.current?.click()}
                                className="px-3 py-2 bg-white border border-[#fa8112] text-[#fa8112] rounded-lg font-semibold flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-all"
                              >
                                <UploadCloud size={13} /> Gallery
                              </button>
                            </div>
                            {docBack && (
                              <p className="text-[11px] text-green-700 mt-2 text-center truncate max-w-full px-2">
                                {docBack.name}
                              </p>
                            )}
                          </div>
                        )}
                        <canvas ref={docBackCanvasRef} className="hidden" />
                        <input
                          ref={backOcrFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleBackScanImage}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="fullName"
                          value={familyHead.fullName}
                          onChange={handleHeadChange}
                          placeholder="As per identity document"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                        />
                        {renderHeadDuplicateHint(headNameDuplicate, "name")}
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Date of Birth <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            name="dob"
                            value={familyHead.dob}
                            max={maxDobForAdult}
                            onChange={handleHeadChange}
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Gender <span className="text-red-500">*</span>
                        </label>
                        <select
                          name="gender"
                          value={familyHead.gender}
                          onChange={handleHeadChange}
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full md:max-w-md border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors appearance-none bg-white"
                        >
                          <option value="">Select gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Address <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          name="address"
                          value={familyHead.address}
                          onChange={handleHeadChange}
                          placeholder="House no., street, district, state"
                          rows={2}
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Pincode <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="pincode"
                          value={familyHead.pincode}
                          onChange={handleHeadChange}
                          placeholder="6-digit pincode"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Contact Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          name="contactNumber"
                          value={familyHead.contactNumber}
                          onChange={handleHeadChange}
                          placeholder="10-digit mobile number"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                        />
                        {renderHeadDuplicateHint(
                          headPhoneDuplicate,
                          "phone number",
                        )}
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Alternate Number
                        </label>
                        <input
                          type="tel"
                          name="alternateContact"
                          value={familyHead.alternateContact || ""}
                          onChange={handleHeadChange}
                          placeholder="10-digit mobile no. (optional)"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Aadhaar Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="aadhaarNumber"
                          value={familyHead.aadhaarNumber}
                          onChange={handleHeadChange}
                          placeholder="Aadhaar number"
                          autoComplete="off"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                        />
                        {renderHeadDuplicateHint(
                          headAadhaarDuplicate,
                          "Aadhaar number",
                        )}
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Religion
                        </label>
                        <select
                          name="religion"
                          value={familyHead.religion || ""}
                          onChange={handleHeadChange}
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors appearance-none bg-white"
                        >
                          <option value="">Select Religion</option>
                          <option value="Hinduism">Hinduism</option>
                          <option value="Islam">Islam</option>
                          <option value="Christianity">Christianity</option>
                          <option value="Sikhism">Sikhism</option>
                          <option value="Buddhism">Buddhism</option>
                          <option value="Jainism">Jainism</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[14px] text-[#222222] font-bold mb-1 block font-inter">
                          Email
                        </label>
                        <input
                          type="email"
                          name="emailAddress"
                          value={familyHead.emailAddress}
                          onChange={handleHeadChange}
                          placeholder="Email address"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: MEMBERS */}
                {currentStep === 2 && (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <p className="text-[14px] text-gray-500 mb-4">
                      Family Head + Additional Members{" "}
                      <span className="font-bold text-[#222222]">
                        {totalMembersCount}/7
                      </span>{" "}
                    </p>

                    {/* Tabs — Family Head + added members only (Add Member is below the form) */}
                    <div className="flex flex-wrap gap-3 mb-5">
                      <button
                        type="button"
                        onClick={() => setActiveMemberTab(0)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all text-[15px] font-medium ${
                          activeMemberTab === 0
                            ? "border-gray-300 text-gray-800 bg-gray-50"
                            : "border-gray-200 text-[#666666] hover:bg-gray-50 bg-white"
                        }`}
                      >
                        Family Head
                      </button>

                      {members.map((member, idx) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => setActiveMemberTab(idx + 1)}
                          className={`group flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all text-[15px] font-medium relative ${
                            activeMemberTab === idx + 1
                              ? "border-[#FA8112] text-[#FA8112] bg-[#FA8112]/5"
                              : "border-gray-200 text-[#FA8112] hover:bg-[#FA8112]/5"
                          }`}
                        >
                          <User size={18} />
                          {member.fullName || `Member ${idx + 1}`}

                          {/* Cut Icon always visible as per design */}
                          <div
                            className={`ml-1 flex items-center justify-center rounded-full p-0.5 transition-colors ${
                              activeMemberTab === idx + 1
                                ? "bg-red-50 text-red-500 border border-red-200 hover:bg-red-100"
                                : "text-[#A0AAB4] hover:text-red-500"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMember(idx);
                            }}
                          >
                            <CloseIcon size={14} strokeWidth={2.5} />
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Form Content Based on Tab */}
                    <div className="bg-[#FAF3E1] rounded-lg p-3 px-4 flex items-center gap-3 border-l-4 border-[#FA8112] mb-5">
                      <User size={20} className="text-[#222222]" />
                      <h3 className="font-semibold text-[#222222]">
                        {activeMemberTab === 0
                          ? "Family Head Details"
                          : `Member ${activeMemberTab} Details`}
                      </h3>
                    </div>

                    {activeMemberTab === 0 ? (
                      /* Display Head Details inside Step 3 (Editable or just reflecting) */
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 opacity-90">
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Full Name
                          </label>
                          <input
                            type="text"
                            name="fullName"
                            value={familyHead.fullName}
                            onChange={handleHeadChange}
                            placeholder="As per identity document"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                          />
                          {renderHeadDuplicateHint(headNameDuplicate, "name")}
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Date of Birth
                          </label>
                          <div className="relative">
                            <input
                              type="date"
                              name="dob"
                              value={familyHead.dob}
                              max={maxDobForAdult}
                              onChange={handleHeadChange}
                              style={{ fontFamily: "'Inter', sans-serif" }}
                              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                            />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Gender
                          </label>
                          <select
                            name="gender"
                            value={familyHead.gender}
                            onChange={handleHeadChange}
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full md:max-w-md border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] appearance-none bg-white"
                          >
                            <option value="">Select gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Address
                          </label>
                          <textarea
                            name="address"
                            value={familyHead.address}
                            onChange={handleHeadChange}
                            placeholder="House no., street, district, state"
                            rows={2}
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] resize-none"
                          />
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Pincode
                          </label>
                          <input
                            type="text"
                            name="pincode"
                            value={familyHead.pincode}
                            onChange={handleHeadChange}
                            placeholder="6-digit pincode"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                          />
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Contact Number
                          </label>
                          <input
                            type="tel"
                            name="contactNumber"
                            value={familyHead.contactNumber}
                            onChange={handleHeadChange}
                            placeholder="10-digit mobile number"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                          />
                          {renderHeadDuplicateHint(
                            headPhoneDuplicate,
                            "phone number",
                          )}
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Aadhaar Number
                          </label>
                          <input
                            type="text"
                            name="aadhaarNumber"
                            value={familyHead.aadhaarNumber}
                            onChange={handleHeadChange}
                            placeholder="12-digit Aadhaar number"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                          />
                          {renderHeadDuplicateHint(
                            headAadhaarDuplicate,
                            "Aadhaar number",
                          )}
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Email
                          </label>
                          <input
                            type="email"
                            name="emailAddress"
                            value={familyHead.emailAddress}
                            onChange={handleHeadChange}
                            placeholder="Email address"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                          />
                        </div>
                      </div>
                    ) : (
                      /* Display Active Member Fields */
                      <div
                        className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3"
                        key={`member-${activeMemberTab}`}
                      >
                        {/* Member Scanning UI */}
                        {memberScanningIndex === activeMemberTab - 1 && (
                          <div className="md:col-span-2 bg-orange-50 border border-[#FBD7B0] rounded-lg p-3 mb-3">
                            {memberCameraActive ? (
                              <div className="space-y-3">
                                <div className="relative w-full overflow-hidden rounded-lg">
                                  <video
                                    ref={memberVideoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full rounded-lg border border-[#F6B579] max-h-64 object-cover scale-[1.4]"
                                  />
                                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/50 border-dashed aspect-[1.6/1] w-[70%] rounded-lg pointer-events-none" />
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button
                                    onClick={captureMemberPhoto}
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-[#FA8112] text-white rounded-lg hover:bg-[#E47510] font-semibold text-[10px] sm:text-[13px] leading-tight"
                                  >
                                    {memberOcrLoading ? (
                                      <Loader2
                                        className="animate-spin"
                                        size={16}
                                      />
                                    ) : (
                                      <Check size={16} />
                                    )}{" "}
                                    Capture
                                  </button>
                                  <button
                                    onClick={() => stopMemberCamera()}
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 font-semibold text-[10px] sm:text-[13px] leading-tight"
                                  >
                                    <X size={16} /> Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {memberOcrLoading || memberScanProgress > 0 ? (
                                  <div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                      <div
                                        className="bg-[#FA8112] h-2 rounded-full transition-all"
                                        style={{
                                          width: `${memberOcrLoading ? memberScanProgress : memberScanProgress}%`,
                                        }}
                                      />
                                    </div>
                                    <p className="text-[10px] text-gray-600 mt-1">
                                      Scanning: {memberScanProgress}%
                                    </p>
                                  </div>
                                ) : null}
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button
                                    onClick={() =>
                                      startMemberCamera(activeMemberTab - 1)
                                    }
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-[#FA8112] text-white rounded-lg hover:bg-[#E47510] font-semibold text-[10px] sm:text-[13px] leading-tight"
                                  >
                                    <Camera size={16} /> Use Camera
                                  </button>
                                  <button
                                    onClick={() =>
                                      memberInputRef.current?.click()
                                    }
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-[#FA8112] text-white rounded-lg hover:bg-[#E47510] font-semibold text-[10px] sm:text-[13px] leading-tight"
                                  >
                                    <UploadCloud size={16} /> Upload Photo
                                  </button>
                                </div>
                                <input
                                  ref={memberInputRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    handleMemberScanImage(
                                      e,
                                      activeMemberTab - 1,
                                    )
                                  }
                                  style={{ display: "none" }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Full Name
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              name="fullName"
                              value={members[activeMemberTab - 1].fullName}
                              onChange={(e) =>
                                handleMemberChange(activeMemberTab - 1, e)
                              }
                              placeholder="Full Name"
                              style={{ fontFamily: "'Inter', sans-serif" }}
                              className="order-2 sm:order-1 w-full sm:flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                            />
                            {memberScanningIndex !== activeMemberTab - 1 && (
                              <button
                                onClick={() => {
                                  stopMemberCamera();
                                  setMemberScanProgress(0);
                                  setMemberScanningIndex(activeMemberTab - 1);
                                }}
                                className="order-1 sm:order-2 w-full sm:w-auto px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                                title="Scan member ID"
                              >
                                <ScanLine
                                  size={18}
                                  className="text-[#fa8112]"
                                />
                              </button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Relation
                          </label>
                          <select
                            name="relation"
                            value={members[activeMemberTab - 1].relation}
                            onChange={(e) =>
                              handleMemberChange(activeMemberTab - 1, e)
                            }
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] appearance-none bg-white"
                          >
                            <option value="">Select Relation</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Son">Son</option>
                            <option value="Daughter">Daughter</option>
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Brother">Brother</option>
                            <option value="Sister">Sister</option>
                           
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Age
                          </label>
                          <input
                            type="number"
                            name="age"
                            value={members[activeMemberTab - 1].age}
                            onChange={(e) => {
                              const val = e.target.value
                                .replace(/\D/g, "")
                                .slice(0, 3);
                              handleMemberChange(activeMemberTab - 1, {
                                target: { name: "age", value: val },
                              });
                            }}
                            placeholder="Age"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112]"
                          />
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Document Type
                          </label>
                          <select
                            name="documentType"
                            value={
                              members[activeMemberTab - 1]?.documentType ||
                              "Aadhaar"
                            }
                            onChange={(e) =>
                              handleMemberChange(activeMemberTab - 1, e)
                            }
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] appearance-none bg-white"
                          >
                            <option value="Aadhaar">Aadhaar</option>
                            <option value="PAN">PAN</option>
                            <option value="Birth Certificate">
                              Birth Certificate
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[14px] text-[#222222] font-medium mb-1 block font-inter">
                            Document ID
                          </label>
                          <input
                            type="text"
                            inputMode={
                              members[activeMemberTab - 1]?.documentType ===
                                "Aadhaar" ||
                              !members[activeMemberTab - 1]?.documentType
                                ? "numeric"
                                : "text"
                            }
                            name="documentId"
                            value={
                              members[activeMemberTab - 1]?.documentId ?? ""
                            }
                            onChange={(e) =>
                              handleMemberChange(activeMemberTab - 1, e)
                            }
                            placeholder={
                              members[activeMemberTab - 1]?.documentType ===
                              "PAN"
                                ? "PAN Number"
                                : members[activeMemberTab - 1]?.documentType ===
                                    "Birth Certificate"
                                  ? "Certificate Number"
                                  : "12-digit Aadhaar number"
                            }
                            maxLength={
                              members[activeMemberTab - 1]?.documentType ===
                                "Aadhaar" ||
                              !members[activeMemberTab - 1]?.documentType
                                ? 12
                                : 20
                            }
                            style={{ fontFamily: "'Inter', sans-serif" }}
                            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-[15px] outline-none focus:border-[#FA8112] uppercase"
                          />
                        </div>
                      </div>
                    )}

                    {totalMembersCount < 8 && (
                      <div
                        ref={addMemberScrollAnchorRef}
                        className="mt-8 pt-5 border-t border-[#fa8112]/25 flex flex-col items-center gap-3 pb-4"
                      >
                        <p className="text-[13px] text-[#666666] text-center max-w-md">
                          Optional: add parents, spouse, or children on the same
                          card.
                        </p>
                        <button
                          type="button"
                          onClick={addMember}
                          className="flex items-center justify-center gap-2 w-full max-w-sm px-4 sm:px-6 py-3 rounded-full border-2 border-dashed border-[#FA8112] text-[#FA8112] bg-[#FA8112]/5 hover:bg-[#FA8112]/10 transition-all text-[10px] sm:text-[15px] font-semibold shadow-sm leading-tight"
                        >
                          <Plus size={18} />
                          Add Member
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Member scanning canvas - hidden */}
                <canvas ref={memberCanvasRef} style={{ display: "none" }} />

                {/* STEP 3: REVIEW */}
                {currentStep === 3 && (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Card Preview Section */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
                      <div className="flex justify-between items-center p-4 bg-gray-50 border-b border-gray-200">
                        <h4 className="font-bold text-[#222222] text-[15px]">
                          Card Preview
                        </h4>
                      </div>
                      <div className="p-4 sm:p-6 flex items-center justify-center bg-[#fcfcfc]">
                        <div className="w-full max-w-[480px]">
                          <AyushCardPreview
                            data={cardPreviewData}
                            side="front"
                          />
                        </div>
                      </div>
                      <div className="p-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-5 gap-4 bg-white">
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase">
                            Head Name
                          </p>
                          <p className="text-[14px] font-bold text-[#222222] truncate">
                            {familyHead.fullName || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase">
                            Aadhaar No
                          </p>
                          <p className="text-[14px] font-bold text-[#222222] truncate">
                            {familyHead.aadhaarNumber || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase">
                            Contact
                          </p>
                          <p className="text-[14px] font-bold text-[#222222] truncate">
                            {familyHead.contactNumber || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase">
                            Members
                          </p>
                          <p className="text-[14px] font-bold text-[#222222]">
                            {totalMembersCount}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold text-gray-400 uppercase">
                            Amount
                          </p>
                          <p className="text-[14px] font-bold text-[#fa8112]">
                            ₹{estimatedFee}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#FAF3E1] rounded-lg p-3 px-4 flex items-center gap-3 border-l-4 border-[#FA8112] mb-2">
                      <User size={20} className="text-[#222222]" />
                      <h3 className="font-semibold text-[#222222]">
                        Review Your Application
                      </h3>
                    </div>
                    <p className="text-[14px] text-gray-500 mb-6">
                      Please verify all details before final submission
                    </p>

                    <div className="space-y-4">
                      {/* Head Review Card */}
                      <div className="bg-white p-5 rounded-xl border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-3">
                            <User size={20} className="text-[#222222]" />
                            <h4 className="text-[16px] font-bold text-[#222222]">
                              Family Head Details
                            </h4>
                          </div>
                          <button
                            onClick={() => setIsEditingReview(!isEditingReview)}
                            className={`text-[14px] font-semibold underline underline-offset-2 transition-colors ${isEditingReview ? "text-green-600 decoration-green-600" : "text-[#222222] decoration-[#222222] hover:text-[#FA8112] hover:decoration-[#FA8112]"}`}
                          >
                            {isEditingReview ? "Done" : "Edit"}
                          </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-4 mb-6 md:overflow-x-auto md:pb-2 md:custom-scrollbar">
                          {/* 1. Family head photo */}
                          <div className="shrink-0 flex flex-col gap-2">
                            <div className="w-full md:w-[240px] h-[150px] bg-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden group">
                              {headImage ? (
                                <>
                                  <div className="relative w-full h-full group">
                                    <img
                                      src={headImage}
                                      alt="Head"
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const win = window.open();
                                          win.document.write(
                                            `<img src="${headImage}" />`,
                                          );
                                        }}
                                        className="bg-white/90 hover:bg-white text-[#222222] p-1.5 rounded-full shadow-lg transition-all"
                                        title="View Photo"
                                      >
                                        <ScanLine size={16} />
                                      </button>
                                    </div>
                                  </div>
                                  {isEditingReview && (
                                    <button
                                      type="button"
                                      onClick={() => setHeadImage(null)}
                                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                                    >
                                      <CloseIcon size={14} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    headImageInputRef.current?.click()
                                  }
                                  className="w-full h-full flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors"
                                >
                                  <UploadCloud size={24} className="mb-2" />
                                  <span className="text-xs">Upload Photo</span>
                                </button>
                              )}
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold text-[#222222]">
                                Family Head Photo
                              </p>
                              <p className="text-[12px] text-gray-500">
                                &nbsp;
                              </p>
                            </div>
                          </div>

                          {/* 2. First document (OCR) */}
                          <div className="shrink-0 flex flex-col gap-2">
                            <div className="w-full md:w-[240px] h-[150px] bg-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden group">
                              {docFront ? (
                                <>
                                  {docFront.url ? (
                                    <div className="relative w-full h-full group">
                                      <img
                                        src={docFront.url}
                                        className="w-full h-full object-cover"
                                        alt="Document"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(docFront.url, "_blank");
                                          }}
                                          className="bg-white/90 hover:bg-white text-[#222222] p-1.5 rounded-full shadow-lg transition-all"
                                          title="View Document"
                                        >
                                          <ScanLine size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-gray-500 flex flex-col items-center">
                                      <FileText size={32} className="mb-2" />
                                      <span className="text-xs truncate w-[140px] text-center">
                                        {docFront.name}
                                      </span>
                                    </div>
                                  )}
                                  {isEditingReview && (
                                    <button
                                      type="button"
                                      onClick={() => setDocFront(null)}
                                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                                    >
                                      <CloseIcon size={14} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    ocrFileInputRef.current?.click()
                                  }
                                  className="w-full h-full flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors"
                                >
                                  <UploadCloud size={24} className="mb-2" />
                                  <span className="text-xs">OCR scan</span>
                                </button>
                              )}
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold text-[#222222]">
                                1st document (OCR)
                              </p>
                              <p className="text-[12px] text-gray-500">
                                Name, DOB, gender &amp; Aadhaar only
                              </p>
                            </div>
                          </div>

                          {/* 3. Second document (upload) */}
                          <div className="shrink-0 flex flex-col gap-2">
                            <div className="w-full md:w-[240px] h-[150px] bg-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden group">
                              {docBack ? (
                                <>
                                  {docBack.url ? (
                                    <div className="relative w-full h-full group">
                                      <img
                                        src={docBack.url}
                                        className="w-full h-full object-cover"
                                        alt="Second document"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(docBack.url, "_blank");
                                          }}
                                          className="bg-white/90 hover:bg-white text-[#222222] p-1.5 rounded-full shadow-lg transition-all"
                                          title="View Document"
                                        >
                                          <ScanLine size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-gray-500 flex flex-col items-center">
                                      <FileText size={32} className="mb-2" />
                                      <span className="text-xs truncate w-[140px] text-center">
                                        {docBack.name}
                                      </span>
                                    </div>
                                  )}
                                  {isEditingReview && (
                                    <button
                                      type="button"
                                      onClick={() => setDocBack(null)}
                                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                                    >
                                      <CloseIcon size={14} />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => docBackCameraInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-[#fa8112] text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 shadow-sm hover:bg-[#e47510] transition-all text-xs w-24"
                                  >
                                    <Camera size={12} /> Camera
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => docBackInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all text-xs w-24"
                                  >
                                    <UploadCloud size={12} /> Gallery
                                  </button>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold text-[#222222]">
                                2nd document (back OCR)
                              </p>
                              <p className="text-[12px] text-gray-500">
                                Scan back — fills address &amp; pincode
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                          <div>
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Full Name
                            </p>
                            {isEditingReview ? (
                              <input
                                type="text"
                                name="fullName"
                                value={familyHead.fullName}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.fullName || "—"}
                              </p>
                            )}
                            {renderHeadDuplicateHint(headNameDuplicate, "name")}
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Date of Birth
                            </p>
                            {isEditingReview ? (
                              <input
                                type="date"
                                name="dob"
                                value={familyHead.dob}
                                max={maxDobForAdult}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.dob || "YYYY-MM-DD"}
                              </p>
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Gender
                            </p>
                            {isEditingReview ? (
                              <select
                                name="gender"
                                value={familyHead.gender}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              >
                                <option value="">Select Gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.gender || "—"}
                              </p>
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Address
                            </p>
                            {isEditingReview ? (
                              <textarea
                                name="address"
                                value={familyHead.address}
                                onChange={handleHeadChange}
                                rows={2}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222] resize-none"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] w-full pr-2 line-clamp-3">
                                {familyHead.address || "—"}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Pincode
                            </p>
                            {isEditingReview ? (
                              <input
                                type="text"
                                name="pincode"
                                value={familyHead.pincode}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.pincode || "—"}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Contact
                            </p>
                            {isEditingReview ? (
                              <input
                                type="tel"
                                name="contactNumber"
                                value={familyHead.contactNumber}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.contactNumber || "—"}
                              </p>
                            )}
                            {renderHeadDuplicateHint(
                              headPhoneDuplicate,
                              "phone number",
                            )}
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Aadhaar Number
                            </p>
                            {isEditingReview ? (
                              <input
                                type="text"
                                name="aadhaarNumber"
                                value={familyHead.aadhaarNumber}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.aadhaarNumber || "—"}
                              </p>
                            )}
                            {renderHeadDuplicateHint(
                              headAadhaarDuplicate,
                              "Aadhaar number",
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              Email
                            </p>
                            {isEditingReview ? (
                              <input
                                type="email"
                                name="emailAddress"
                                value={familyHead.emailAddress}
                                onChange={handleHeadChange}
                                className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                              />
                            ) : (
                              <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                {familyHead.emailAddress || "—"}
                              </p>
                            )}
                          </div>
                        </div>

                        {isEditingReview && (
                          <div className="mt-8 flex justify-center">
                            <button
                              onClick={() => setIsEditingReview(false)}
                              className="bg-[#fa8112] text-white px-8 py-2 rounded-lg font-bold hover:bg-[#e0700d] transition-colors shadow-md"
                            >
                              Save Changes
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Add Member details in Review */}
                      {members.length > 0 && (
                        <div className="bg-white p-5 rounded-xl border border-gray-100 mt-6">
                          <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                              <User size={20} className="text-[#222222]" />
                              <h4 className="text-[16px] font-bold text-[#222222]">
                                Members ({members.length})
                              </h4>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {members.map((member, idx) => (
                              <div
                                key={idx}
                                className="bg-white p-4 rounded-xl border border-gray-200"
                              >
                                <h4 className="font-bold text-[#222222] mb-4 pb-2 border-b border-gray-100 uppercase tracking-wider text-[11px]">
                                  Member {idx + 1}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                  <div>
                                    <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                                      Member Name
                                    </p>
                                    {isEditingReview ? (
                                      <input
                                        type="text"
                                        name="fullName"
                                        value={member.fullName}
                                        onChange={(e) =>
                                          handleMemberChange(idx, e)
                                        }
                                        className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                                      />
                                    ) : (
                                      <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                        {member.fullName || "—"}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                                      Relation
                                    </p>
                                    {isEditingReview ? (
                                      <select
                                        name="relation"
                                        value={member.relation}
                                        onChange={(e) =>
                                          handleMemberChange(idx, e)
                                        }
                                        className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222] bg-white"
                                      >
                                        <option value="">
                                          Select Relation
                                        </option>
                                        <option value="Spouse">Spouse</option>
                                        <option value="Son">Son</option>
                                        <option value="Daughter">
                                          Daughter
                                        </option>
                                        <option value="Father">Father</option>
                                        <option value="Mother">Mother</option>
                                        <option value="Brother">Brother</option>
                                        <option value="Sister">Sister</option>
                                        <option value="Other">Other</option>
                                      </select>
                                    ) : (
                                      <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                        {member.relation || "—"}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                                      Age
                                    </p>
                                    {isEditingReview ? (
                                      <input
                                        type="number"
                                        name="age"
                                        value={member.age}
                                        onChange={(e) => {
                                          const val = e.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 3);
                                          handleMemberChange(idx, {
                                            target: { name: "age", value: val },
                                          });
                                        }}
                                        className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                                      />
                                    ) : (
                                      <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                        {member.age || "—"}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                                      {member.documentType || "Aadhaar"} ID
                                    </p>
                                    {isEditingReview ? (
                                      <input
                                        type="text"
                                        name="documentId"
                                        inputMode={
                                          !member.documentType ||
                                          member.documentType === "Aadhaar"
                                            ? "numeric"
                                            : "text"
                                        }
                                        maxLength={
                                          !member.documentType ||
                                          member.documentType === "Aadhaar"
                                            ? 12
                                            : 20
                                        }
                                        value={member.documentId ?? ""}
                                        onChange={(e) =>
                                          handleMemberChange(idx, e)
                                        }
                                        className="w-full border-b border-gray-300 focus:border-[#fa8112] outline-none py-1 text-[14px] font-semibold text-[#222222]"
                                      />
                                    ) : (
                                      <p className="text-[14px] font-semibold text-[#222222] truncate w-full pr-2">
                                        {!member.documentType ||
                                        member.documentType === "Aadhaar"
                                          ? member.documentId?.replace(
                                              /(\d{4})(?=\d)/g,
                                              "$1 ",
                                            ) || "—"
                                          : member.documentId || "—"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-6 p-5 bg-blue-50 rounded-xl border border-blue-200">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            id="declaration-checkbox"
                            className="w-5 h-5 mt-0.5 cursor-pointer accent-[#fa8112]"
                            checked={declarationAccepted}
                            onChange={(e) =>
                              setDeclarationAccepted(e.target.checked)
                            }
                            required
                          />
                          <label
                            htmlFor="declaration-checkbox"
                            className="cursor-pointer flex-1"
                          >
                            <p className="text-[13px] text-blue-800 leading-relaxed">
                              I Declare That all the Information and Documents
                              Provided by Me to the Organization Regarding Me
                              and My Family are True and Correct. If Any Error,
                              Inaccuracy or Misleading Element is Found in this
                              Information in Future, Then it's Full Legal
                              Responsibility Will Be My Personal Responsibility.
                            </p>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* STEP 4: PAYMENT — admin/employee: offline (camera) + online */}
                {!skipPayment && currentStep === 4 && staffPaymentFlow && (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <canvas
                      ref={staffCashCanvasRef}
                      className="hidden"
                      aria-hidden
                    />
                    <div className="text-center mb-6">
                      <h3 className="font-black text-[22px] md:text-[24px] text-[#22333B] uppercase tracking-tight mb-2">
                        Payment
                      </h3>
                      <p className="text-[13px] text-gray-500">
                        Total payable:{" "}
                        <span className="font-bold text-[#fa8112]">
                          ₹{Number(estimatedFee).toFixed(2)}
                        </span>
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
                      <button
                        type="button"
                        onClick={handleStaffChooseOfflineCash}
                        disabled={staffCashCameraLoading}
                        className={`flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 transition-all shadow-sm disabled:opacity-60 ${
                          staffPaymentMode === "cash"
                            ? "border-[#fa8112] bg-orange-50 ring-2 ring-[#fa8112]/30"
                            : "border-gray-200 bg-white hover:border-[#fa8112]/50"
                        }`}
                      >
                        <Banknote className="w-10 h-10 text-[#fa8112]" />
                        <span className="font-bold text-[#22333B]">
                          Offline / Cash
                        </span>
                        <span className="text-[11px] text-gray-500 text-center leading-snug">
                          Opens your camera to capture the cash receipt
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStaffChooseOnline}
                        className={`flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 transition-all shadow-sm ${
                          staffPaymentMode === "online"
                            ? "border-[#fa8112] bg-orange-50 ring-2 ring-[#fa8112]/30"
                            : "border-gray-200 bg-white hover:border-[#fa8112]/50"
                        }`}
                      >
                        <span className="text-3xl" aria-hidden>
                          💳
                        </span>
                        <span className="font-bold text-[#22333B]">Online</span>
                        <span className="text-[11px] text-gray-500 text-center leading-snug">
                          Pay with Cashfree (UPI / card)
                        </span>
                      </button>
                    </div>


                    {staffPaymentMode === "cash" &&
                      staffCashReceiptImage &&
                      !staffCashCameraActive && (
                        <div className="max-w-md mx-auto mb-8 space-y-3">
                          <p className="text-sm font-semibold text-center text-green-700">
                            Cash receipt photo attached
                          </p>
                          <img
                            src={staffCashReceiptImage}
                            alt="Cash receipt"
                            className="w-full rounded-xl border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={handleStaffChooseOfflineCash}
                            className="w-full text-[#fa8112] font-semibold text-sm py-2"
                          >
                            Retake photo
                          </button>
                        </div>
                      )}

                    {staffPaymentMode === "online" && (
                      <div className="max-w-xl mx-auto">
                        {saveError && (
                          <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg mb-4 border border-red-100 w-full text-center">
                            {saveError}
                          </div>
                        )}

                        {txnId ? (
                          <div className="w-full flex flex-col gap-4 animate-in fade-in zoom-in duration-500">
                            <div className="border rounded-2xl p-6 flex flex-col items-center gap-3 bg-green-50 border-green-200">
                              <div className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg mb-1 bg-green-500">
                                <Check size={28} strokeWidth={3} />
                              </div>
                              <h3 className="text-lg font-bold text-green-700">
                                Payment verified
                              </h3>
                              <p className="text-[11px] text-center font-medium text-green-600">
                                Ref:{" "}
                                <span className="font-mono font-bold uppercase select-all tracking-wider">
                                  {txnId}
                                </span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => submitStaffApplication()}
                              disabled={submitting}
                              className="w-full bg-[#fa8112] hover:bg-[#e0720f] active:scale-95 text-white font-bold py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:active:scale-100"
                            >
                              {submitting ? (
                                <Loader2 className="animate-spin" size={24} />
                              ) : (
                                <>
                                  <CheckCircle2 size={24} />
                                  Submit application
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="w-full space-y-4">
                            {!orderId ? (
                              <button
                                type="button"
                                onClick={handleInitiateCashfreePayment}
                                disabled={onlinePaymentLoading}
                                className="w-full bg-[#fa8112] hover:bg-[#e0720f] active:scale-95 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:active:scale-100"
                              >
                                {onlinePaymentLoading ? (
                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <span className="text-xl">💳</span>
                                )}
                                {onlinePaymentLoading
                                  ? "Preparing gateway..."
                                  : "Pay with Cashfree"}
                              </button>
                            ) : (
                              <div className="w-full space-y-4">
                                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center gap-2">
                                  <div className="flex items-center gap-2 text-[#fa8112] font-bold text-sm">
                                    <span className="w-2 h-2 rounded-full bg-[#fa8112] animate-pulse" />
                                    Awaiting payment…
                                  </div>
                                  <p className="text-[10px] text-gray-500 text-center font-mono">
                                    OrderId: {orderId}
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setOrderId(null)}
                                    className="py-3 border border-gray-300 rounded-xl text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                                  >
                                    Retry
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleVerifyCashfreePayment()
                                    }
                                    disabled={verifyLoading}
                                    className="py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
                                  >
                                    {verifyLoading ? (
                                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      "Verify"
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="pt-6 border-t border-gray-50 flex items-center justify-center gap-6 grayscale opacity-40">
                              <img
                                src="https://www.cashfree.com/wp-content/uploads/2022/10/cashfree-logo.png"
                                className="h-4"
                                alt="Cashfree"
                              />
                              <div className="h-4 w-px bg-gray-200" />
                              <div className="flex gap-2">
                                <span className="text-[9px] font-bold text-gray-400">
                                  UPI
                                </span>
                                <span className="text-[9px] font-bold text-gray-400">
                                  CARDS
                                </span>
                                <span className="text-[9px] font-bold text-gray-400">
                                  NETBANKING
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* STEP 4: PAYMENT — public (online only) */}
                {!skipPayment && currentStep === 4 && !staffPaymentFlow && (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-center mb-8">
                      <h3 className="font-black text-[22px] md:text-[24px] text-[#22333B] uppercase tracking-tight mb-2">
                        Complete Online Payment
                      </h3>
                      <p className="text-[13px] text-gray-500">
                        Total Payable Amount:{" "}
                        <span className="font-bold text-[#fa8112]">
                          ₹{Number(estimatedFee).toFixed(2)}
                        </span>
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-6 mb-8 max-w-2xl mx-auto">
                      <div className="group border-2 rounded-[32px] p-6 sm:p-8 bg-white transition-all flex flex-col sm:flex-row items-center gap-6 border-[#fa8112] shadow-2xl">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-50 rounded-3xl flex items-center justify-center text-[#fa8112] group-hover:bg-[#fa8112] group-hover:text-white transition-all shadow-inner shrink-0">
                          <span className="text-2xl">💳</span>
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                          <h4 className="font-bold text-[#22333B] text-[18px] sm:text-[20px] mb-1">
                            Online Payment
                          </h4>
                          <p className="text-gray-500 text-[13px] sm:text-[14px] leading-relaxed">
                            UPI, GPay, or Cards.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="max-w-xl mx-auto">
                      {saveError && (
                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg mb-4 border border-red-100 w-full text-center">
                          {saveError}
                        </div>
                      )}

                      {txnId ? (
                        <div className="w-full flex flex-col gap-4 animate-in fade-in zoom-in duration-500">
                          <div
                            className={`border rounded-2xl p-6 flex flex-col items-center gap-3 ${
                              txnId
                                ? "bg-green-50 border-green-200"
                                : "bg-orange-50 border-orange-200"
                            }`}
                          >
                            <div
                              className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg mb-1 ${
                                txnId ? "bg-green-500" : "bg-orange-500"
                              }`}
                            >
                              <Check size={28} strokeWidth={3} />
                            </div>
                            <h3
                              className={`text-lg font-bold ${
                                txnId ? "text-green-700" : "text-orange-700"
                              }`}
                            >
                              Payment Verified!
                            </h3>
                            <p className="text-[11px] text-center font-medium text-green-600">
                              Ref:{" "}
                              <span className="font-mono font-bold uppercase select-all tracking-wider">
                                {txnId}
                              </span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => submitFinalApplication(txnId)}
                            disabled={submitting}
                            className="w-full bg-[#fa8112] hover:bg-[#e0720f] active:scale-95 text-white font-bold py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:active:scale-100"
                          >
                            {submitting ? (
                              <Loader2 className="animate-spin" size={24} />
                            ) : (
                              <>
                                <CheckCircle2 size={24} />
                                Complete Registration
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="w-full space-y-4">
                          {!orderId ? (
                            <button
                              type="button"
                              onClick={handleInitiateCashfreePayment}
                              disabled={onlinePaymentLoading}
                              className="w-full bg-[#fa8112] hover:bg-[#e0720f] active:scale-95 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:active:scale-100"
                            >
                              {onlinePaymentLoading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span className="text-xl">💳</span>
                              )}
                              {onlinePaymentLoading
                                ? "Preparing Gateway..."
                                : "Pay with Cashfree"}
                            </button>
                          ) : (
                            <div className="w-full space-y-4">
                              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 text-[#fa8112] font-bold text-sm">
                                  <span className="w-2 h-2 rounded-full bg-[#fa8112] animate-pulse"></span>
                                  Awaiting Payment...
                                </div>
                                <p className="text-[10px] text-gray-500 text-center font-mono">
                                  OrderId: {orderId}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  type="button"
                                  onClick={() => setOrderId(null)}
                                  className="py-3 border border-gray-300 rounded-xl text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
                                >
                                  Retry
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVerifyCashfreePayment()}
                                  disabled={verifyLoading}
                                  className="py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
                                >
                                  {verifyLoading ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    "Verify"
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="pt-6 border-t border-gray-50 flex items-center justify-center gap-6 grayscale opacity-40">
                            <img
                              src="https://www.cashfree.com/wp-content/uploads/2022/10/cashfree-logo.png"
                              className="h-4"
                              alt="Cashfree"
                            />
                            <div className="h-4 w-px bg-gray-200" />
                            <div className="flex gap-2">
                              <span className="text-[9px] font-bold text-gray-400">
                                UPI
                              </span>
                              <span className="text-[9px] font-bold text-gray-400">
                                CARDS
                              </span>
                              <span className="text-[9px] font-bold text-gray-400">
                                NETBANKING
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-[#F5F5F5] p-4 border-t border-gray-100 flex items-center justify-between px-8 shrink-0">
                <div className="flex-1 flex justify-start">
                  {currentStep > 1 ? (
                    <button
                      onClick={handleBack}
                      className="flex items-center gap-2 bg-white border border-[#FA8112] text-[#FA8112] active:scale-95 font-medium px-6 py-2 rounded-full transition-all duration-300 hover:bg-[#FA8112]/5"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Back
                    </button>
                  ) : (
                    <p className="text-[15px] font-medium text-[#222222]">
                      Step {currentStep} of {footerStepMax}
                    </p>
                  )}
                </div>

                <div className="flex-1 justify-center hidden md:flex">
                  {currentStep > 1 && (
                    <p className="text-[14px] text-gray-500">
                      Step {currentStep} of {footerStepMax}
                    </p>
                  )}
                </div>

                <div className="flex-1 flex justify-end">
                  <button
                    onClick={handleNext}
                    disabled={submitting}
                    className="flex items-center gap-2 bg-[#fa8112] hover:bg-[#e0720f] shadow-md active:scale-95 text-white font-medium pl-6 pr-2 py-2 rounded-full transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? "Submitting..."
                      : skipPayment && currentStep === 3
                        ? "Submit"
                        : currentStep === 4
                          ? "Confirm"
                          : "Continue"}
                    <span className="flex items-center justify-center bg-white rounded-full w-8 h-8 ml-2">
                      {submitting ? (
                        <div className="w-4 h-4 border-2 border-[#fa8112] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ArrowRight className="w-5 h-5 text-[#fa8112]" />
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* STEP 5: SUCCESS / RECEIPT */
            <div className="flex-1 overflow-y-auto px-8 py-8 animate-in zoom-in-95 duration-500 bg-[#F9FAFB] custom-scrollbar">
              <style>{`
              @media print {
                @page { size: 2in auto; margin: 0; }
                body * { visibility: hidden !important; }
                .public-thermal-receipt-wrap, .public-thermal-receipt-wrap * { visibility: visible !important; }
                .public-thermal-receipt-wrap {
                  position: fixed !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 2in !important;
                  max-width: 2in !important;
                  margin: 0 !important;
                  padding: 6px !important;
                  display: block !important;
                  box-sizing: border-box !important;
                }
                .no-print-public { display: none !important; }
              }
            `}</style>

              {renderThermalReceipt()}

              <div
                id="public-application-receipt"
                className="max-w-md mx-auto bg-transparent no-print-public"
              >
                {/* Receipt Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                  <div className="bg-green-500 p-6 flex flex-col items-center">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                      <Check className="text-white w-6 h-6" strokeWidth={3} />
                    </div>
                    <h2 className="text-white text-xl font-bold">
                      {skipPayment || staffPaymentFlow
                        ? "Application Submitted"
                        : "Payment Successful"}
                    </h2>
                  </div>

                  <div className="p-6 space-y-4">
                    {!skipPayment && !staffPaymentFlow && (
                      <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                        <span className="text-gray-500 text-sm">
                          Amount Paid
                        </span>
                        <span className="text-xl font-bold text-[#222222]">
                          ₹
                          {submissionReceipt?.totalAmount != null &&
                          !Number.isNaN(Number(submissionReceipt.totalAmount))
                            ? Number(submissionReceipt.totalAmount)
                            : estimatedFee}
                          .00
                        </span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">
                          {skipPayment || staffPaymentFlow
                            ? "Application ID"
                            : "Transaction ID"}
                        </span>
                        <span className="font-semibold text-[#222222] uppercase">
                          {skipPayment || staffPaymentFlow
                            ? submissionReceipt?.applicationId != null
                              ? String(submissionReceipt.applicationId)
                              : applicationId
                            : txnId || "N/A"}
                        </span>
                      </div>
                      {staffPaymentFlow && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Payment</span>
                          <span className="font-semibold text-[#222222]">
                            {staffPaymentMode === "cash"
                              ? "Cash (receipt attached)"
                              : txnId
                                ? `Online · ${txnId}`
                                : "Online"}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-start gap-3 text-sm">
                        <span className="text-gray-500 shrink-0 pt-0.5">
                          {skipPayment || staffPaymentFlow
                            ? "Submitted"
                            : "Payment Date"}
                        </span>
                        <span className="font-semibold text-[#222222] text-right">
                          {(() => {
                            const rec = submissionReceipt;
                            const fullTs = rec?.createdAt || rec?.updatedAt;
                            const rawDs = rec?.applicationDate != null ? String(rec.applicationDate).trim() : "";
                            const d = fullTs
                              ? new Date(fullTs)
                              : rawDs.length > 10
                                ? new Date(rawDs.replace(/(Z|\+00:00)$/, ""))
                                : new Date();
                            return (
                              <>
                                <span className="block leading-snug">
                                  {d.toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                                <span className="block leading-snug">
                                  {d.toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </span>
                              </>
                            );
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Family Head</span>
                        <span className="font-semibold text-[#222222]">
                          {fullNameFromCardRecord(submissionReceipt) ||
                            familyHead.fullName}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Total Members</span>
                        <span className="font-semibold text-[#222222]">
                          {submissionReceipt?.totalMembers != null
                            ? Number(submissionReceipt.totalMembers)
                            : submissionReceipt?.totalMember != null
                              ? Number(submissionReceipt.totalMember)
                              : totalMembersCount}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-dashed border-gray-200">
                      <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
                        <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-blue-600 text-[10px] font-bold">
                            i
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed text-left">
                          Your application is under review. You will receive an
                          SMS and Email notification once your Ayush Card is
                          generated.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                  {!hasPrintableReceipt ? (
                    <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Receipt printing is available only after successful card
                      creation.
                    </p>
                  ) : null}

                  {hasPrintableReceipt && (
                    <div
                      className={`grid ${staffPaymentFlow ? "grid-cols-2" : "grid-cols-1"} gap-3`}
                    >
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3.5 px-3 rounded-xl transition-all shadow-sm text-sm whitespace-nowrap"
                      >
                        <Printer size={18} />
                        Print receipt
                      </button>
                      {staffPaymentFlow && (
                        <button
                          type="button"
                          onClick={handleRawBtPrint}
                          className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold py-3.5 px-3 rounded-xl transition-all shadow-sm text-sm whitespace-nowrap"
                        >
                          <Printer size={18} />
                          RawBT Print
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-[#fa8112] text-[#fa8112] hover:bg-orange-50 font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm"
                  >
                    <Plus size={18} />
                    Create another
                  </button>
                  <button
                    type="button"
                    onClick={variant === "page" && onBack ? onBack : onClose}
                    className="w-full flex items-center justify-center gap-2 bg-[#FA8112] hover:bg-[#e0720f] active:scale-95 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-md mt-1"
                  >
                    <ArrowLeft size={18} />
                    {variant === "page" ? "Back to list" : "Return to Home"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {staffCashCameraActive && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={stopStaffCashCamera}
              />
              <div className="relative w-full max-w-xl bg-white rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
                  <div>
                    <h3 className="text-xl font-bold text-[#222222]">Capture Cash Receipt</h3>
                    <p className="text-sm text-gray-500">Align the receipt within the frame</p>
                  </div>
                  <button 
                    onClick={stopStaffCashCamera}
                    className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Camera Container */}
                <div className="relative aspect-[4/3] bg-black">
                  <video
                    ref={staffCashVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Decorative corner borders */}
                  <div className="absolute inset-8 border-2 border-white/30 rounded-2xl pointer-events-none">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[#fa8112] rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[#fa8112] rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[#fa8112] rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[#fa8112] rounded-br-lg" />
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-gray-50 flex gap-3">
                  <button
                    type="button"
                    onClick={stopStaffCashCamera}
                    className="flex-1 px-6 py-4 border border-gray-200 bg-white rounded-2xl font-bold text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={captureStaffCashReceipt}
                    className="flex-[2] bg-[#fa8112] text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-[#e0720f] transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Camera size={20} />
                    Capture Photo
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AyushCardApplicationForm;
