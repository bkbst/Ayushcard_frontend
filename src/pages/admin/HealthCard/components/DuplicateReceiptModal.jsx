import React, { useState } from "react";
import {
  X, Check, ChevronRight, ChevronLeft, Printer, AlertCircle, Banknote, Wifi, Clock, Camera, Upload
} from "lucide-react";
import { LOGO_BASE64 } from "../../../../utils/logoBase64";
import { useToast } from "../../../../components/ui/Toast";
import {
  PENALTY_AMOUNT,
  generateDupReceiptNo,
  getFormattedCurrentDate,
  getDateTime
} from "./vitranUtils";
import PenaltyReceiptPreview from "./PenaltyReceiptPreview";

const DuplicateReceiptModal = ({ card, onClose, onIssued }) => {
  const { toastWarn, toastError } = useToast();
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("offline");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [generatedRecord, setGeneratedRecord] = useState(null);
  const [isPrinted, setIsPrinted] = useState(false);

  // Offline payment proof image state
  const [offlineImage, setOfflineImage] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setIsCameraOpen(true);
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setCameraError("Could not access camera. Please upload file instead.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      setOfflineImage(dataUrl);
      stopCamera();
    }
  };

  const compressAndSetImage = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 500;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        setOfflineImage(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = () => {
    if (paymentMethod === "online" && !paymentRef.trim()) {
      toastWarn("Please enter a payment reference for online payment.");
      return;
    }
    if (paymentMethod === "offline" && !offlineImage) {
      toastWarn("Please upload or capture a payment receipt photo for offline payment.");
      return;
    }
    const record = {
      receiptNo: generateDupReceiptNo(),
      cardId: card.id,
      originalReceiptNo: card.receiptNo,
      clientName: card.clientName,
      mobile: card.mobile,
      employeeId: card.employeeId,
      employeeName: card.employeeName,
      penaltyAmount: PENALTY_AMOUNT,
      paymentMethod,
      paymentRef: paymentRef.trim(),
      paymentStatus,
      issuedAt: getFormattedCurrentDate(),
      issuedDateTime: getDateTime(),
      card,
      offlineImage, // Save offline payment image proof
    };
    setGeneratedRecord(record);
    setStep(3);
  };

  const handlePrint = () => {
    if (!generatedRecord) return;
    const c = generatedRecord.card;
    const pw = window.open("", "_blank", "width=400,height=820,status=no,toolbar=no,menubar=no");
    if (!pw) { toastError("Pop-up blocked! Allow pop-ups to print."); return; }
    pw.document.open();
    pw.document.write(`
<!DOCTYPE html><html><head><title>Penalty Receipt - ${generatedRecord.receiptNo}</title>
<style>
  @page { margin: 0; }
  body { font-family: sans-serif; color: black; background: white; padding: 18px 14px; margin: 0; font-size: 11px; line-height: 1.5; }
  .container { width: 80mm; max-width: 100%; margin: 0 auto; box-sizing: border-box; }
  .logo-circle { width: 64px; height: 64px; border-radius: 50%; border: 2px solid black; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px auto; background: white; padding: 5px; box-sizing: border-box; }
  .logo-circle img { height: 42px; width: auto; object-fit: contain; }
  .title { font-size: 13px; font-weight: 900; text-align: center; text-decoration: underline; font-family: serif; margin-bottom: 10px; }
  .trust-header { text-align: center; border-bottom: 1px solid black; padding-bottom: 10px; margin-bottom: 12px; }
  .trust-name { font-size: 12px; font-weight: 900; font-family: serif; }
  .address-line { font-size: 9.5px; font-weight: bold; margin-top: 2px; }
  .field-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold; font-size: 10.5px; }
  .field-row span.label { font-weight: 900; }
  .penalty-box { text-align: center; font-weight: 900; font-size: 11.5px; border-top: 1px solid black; border-bottom: 1px solid black; padding: 7px 0; margin: 10px 0; }
  .dup-info { font-size: 9.5px; font-weight: bold; border: 1px dashed #888; padding: 5px 6px; border-radius: 3px; margin-bottom: 10px; line-height: 1.6; }
  .hindi-heading { text-align: center; font-weight: 900; font-size: 10.5px; text-decoration: underline; margin-bottom: 6px; }
  .hindi-para { font-size: 9.5px; line-height: 1.6; margin-bottom: 6px; }
  .mitra-section { border-top: 1px dashed black; padding-top: 8px; margin-top: 8px; font-weight: bold; font-size: 10.5px; line-height: 1.8; }
  .sig-box { border: 1px solid black; height: 52px; display: flex; align-items: center; justify-content: center; margin-top: 24px; border-radius: 2px; }
  .sig-text { color: #ccc; font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 2px; }
</style></head><body>
<div class="container">
  <div class="logo-circle"><img src="${LOGO_BASE64}" alt="Logo"/></div>
  <div class="title">Penalty Recept</div>
  <div class="trust-header">
    <div class="trust-name">Baijnaath Kesar Bai Sewa Trust</div>
    <div class="address-line">1-A Mangla Vihar New PAC Line</div>
    <div class="address-line">Kanpur Nagar – 208015</div>
  </div>
  <div style="margin-bottom:10px; font-size:10.5px;">
    <div class="field-row"><span><span class="label">Date :-</span> ${generatedRecord.issuedAt}</span></div>
    <div class="field-row"><span><span class="label">Card ID No :-</span> ${c.id}</span></div>
    <div class="field-row"><span><span class="label">Camp Area :-</span> ${c.area || "Mangla Vihar"}</span></div>
    <div class="field-row"><span><span class="label">Mukhiya Name :-</span> ${c.mukhiyaName || c.clientName}</span></div>
    <div class="field-row"><span><span class="label">Full Address :-</span> ${c.address || "—"}</span></div>
    <div class="field-row">
      <span><span class="label">District :-</span> ${c.district || "Kanpur Nagar"}</span>
    </div>
    <div class="field-row">
      <span><span class="label">Pin Code :-</span> ${c.pincode || "208015"}</span>
      <span><span class="label">Total Member :-</span> ${c.totalMember || 1}</span>
    </div>
  </div>
  <div class="penalty-box">Penalty Amount :- Rs. ${PENALTY_AMOUNT}.00</div>
  <div class="dup-info">
    Receipt No :- ${generatedRecord.receiptNo}<br/>
    Payment Method :- ${generatedRecord.paymentMethod === "online" ? "Online" : "Offline (Cash)"}<br/>
    ${generatedRecord.paymentRef ? `Ref :- ${generatedRecord.paymentRef}<br/>` : ""}
    Status :- Paid
  </div>
  <div class="hindi-heading">महत्वपूर्ण जानकारी</div>
  <p class="hindi-para">कार्ड का उपयोग करने से पूर्व, कृपया कार्ड के साथ दिए किए गए लेटर को ध्यानपूर्वक अवश्य पढ़ें।</p>
  <p class="hindi-para">किसी भी प्रकार की समस्या या सहायता हेतु, कृपया कार्ड के साथ दिए गए हेल्पलाइन नंबर 8303902030 पर संपर्क करें।</p>
  <div class="mitra-section">
    <div>Ayush Mitra Name :- ${c.employeeName || "—"}</div>
    <div>Ayush Mitra ID No :- ${c.employeeId || "—"}</div>
  </div>
  <div class="sig-box"><span class="sig-text">Signature</span></div>
</div>
<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script>
</body></html>`);
    pw.document.close();
    setIsPrinted(true);
  };

  const handleRawBtPrint = () => {
    if (!generatedRecord) return;
    const c = generatedRecord.card;
    const htmlContent = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: sans-serif; color: black; background: white; margin: 0; padding: 0; }
  .container { width: 58mm; box-sizing: border-box; padding: 2mm; font-size: 8px; line-height: 1.3; }
  .logo-circle { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid black; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto; background: white; padding: 3px; box-sizing: border-box; }
  .logo-circle img { height: 30px; width: auto; object-fit: contain; }
  .title { font-size: 10px; font-weight: 900; text-align: center; text-decoration: underline; font-family: serif; margin-bottom: 6px; text-transform: uppercase; }
  .trust-header { text-align: center; border-bottom: 1px solid black; padding-bottom: 6px; margin-bottom: 8px; }
  .trust-name { font-size: 9px; font-weight: 900; font-family: serif; }
  .address-line { font-size: 7.5px; font-weight: bold; margin-top: 1px; }
  .field-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: bold; font-size: 8px; }
  .field-row span.label { font-weight: 900; }
  .penalty-box { text-align: center; font-weight: 900; font-size: 9px; border-top: 1px solid black; border-bottom: 1px solid black; padding: 5px 0; margin: 8px 0; }
  .dup-info { font-size: 7.5px; font-weight: bold; border: 1px dashed #888; padding: 4px; border-radius: 2px; margin-bottom: 8px; line-height: 1.4; }
  .hindi-heading { text-align: center; font-weight: 900; font-size: 8px; text-decoration: underline; margin-bottom: 4px; }
  .hindi-para { font-size: 7px; line-height: 1.4; margin-bottom: 4px; }
  .mitra-section { border-top: 1px dashed black; padding-top: 6px; margin-top: 6px; font-weight: bold; font-size: 8px; line-height: 1.5; }
  .sig-box { border: 1px solid black; height: 36px; display: flex; align-items: center; justify-content: center; margin-top: 18px; border-radius: 2px; }
  .sig-text { color: #ccc; font-weight: bold; text-transform: uppercase; font-size: 8px; letter-spacing: 1px; }
</style></head><body>
<div class="container">
  <div class="logo-circle"><img src="${LOGO_BASE64}" alt="Logo"/></div>
  <div class="title">Penalty Receipt</div>
  <div class="trust-header">
    <div class="trust-name">Baijnaath Kesar Bai Sewa Trust</div>
    <div class="address-line">1-A Mangla Vihar New PAC Line</div>
    <div class="address-line">Kanpur Nagar – 208015</div>
  </div>
  <div style="margin-bottom:8px;">
    <div class="field-row"><span><span class="label">Date :-</span> ${generatedRecord.issuedAt}</span></div>
    <div class="field-row"><span><span class="label">Card ID No :-</span> ${c.id}</span></div>
    <div class="field-row"><span><span class="label">Camp Area :-</span> ${c.area || "Mangla Vihar"}</span></div>
    <div class="field-row"><span><span class="label">Mukhiya Name :-</span> ${c.mukhiyaName || c.clientName}</span></div>
    <div class="field-row"><span><span class="label">Full Address :-</span> ${c.address || "—"}</span></div>
    <div class="field-row"><span><span class="label">District :-</span> ${c.district || "Kanpur Nagar"}</span></div>
    <div class="field-row">
      <span><span class="label">Pin Code :-</span> ${c.pincode || "208015"}</span>
      <span><span class="label">Total Member :-</span> ${c.totalMember || 1}</span>
    </div>
  </div>
  <div class="penalty-box">Penalty Amount :- Rs. ${PENALTY_AMOUNT}.00</div>
  <div class="dup-info">
    Receipt No :- ${generatedRecord.receiptNo}<br/>
    Payment Method :- ${generatedRecord.paymentMethod === "online" ? "Online" : "Offline (Cash)"}<br/>
    ${generatedRecord.paymentRef ? `Ref :- ${generatedRecord.paymentRef}<br/>` : ""}
    Status :- Paid
  </div>
  <div class="hindi-heading">महत्वपूर्ण जानकारी</div>
  <p class="hindi-para">कार्ड का उपयोग करने से पूर्व, कृपया कार्ड के साथ दिए किए गए लेटर को ध्यानपूर्वक अवश्य पढ़ें।</p>
  <p class="hindi-para">किसी भी प्रकार की समस्या या सहायता हेतु, कृपया कार्ड के साथ दिए गए हेल्पलाइन नंबर 8303902030 पर संपर्क करें।</p>
  <div class="mitra-section">
    <div>Ayush Mitra Name :- ${c.employeeName || "—"}</div>
    <div>Ayush Mitra ID No :- ${c.employeeId || "—"}</div>
  </div>
  <div class="sig-box"><span class="sig-text">Signature</span></div>
</div>
</body></html>`;

    const b64 = btoa(unescape(encodeURIComponent(htmlContent)));
    const playStoreUrl = "https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter";
    const rawbtIntent = `intent:#Intent;action=ru.a402d.rawbtprinter.action.PRINT;category=android.intent.category.DEFAULT;type=text/html;S.text=${b64};S.ru.a402d.rawbtprinter.EXTRA_B64=true;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end;`;

    const userAgent = navigator.userAgent || "";
    const isAndroid = /Android/i.test(userAgent);
    if (!isAndroid) {
      toastWarn("RawBT printing works on Android phones. Use normal Print on desktop.");
      return;
    }
    window.location.href = rawbtIntent;
    setIsPrinted(true);
  };

  const handleSaveAndClose = () => {
    if (generatedRecord) onIssued(generatedRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh]" style={{ fontFamily: "Inter, sans-serif" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-sm font-black text-[#22333B]">Issue Duplicate Receipt</h3>
            <p className="text-xs text-gray-400 mt-0.5">Card: <span className="font-mono font-bold">{card.id}</span> · {card.clientName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center px-5 py-3 bg-gray-50 border-b border-gray-100 shrink-0 gap-2">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${step >= s ? "text-[#F68E5F]" : "text-gray-400"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-colors
                  ${step > s ? "bg-[#F68E5F] border-[#F68E5F] text-white" : step === s ? "border-[#F68E5F] text-[#F68E5F]" : "border-gray-200 text-gray-400"}`}>
                  {step > s ? <Check size={10} /> : s}
                </div>
                {s === 1 ? "Review" : s === 2 ? "Payment" : "Receipt"}
              </div>
              {s < 3 && <ChevronRight size={12} className="text-gray-300 shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: Card Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-2">Original Card Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {[
                    ["Card ID", card.id],
                    ["Receipt No.", card.receiptNo],
                    ["Client Name", card.clientName],
                    ["Mobile", card.mobile],
                    ["Camp Area", card.area],
                    ["District", card.district],
                    ["Pin Code", card.pincode],
                    ["Total Members", card.totalMember],
                    ["Amount Paid", `₹${card.amount}`],
                    ["Card Type", card.cardType],
                    ["Export Date", card.exportDate],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-gray-400 font-semibold">{label}</p>
                      <p className="font-bold text-[#22333B]">{val || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Ayush Mitra (Issuing Employee)</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-100 text-[#F68E5F] flex items-center justify-center font-black text-sm">
                    {card.employeeName?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#22333B]">{card.employeeName}</p>
                    <p className="text-xs text-gray-400 font-mono">{card.employeeId}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p>A penalty fee of <strong>₹{PENALTY_AMOUNT}</strong> will be charged for issuing a duplicate receipt. Please confirm with the client before proceeding.</p>
              </div>
            </div>
          )}

          {/* Step 2: Payment */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Penalty Amount</p>
                <div className="bg-[#22333B] text-white rounded-xl p-4 text-center">
                  <p className="text-xs font-semibold opacity-70 mb-1">Amount to Collect</p>
                  <p className="text-3xl font-black">₹{PENALTY_AMOUNT}.00</p>
                  <p className="text-[10px] opacity-60 mt-1">Duplicate / Reissue Fee</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Payment Method</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: "offline", label: "Offline (Cash)", Icon: Banknote },
                    { val: "online", label: "Online (UPI/Net)", Icon: Wifi },
                  ].map(({ val, label, Icon: Ic }) => (
                    <button key={val} onClick={() => setPaymentMethod(val)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-bold transition-all
                        ${paymentMethod === val ? "border-[#F68E5F] bg-orange-50 text-[#F68E5F]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      <Ic size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === "offline" && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-700">Proof of Payment / Cash Photo <span className="text-red-500">*</span></p>
                  
                  {offlineImage ? (
                    <div className="relative w-full h-40 bg-black rounded-lg overflow-hidden border border-gray-300 flex items-center justify-center">
                      <img src={offlineImage} alt="Payment Receipt" className="h-full object-contain" />
                      <button type="button" onClick={() => setOfflineImage(null)}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow">
                        <X size={14} />
                      </button>
                    </div>
                  ) : isCameraOpen ? (
                    <div className="space-y-3">
                      <div className="relative w-full h-48 bg-black rounded-lg overflow-hidden border border-gray-300">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={capturePhoto}
                          className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-1">
                          <Check size={13} /> Capture
                        </button>
                        <button type="button" onClick={stopCamera}
                          className="py-1.5 px-3 bg-gray-500 text-white rounded-lg text-xs font-bold hover:bg-gray-600 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button type="button" onClick={startCamera}
                        className="flex-1 py-2 bg-orange-100 text-[#F68E5F] rounded-lg text-xs font-bold border border-orange-200 hover:bg-[#F68E5F] hover:text-white transition-all flex items-center justify-center gap-1.5">
                        <Camera size={14} /> Take Photo (Camera)
                      </button>
                      <label className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold border border-gray-200 hover:bg-gray-200 cursor-pointer transition-all flex items-center justify-center gap-1.5 text-center">
                        <Upload size={14} /> Upload Image
                        <input type="file" accept="image/*" onChange={e => {
                          if (e.target.files?.[0]) compressAndSetImage(e.target.files[0]);
                        }} className="hidden" />
                      </label>
                    </div>
                  )}
                  {cameraError && <p className="text-[10px] text-red-500 font-semibold">{cameraError}</p>}
                </div>
              )}

              {paymentMethod === "online" && (
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Payment Reference / Transaction ID <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. UPI ref: 123456789"
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F68E5F]/30 focus:border-[#F68E5F]"
                  />
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Payment Status</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: "paid", label: "Paid", Icon: Check, color: "green" },
                    { val: "pending", label: "Pending", Icon: Clock, color: "amber" },
                  ].map(({ val, label, Icon: Ic, color }) => (
                    <button key={val} onClick={() => setPaymentStatus(val)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-bold transition-all
                        ${paymentStatus === val
                          ? color === "green" ? "border-green-500 bg-green-50 text-green-600" : "border-amber-400 bg-amber-50 text-amber-600"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      <Ic size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Receipt Preview */}
          {step === 3 && generatedRecord && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl p-3">
                <Check size={14} className="shrink-0" />
                <p>Receipt <strong>{generatedRecord.receiptNo}</strong> generated. Print or save below.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 flex items-start justify-center overflow-y-auto" style={{ maxHeight: "400px" }}>
                <PenaltyReceiptPreview card={generatedRecord.card} receiptRecord={generatedRecord} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
          {step === 1 && (
            <>
              <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => setStep(2)} className="flex-1 py-2 bg-[#F68E5F] text-white rounded-xl text-xs font-black hover:bg-[#ff7637] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
                Proceed to Payment <ChevronRight size={13} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="flex items-center gap-1 py-2 px-3 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap">
                <ChevronLeft size={13} /> Back
              </button>
              <button onClick={handleGenerate} className="flex-1 py-2 bg-[#F68E5F] text-white rounded-xl text-xs font-black hover:bg-[#ff7637] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
                Generate Receipt <ChevronRight size={13} />
              </button>
            </>
          )}
          {step === 3 && (
            <div className="flex flex-col sm:flex-row w-full gap-2">
              <button onClick={handleSaveAndClose} className="w-full sm:w-auto py-2 px-4 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors text-center whitespace-nowrap">
                {isPrinted ? "Close" : "Save & Close"}
              </button>
              <div className="flex flex-1 gap-2 w-full">
                <button onClick={handlePrint} className="flex-1 py-2 bg-[#22333B] text-white rounded-xl text-xs font-black hover:bg-[#1a2830] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <Printer size={13} /> Print
                </button>
                <button onClick={handleRawBtPrint} className="flex-1 py-2 bg-[#F68E5F] text-white rounded-xl text-xs font-black hover:bg-[#ff7637] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
                  RawBT Print
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DuplicateReceiptModal;
