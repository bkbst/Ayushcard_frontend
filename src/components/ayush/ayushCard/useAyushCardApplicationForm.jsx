import React, { useState, useRef, useEffect } from "react";
import HeadDuplicateHint from "./components/HeadDuplicateHint.jsx";
import { useToast } from "../../ui/Toast";
import apiService from "../../../api/service";
import {
  AADHAAR_OCR_LOW_CONFIDENCE_MSG,
  isValidAadhaarName,
} from "../../../utils/ocr";
import {
  mapFrontOcrApiResponse,
  normalizeOcrDobForDateInput,
  mapBackOcrApiResponse,
  getOcrApiErrorMessage,
  isOcrApiUnavailableError,
  startOcrProgressTicker,
} from "../../../utils/aadhaarOcrApi";
import {
  prepareOcrUploadFile,
  OCR_MAX_UPLOAD_BYTES,
} from "../../../utils/ocrUploadImage.js";
import {
  assessCaptureQuality,
  enhanceImageBlobForOcr,
} from "../../../utils/aadhaarOcrImage";
import {
  captureVideoScanFrame,
  optimizeImageForOcr,
} from "../../../utils/imageOptimizer";
import {
  attachStreamToVideo,
  detachVideoElement,
  getCameraErrorMessage,
  requestCameraStream,
  stopMediaStream,
} from "../../../utils/cameraStream";
import { load } from "@cashfreepayments/cashfree-js";
import { useAttendance } from "../../../context/AttendanceContext";
import { compressBase64Image } from "./compressBase64Image.js";
import {
  AYUSH_CARD_BASE_PACKAGE_RUPEES,
  AYUSH_CARD_INCLUDED_MEMBERS,
  AYUSH_CARD_EXTRA_MEMBER_RUPEES,
  HEAD_DUPLICATE_INITIAL,
} from "./constants.js";
import {
  computeAyushCardFeeRupees,
  splitFamilyHeadNameParts,
  extractCreatedCardRecord,
  generateApplicationId,
} from "./utils.js";
import {
  runRegistrationDuplicateChecks,
  hasBlockingDuplicateFromState,
} from "./registrationValidation.js";

export function useAyushCardApplicationForm({
  variant = "modal",
  isOpen = true,
  onClose = () => {},
  skipPayment = false,
  staffPaymentFlow = false,
  onStaffSubmit,
  onBack,
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [applicationId, setApplicationId] = useState(() =>
    generateApplicationId(),
  );
  /** Server `data` from last successful card create — drives receipt / print */
  const [submissionReceipt, setSubmissionReceipt] = useState(null);
  const { toastWarn, toastError, toastSuccess } = useToast();
  const { todayCampId, todayCampName } = useAttendance();
  const [submitting, setSubmitting] = useState(false);
  const [registrationCheckInProgress, setRegistrationCheckInProgress] =
    useState(false);
  const submissionCompletedRef = useRef(false);
  // Step 1 State
  const [docFront, setDocFront] = useState(null);
  /** 2nd identity document (separate supporting doc, no OCR) */
  const [docBack, setDocBack] = useState(null);
  /** 3rd — Aadhaar card back scan (address & pincode OCR) */
  const [docAadhaarBack, setDocAadhaarBack] = useState(null);
  const ocrFileInputRef = useRef(null);
  const aadhaarBackOcrInputRef = useRef(null);
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
  const [ocrStatusMessage, setOcrStatusMessage] = useState("");
  const [backOcrStatusMessage, setBackOcrStatusMessage] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const aadhaarBackVideoRef = useRef(null);
  const aadhaarBackCanvasRef = useRef(null);
  const aadhaarBackStreamRef = useRef(null);
  const [aadhaarBackCameraActive, setAadhaarBackCameraActive] = useState(false);
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
  const [memberCameraLoading, setMemberCameraLoading] = useState(false);
  const [memberCameraError, setMemberCameraError] = useState(null);
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
    submissionCompletedRef.current = false;
    setCurrentStep(1);
    setApplicationId(generateApplicationId());
    setSubmissionReceipt(null);
    setDocFront(null);
    setDocBack(null);
    setDocAadhaarBack(null);
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
    stopAadhaarBackCamera();
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
    setHeadPhoneDuplicate(HEAD_DUPLICATE_INITIAL);
    setHeadAadhaarDuplicate(HEAD_DUPLICATE_INITIAL);
    setHeadNameDuplicate(HEAD_DUPLICATE_INITIAL);
    setRegistrationCheckInProgress(false);
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
      if (aadhaarBackStreamRef.current) {
        aadhaarBackStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || currentStep !== 1) {
      stopCamera();
      stopHeadCamera();
      stopDocBackCamera();
      stopAadhaarBackCamera();
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
      aadhaarBackCameraActive &&
      aadhaarBackVideoRef.current &&
      aadhaarBackStreamRef.current
    ) {
      aadhaarBackVideoRef.current.srcObject = aadhaarBackStreamRef.current;
    }
  }, [aadhaarBackCameraActive]);

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
    if (!memberCameraActive || !memberStreamRef.current) return;

    let cancelled = false;
    const bindVideo = async () => {
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;
      const video = memberVideoRef.current;
      const stream = memberStreamRef.current;
      if (!video || !stream) return;
      await attachStreamToVideo(video, stream);
    };
    bindVideo();

    return () => {
      cancelled = true;
    };
  }, [memberCameraActive, memberScanningIndex]);

  useEffect(() => {
    if (memberScanningIndex === null) return;
    const expectedIndex = activeMemberTab - 1;
    if (activeMemberTab === 0 || memberScanningIndex !== expectedIndex) {
      stopMemberCamera({ resetScanningIndex: true });
    }
  }, [activeMemberTab]);

  useEffect(() => {
    return () => {
      stopMediaStream(memberStreamRef.current);
      memberStreamRef.current = null;
      detachVideoElement(memberVideoRef.current);
    };
  }, []);

  const startCamera = async () => {
    stopAadhaarBackCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      toastWarn("Could not access camera. Please use Gallery Upload.");
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
    if (!videoRef.current) return;

    setOcrLoading(true);
    setOcrProgress(0);
    const video = videoRef.current;

    let optimized;
    try {
      optimized = await captureVideoScanFrame(video, {
        maxWidth: 1400,
        quality: 0.9,
      });
    } catch (err) {
      console.error("Frame capture failed:", err);
      toastWarn("Could not capture image. Please try again.");
      setOcrLoading(false);
      return;
    }

    const quality = assessCaptureQuality(optimized.canvas);
    if (!quality.ok) {
      toastWarn(quality.message);
      setOcrLoading(false);
      return;
    }

    const base64 = optimized.dataUrl;
    let blob = optimized.blob;
    if (quality.softBlur) {
      try {
        blob = await enhanceImageBlobForOcr(blob);
        toastWarn(quality.message);
      } catch {
        /* use original capture */
      }
    }
    stopCamera();

    try {
      const results = await runFrontOcrForImage(blob, (p) => setOcrProgress(p));

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

      if (applyFrontOcrToFamilyHead(results)) {
        toastSuccess("Aadhaar details extracted successfully.");
      }
    } catch (err) {
      console.error("Capture OCR Error:", err);
      toastWarn(AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      setDocFront({
        name: "captured_id.jpg",
        size: "Live Capture",
        url: base64,
        base64: base64,
      });
    } finally {
      setOcrLoading(false);
      setOcrProgress(0);
      setOcrStatusMessage("");
    }
  };

  const stopAadhaarBackCamera = () => {
    if (aadhaarBackStreamRef.current) {
      aadhaarBackStreamRef.current.getTracks().forEach((track) => track.stop());
      aadhaarBackStreamRef.current = null;
    }
    if (aadhaarBackVideoRef.current) aadhaarBackVideoRef.current.srcObject = null;
    setAadhaarBackCameraActive(false);
  };

  const startAadhaarBackCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      aadhaarBackStreamRef.current = stream;
      setAadhaarBackCameraActive(true);
    } catch (err) {
      console.error("Aadhaar back camera error:", err);
      toastWarn("Could not access camera. Please use Gallery Upload.");
    }
  };

  const toOcrFile = (blob, defaultName = "aadhaar.jpg") => {
    if (blob instanceof File) return blob;
    return new File([blob], defaultName, {
      type: blob?.type || "image/jpeg",
    });
  };

  const runFrontOcrForImage = async (blob, onProgress) => {
    const file = toOcrFile(blob, "aadhaar_front.jpg");
    setOcrStatusMessage("Reading Aadhaar on server…");
    onProgress(10);
    const ticker = startOcrProgressTicker(onProgress, 10, 72);
    try {
      const raw = await apiService.ocrAadhaarFront(file);
      clearInterval(ticker);
      setOcrStatusMessage("");
      onProgress(92);
      return mapFrontOcrApiResponse(raw);
    } catch (apiErr) {
      clearInterval(ticker);
      setOcrStatusMessage("");
      throw apiErr;
    }
  };

  const runBackOcrForImage = async (blob, onProgress) => {
    const file = toOcrFile(blob, "aadhaar_back.jpg");
    setBackOcrStatusMessage("Reading address on server…");
    onProgress(10);
    const ticker = startOcrProgressTicker(onProgress, 10, 72);
    try {
      const raw = await apiService.ocrAadhaarBack(file);
      clearInterval(ticker);
      setBackOcrStatusMessage("");
      onProgress(92);
      return mapBackOcrApiResponse(raw);
    } catch (apiErr) {
      clearInterval(ticker);
      setBackOcrStatusMessage("");
      throw apiErr;
    }
  };

  const applyAadhaarBackOcrResults = (results) => {
    if (!results?.address && !results?.pincode) {
      toastWarn(results?.validationMessage || AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }
    if (results?.source !== "api" && results?.canAutofill === false) {
      toastWarn(results?.validationMessage || AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }
    setFamilyHead((prev) => ({
      ...prev,
      ...(results.address ? { address: results.address } : {}),
      ...(results.pincode ? { pincode: results.pincode } : {}),
    }));
    if (!results?.valid) {
      toastWarn(
        results?.validationMessage ||
          "Some address details could not be read. Please verify the form or rescan.",
      );
    }
    return true;
  };

  const persistAadhaarBackPreview = async (dataUrl, fileMeta) => {
    let storageBase64 = dataUrl;
    try {
      storageBase64 = await compressBase64Image(dataUrl, 1200, 1200, 0.7);
    } catch {
      /* keep original */
    }
    const fileData = fileMeta || {
      name: "aadhaar_back.jpg",
      size: "Live Capture",
    };
    setDocAadhaarBack({
      ...fileData,
      url: storageBase64,
      base64: storageBase64,
    });
  };

  const processAadhaarBackOcrFromImage = async (
    input,
    fileMeta = null,
    ocrOptions = {},
  ) => {
    setBackOcrLoading(true);
    setBackOcrProgress(0);
    let prepared = null;
    let previewDataUrl = ocrOptions.previewDataUrl || null;

    try {
      if (ocrOptions.preprocessed && input instanceof Blob) {
        prepared = {
          file: toOcrFile(input, "aadhaar_back.jpg"),
          dataUrl: previewDataUrl,
        };
      } else {
        prepared = await prepareOcrUploadFile(input, {
          filename: "aadhaar_back.jpg",
        });
        previewDataUrl = prepared.dataUrl;
      }

      const results = await runBackOcrForImage(prepared.file, (p) =>
        setBackOcrProgress(p),
      );
      const filled = applyAadhaarBackOcrResults(results);

      await persistAadhaarBackPreview(previewDataUrl, fileMeta);

      if (filled && results?.valid) {
        toastSuccess("Address and pincode extracted from Aadhaar back.");
      } else if (filled) {
        toastWarn("Address partially filled — please verify pincode and lines.");
      }
    } catch (err) {
      console.error("Aadhaar back OCR error:", err);
      const ocrMsg = getOcrApiErrorMessage(err);
      if (previewDataUrl) {
        await persistAadhaarBackPreview(previewDataUrl, fileMeta);
        toastError(ocrMsg);
        toastWarn("Image saved — OCR failed. Enter address manually.");
      } else {
        toastError(ocrMsg);
      }
    } finally {
      setBackOcrLoading(false);
      setBackOcrProgress(0);
      setBackOcrStatusMessage("");
    }
  };

  const captureAadhaarBackPhoto = async () => {
    if (!aadhaarBackVideoRef.current) return;

    const video = aadhaarBackVideoRef.current;
    let optimized;
    try {
      optimized = await captureVideoScanFrame(video, {
        maxWidth: 1400,
        quality: 0.85,
      });
    } catch (err) {
      console.error("Back frame capture failed:", err);
      toastWarn("Could not capture image. Please try again.");
      return;
    }

    const quality = assessCaptureQuality(optimized.canvas);
    if (!quality.ok) {
      toastWarn(quality.message);
      return;
    }

    let captureBlob = optimized.blob;
    if (quality.softBlur) {
      try {
        captureBlob = await enhanceImageBlobForOcr(captureBlob);
        toastWarn(quality.message);
      } catch {
        /* use original capture */
      }
    }

    stopAadhaarBackCamera();
    await processAadhaarBackOcrFromImage(captureBlob, null, {
      preprocessed: true,
      previewDataUrl: optimized.dataUrl,
    });
  };

  const handleAadhaarBackScanImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > OCR_MAX_UPLOAD_BYTES) {
      toastWarn("Image size should be less than 5MB");
      return;
    }

    await processAadhaarBackOcrFromImage(file, {
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
    });
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

  const captureDocBackPhoto = async () => {
    if (!docBackVideoRef.current || !docBackCanvasRef.current) return;

    setDocBackCameraLoading(true);
    const video = docBackVideoRef.current;
    const canvas = docBackCanvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.8);
    stopDocBackCamera();

    try {
      const compressedBase64 = await compressBase64Image(base64, 1200, 1200, 0.7);
      setDocBack({
        name: "captured_document.jpg",
        size: "Live Capture",
        url: compressedBase64,
        base64: compressedBase64,
      });
      toastSuccess("Second document captured successfully.");
    } catch (err) {
      console.error("Doc capture error:", err);
      setDocBack({
        name: "captured_document.jpg",
        size: "Live Capture",
        url: base64,
        base64: base64,
      });
    } finally {
      setDocBackCameraLoading(false);
    }
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
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > OCR_MAX_UPLOAD_BYTES) {
      toastWarn("Image size should be less than 5MB");
      return;
    }

    setOcrLoading(true);
    setOcrProgress(0);
    let prepared = null;

    try {
      prepared = await prepareOcrUploadFile(file, {
        filename: "aadhaar_front.jpg",
      });

      const results = await runFrontOcrForImage(prepared.file, (p) =>
        setOcrProgress(p),
      );

      let compressedBase64 = prepared.dataUrl;
      try {
        compressedBase64 = await compressBase64Image(
          prepared.dataUrl,
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
        url: prepared.dataUrl,
        base64: compressedBase64,
      });

      if (applyFrontOcrToFamilyHead(results)) {
        toastSuccess("Aadhaar details extracted successfully.");
      }
    } catch (err) {
      console.error("Front gallery OCR failed", err);
      const ocrMsg = getOcrApiErrorMessage(err);
      if (prepared?.dataUrl) {
        let compressedBase64 = prepared.dataUrl;
        try {
          compressedBase64 = await compressBase64Image(
            prepared.dataUrl,
            1200,
            1200,
            0.7,
          );
        } catch {
          /* keep */
        }
        setDocFront({
          name: file.name,
          size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
          url: prepared.dataUrl,
          base64: compressedBase64,
        });
        toastError(ocrMsg);
        toastWarn("Image saved — OCR failed. Enter Aadhaar details manually.");
      } else {
        toastError(ocrMsg);
      }
    } finally {
      setOcrLoading(false);
      setOcrProgress(0);
      setOcrStatusMessage("");
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

  const applyRegistrationCheckResults = ({
    phoneCheck,
    aadhaarCheck,
    nameCheck,
  }) => {
    setHeadPhoneDuplicate(phoneCheck);
    setHeadAadhaarDuplicate(aadhaarCheck);
    setHeadNameDuplicate(nameCheck);
  };

  /** Server-side uniqueness check — run before payment and before final create. */
  const ensureRegistrationValid = async () => {
    setRegistrationCheckInProgress(true);
    try {
      const result = await runRegistrationDuplicateChecks(familyHead);
      applyRegistrationCheckResults(result);
      if (!result.valid) {
        result.errors.forEach((msg) => toastWarn(msg));
        return false;
      }
      return true;
    } finally {
      setRegistrationCheckInProgress(false);
    }
  };

  const registrationBlocked = hasBlockingDuplicateFromState(
    headPhoneDuplicate,
    headAadhaarDuplicate,
  );

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

  /** 2nd document — file upload only (separate identity document, no OCR) */
  const handleDocumentUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toastWarn("Image size should be less than 5MB");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressedBase64 = await compressBase64Image(reader.result);
          const fileData = {
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
            url: URL.createObjectURL(file),
            base64: compressedBase64,
          };
          setDocBack(fileData);
          toastSuccess("Second document uploaded successfully.");
        } catch (err) {
          console.error("Document compression failed", err);
          toastWarn("Could not process image. Please try another file.");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsDataURL(file);
    }
  };

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
    if (memberScanningIndex === indexToRemove) {
      stopMemberCamera({ resetScanningIndex: true });
    }

    const updatedMembers = members.filter((_, i) => i !== indexToRemove);
    setMembers(updatedMembers);

    if (activeMemberTab === indexToRemove + 1) {
      setActiveMemberTab(0);
    } else if (activeMemberTab > indexToRemove + 1) {
      setActiveMemberTab(activeMemberTab - 1);
    }
  };

  const stopMemberCamera = ({ resetScanningIndex = true } = {}) => {
    stopMediaStream(memberStreamRef.current);
    memberStreamRef.current = null;
    detachVideoElement(memberVideoRef.current);
    setMemberCameraActive(false);
    setMemberCameraLoading(false);
    if (resetScanningIndex) {
      setMemberScanningIndex(null);
      setMemberCameraError(null);
    }
  };

  const startMemberCamera = async (index) => {
    stopMediaStream(memberStreamRef.current);
    memberStreamRef.current = null;
    detachVideoElement(memberVideoRef.current);
    setMemberCameraActive(false);
    setMemberCameraError(null);
    setMemberCameraLoading(true);
    setMemberScanningIndex(index);

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "Camera is not supported in this browser.";
      setMemberCameraLoading(false);
      setMemberCameraError(msg);
      toastWarn(msg);
      return;
    }

    try {
      const stream = await requestCameraStream({ preferEnvironment: true });
      memberStreamRef.current = stream;
      setMemberCameraActive(true);
      setMemberCameraLoading(false);
    } catch (err) {
      console.error("Member camera error:", err);
      const msg = getCameraErrorMessage(err);
      setMemberCameraError(msg);
      setMemberCameraActive(false);
      setMemberCameraLoading(false);
      toastWarn(msg);
    }
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
    if (!results) {
      toastWarn(AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }

    const nextAadhaar =
      results.docNumber?.length === 12
        ? results.docNumber
        : normalizeDigits(results.docNumber).length === 12
          ? normalizeDigits(results.docNumber)
          : "";

    const nextName =
      results.source === "api"
        ? String(results.name || "").trim()
        : isValidAadhaarName(results.name)
          ? results.name.trim()
          : "";

    const nextGender = results.gender || "";
    const nextDob = normalizeOcrDobForDateInput(results.dob) || results.dob || "";

    if (results.source === "api") {
      if (!nextAadhaar && !nextName) {
        toastWarn(results.validationMessage || AADHAAR_OCR_LOW_CONFIDENCE_MSG);
        return false;
      }
      setFamilyHead((prev) => ({
        ...prev,
        ...(nextName ? { fullName: nextName } : {}),
        ...(nextGender ? { gender: nextGender } : {}),
        ...(nextDob ? { dob: nextDob } : {}),
        ...(nextAadhaar ? { aadhaarNumber: nextAadhaar } : {}),
      }));
      if (!results.canAutofill) {
        toastWarn(
          results.validationMessage ||
            "Some Aadhaar details could not be read. Please verify or complete manually.",
        );
      }
      return true;
    }

    if (
      !results.canAutofill ||
      !nextAadhaar ||
      !nextName ||
      !nextDob ||
      !nextGender
    ) {
      toastWarn(results.validationMessage || AADHAAR_OCR_LOW_CONFIDENCE_MSG);
      return false;
    }

    setFamilyHead((prev) => ({
      ...prev,
      fullName: nextName,
      gender: nextGender,
      dob: nextDob,
      aadhaarNumber: nextAadhaar,
    }));

    if (!results.valid) {
      toastWarn(
        results.validationMessage ||
          "Unable to detect Aadhaar details clearly. Please verify or rescan.",
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
      const optimalBlob =
        binaryBlob || (await fetch(base64Src).then((res) => res.blob()));
      let details = await runFrontOcrForImage(optimalBlob, (p) =>
        setMemberScanProgress(p),
      );

      let docAccepted =
        details?.type === "aadhaar" && isLikelyMemberDocId(details?.docNumber);
      if (!details?.canAutofill && !docAccepted) {
        const processedBase64 = await preprocessMemberImageForOCR(base64Src);
        const processedBlob = await fetch(processedBase64).then((res) =>
          res.blob(),
        );
        const details2 = await runFrontOcrForImage(processedBlob, (p) =>
          setMemberScanProgress(p),
        );
        if (
          details2?.type === "aadhaar" &&
          isLikelyMemberDocId(details2?.docNumber)
        ) {
          details = pickBetterFrontOcr(details, details2);
          docAccepted = true;
        }
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
      memberScanningIndex === null ||
      memberCameraLoading
    )
      return;

    const targetIndex = memberScanningIndex;
    const video = memberVideoRef.current;
    const canvas = memberCanvasRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      toastWarn("Camera is still starting. Please wait a moment and try again.");
      return;
    }

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
    if (submissionCompletedRef.current) return;
    if (!(await ensureRegistrationValid())) return;

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
        docAadhaarBack && {
          filename: docAadhaarBack.name,
          originalName: docAadhaarBack.name,
          path: docAadhaarBack.base64 || docAadhaarBack.url,
          size: 0,
          mimetype: "image/jpeg",
          type: "aadhaar_back",
          uploadedAt: new Date().toISOString(),
        },
        docBack && {
          filename: docBack.name,
          originalName: docBack.name,
          path: docBack.base64 || docBack.url,
          size: 0,
          mimetype: "image/jpeg",
          type: "supporting_document",
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
      submissionCompletedRef.current = true;
      setSubmissionReceipt(created);
      if (created?.applicationId) {
        setApplicationId(String(created.applicationId));
      }
      setCurrentStep(successStep);
      toastSuccess("Ayush card application submitted successfully.");
    } catch (err) {
      console.error("Card application submission error:", err);
      const errMsg = err.response?.data?.message || err.message || "";
      const isDuplicate = /already exists|duplicate|registered/i.test(errMsg);

      if (isDuplicate) {
        await ensureRegistrationValid();
        const payNote = finalTxnId
          ? ` Payment reference: ${finalTxnId}. Contact support if payment was deducted.`
          : "";
        toastError(
          (errMsg.includes("phone")
            ? "Phone number already exists."
            : errMsg.includes("aadhaar")
              ? "Aadhaar number already registered."
              : errMsg) + payNote,
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
        docAadhaarBack && {
          name: "aadhaarBack",
          path: docAadhaarBack.base64 || docAadhaarBack.url,
          type: "aadhaar_back",
        },
        docBack && {
          name: "documentBack",
          path: docBack.base64 || docBack.url,
          type: "supporting_document",
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
    if (submissionCompletedRef.current) return;
    if (!(await ensureRegistrationValid())) return;

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
      submissionCompletedRef.current = true;
      setSubmissionReceipt(created);
      if (created?.applicationId) {
        setApplicationId(String(created.applicationId));
      }
      setCurrentStep(successStep);
      toastSuccess("Ayush card application submitted.");
    } catch (err) {
      console.error("Staff card create error:", err);
      const errMsg = err.response?.data?.message || err.message || "";
      const isDuplicate = /already exists|duplicate|registered/i.test(errMsg);
      if (isDuplicate) {
        await ensureRegistrationValid();
        const payNote =
          staffPaymentMode === "online" && txnId
            ? ` Payment reference: ${txnId}. Contact support if payment was deducted.`
            : "";
        toastError(
          (errMsg.includes("phone")
            ? "Phone number already exists."
            : errMsg.includes("aadhaar")
              ? "Aadhaar number already registered."
              : errMsg) + payNote,
        );
        return;
      }
      toastError(errMsg || "Failed to create Ayush card. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitiateCashfreePayment = async () => {
    if (registrationBlocked || registrationCheckInProgress) {
      toastWarn(
        "This phone number or Aadhaar is already registered. Update details before paying.",
      );
      return;
    }
    if (!(await ensureRegistrationValid())) return;

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
          "Please upload the first identity document (camera or gallery in the middle column).",
        );
        return;
      }
      if (!docAadhaarBack) {
        toastWarn(
          "Please scan the Aadhaar card back (right column — camera or gallery).",
        );
        return;
      }
      if (!docBack) {
        toastWarn(
          "Please upload the second identity document (camera or gallery below email).",
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

      if (headPhoneDuplicate.exists === true) {
        toastWarn("Phone number already exists.");
        return;
      }
      if (headAadhaarDuplicate.exists === true) {
        toastWarn("Aadhaar number already registered.");
        return;
      }
      if (!(await ensureRegistrationValid())) return;

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

      if (skipPayment) {
        await submitStaffApplication();
        return;
      }

      if (!(await ensureRegistrationValid())) return;
    }

    // Step 4: payment + submit
    if (!skipPayment && currentStep === 4) {
      if (!(await ensureRegistrationValid())) return;

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

  const renderHeadDuplicateHint = (check, kind) => (
    <HeadDuplicateHint check={check} kind={kind} />
  );

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


  return {
    variant, isOpen, onClose, skipPayment, staffPaymentFlow, onStaffSubmit, onBack,
    currentStep, setCurrentStep, applicationId, setApplicationId, submissionReceipt, setSubmissionReceipt,
    toastWarn, toastError, toastSuccess, todayCampId, todayCampName, submitting, setSubmitting,
    docFront, setDocFront, docBack, setDocBack, docAadhaarBack, setDocAadhaarBack,
    ocrFileInputRef, aadhaarBackOcrInputRef, docBackInputRef, docBackCameraInputRef,
    headImageInputRef, headCameraVideoRef, headCameraCanvasRef, paymentInputRef,
    maxDobForAdult, paymentScreenshot, setPaymentScreenshot, isEditingReview, setIsEditingReview,
    declarationAccepted, setDeclarationAccepted, paymentMethod, setPaymentMethod,
    onlinePaymentLoading, setOnlinePaymentLoading, verifyLoading, setVerifyLoading,
    orderId, setOrderId, txnId, setTxnId, saveError, setSaveError,
    staffPaymentMode, setStaffPaymentMode, staffCashReceiptImage, setStaffCashReceiptImage,
    staffCashVideoRef, staffCashCanvasRef, staffCashCameraActive, staffCashCameraLoading,
    ocrLoading, ocrProgress, ocrStatusMessage, backOcrLoading, backOcrProgress, backOcrStatusMessage,
    videoRef, canvasRef,
    cameraActive, aadhaarBackVideoRef, aadhaarBackCanvasRef, aadhaarBackCameraActive,
    docBackVideoRef, docBackCanvasRef, docBackCameraActive, docBackCameraLoading,
    headImage, setHeadImage, headCameraActive, headCameraPermissionDenied,
    familyHead, setFamilyHead, headPhoneDuplicate, headAadhaarDuplicate, headNameDuplicate,
    members, setMembers, activeMemberTab, setActiveMemberTab,
    memberScanningIndex, memberScanProgress, memberOcrLoading, memberVideoRef, memberCanvasRef,
    memberCameraActive, memberCameraLoading, memberCameraError, memberInputRef, addMemberScrollAnchorRef,
    successStep, totalMembersCount, estimatedFee, extraMembersBeyondIncluded,
    stepperSteps, stepperProgressPct, footerStepMax,
    stopStaffCashCamera, handleRawBtPrint, resetForm,
    handleStaffChooseOfflineCash, handleStaffChooseOnline,
    handleAadhaarBackScanImage, handleScanImage, handleHeadChange, handleMemberChange,
    handleDocumentUpload, handleHeadImageUpload, handlePaymentScreenshotUpload,
    handleMemberScanImage, submitFinalApplication, buildStaffHealthCardPayload,
    submitStaffApplication, handleInitiateCashfreePayment, handleVerifyCashfreePayment,
    handleNext, handleBack, cardPreviewData, renderHeadDuplicateHint,
    registrationCheckInProgress, registrationBlocked, ensureRegistrationValid,
    thermalPaymentLabel, thermalPaymentRef, hasPrintableReceipt,
    captureHeadPhoto, stopHeadCamera, startHeadCamera,
    startCamera, stopCamera, capturePhoto, startAadhaarBackCamera, stopAadhaarBackCamera,
    captureAadhaarBackPhoto, startDocBackCamera, stopDocBackCamera, captureDocBackPhoto,
    addMember, removeMember, startMemberCamera, stopMemberCamera, captureMemberPhoto,
    captureStaffCashReceipt,
    setHeadCameraActive,
    setHeadCameraPermissionDenied,
    setMemberScanningIndex,
    setMemberScanProgress,
    setMemberOcrLoading,
    setMemberCameraActive,
    setMemberCameraLoading,
    setMemberCameraError,
    setStaffCashCameraLoading,
    setOcrLoading,
    setOcrProgress,
    setBackOcrLoading,
    setBackOcrProgress,
    setCameraActive,
    setAadhaarBackCameraActive,
    setDocBackCameraLoading,
    setDocBackCameraActive,
  };
}
