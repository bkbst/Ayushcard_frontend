import React, { useEffect, useRef, useState } from "react";
import { X, Camera, Upload, Check, PackageCheck } from "lucide-react";
import { useToast } from "../../../../components/ui/Toast";
import apiService from "../../../../api/service";
import AyushCardReceiptPreview from "./AyushCardReceiptPreview";
import { getDateTime, getFormattedCurrentDate } from "./vitranUtils";
import { fetchFullReceiptCard } from "./receiptLoader";

const VitranModal = ({ card, onClose, onDistributed }) => {
  const { toastWarn, toastSuccess, toastError } = useToast();
  const [recipientImage, setRecipientImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptCard, setReceiptCard] = useState(card);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchFullReceiptCard(card).then((enriched) => {
      if (active) setReceiptCard(enriched);
    });
    return () => { active = false; };
  }, [card]);

  useEffect(() => {
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
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError("Camera access denied. Please upload a photo instead.");
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
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    setRecipientImage(canvas.toDataURL("image/jpeg", 0.65));
    stopCamera();
  };

  const compressAndSetImage = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 640;
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        setRecipientImage(canvas.toDataURL("image/jpeg", 0.65));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    if (!recipientImage) {
      toastWarn("Please capture or upload the recipient's photo before confirming distribution.");
      return;
    }
    const distributeId = card._id || card.id;
    if (!distributeId) {
      toastError("Card reference missing. Cannot distribute.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiService.distributeCard(distributeId, recipientImage);
      const doc = res?.data || res;
      const record = {
        cardId: card.id,
        clientName: receiptCard.clientName || card.clientName,
        mobile: receiptCard.mobile || card.mobile,
        employeeId: card.employeeId,
        employeeName: card.employeeName,
        card: receiptCard,
        recipientImage,
        distributedAt: getFormattedCurrentDate(),
        distributedDateTime: getDateTime(),
      };
      onDistributed(record, doc);
      toastSuccess(`Card distributed to ${card.clientName}`);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to distribute card";
      toastError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50 rounded-t-2xl shrink-0">
          <div>
            <h3 className="text-sm font-black text-[#22333B]">Ayush Vitran</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {card.clientName} · {card.id}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Application Receipt</p>
              <div className="bg-gray-50 rounded-xl p-4 flex justify-center overflow-auto max-h-[520px]">
                <AyushCardReceiptPreview card={receiptCard} />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Recipient Photo</p>
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-4 min-h-[280px] flex flex-col items-center justify-center">
                {recipientImage ? (
                  <img src={recipientImage} alt="Recipient" className="max-h-64 rounded-xl object-cover border border-gray-200 shadow-sm" />
                ) : isCameraOpen ? (
                  <div className="w-full flex flex-col items-center gap-3">
                    <video ref={videoRef} autoPlay playsInline className="w-full max-h-56 rounded-xl bg-black object-cover" />
                    <div className="flex gap-2">
                      <button onClick={capturePhoto} className="px-4 py-2 bg-[#F68E5F] text-white text-xs font-bold rounded-lg">
                        Capture
                      </button>
                      <button onClick={stopCamera} className="px-4 py-2 border border-gray-200 text-xs font-bold rounded-lg bg-white">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <PackageCheck size={40} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500 mb-1">Capture recipient with card receipt</p>
                    <p className="text-xs text-gray-400 mb-4">Photo proof that card was handed over</p>
                    {cameraError && <p className="text-xs text-red-500 mb-3">{cameraError}</p>}
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button onClick={startCamera} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#22333B] text-white text-xs font-bold rounded-xl">
                        <Camera size={14} /> Open Camera
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-orange-50 text-[#F68E5F] border border-orange-100 text-xs font-bold rounded-xl">
                        <Upload size={14} /> Upload Photo
                      </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) compressAndSetImage(f); e.target.value = ""; }} />
                  </div>
                )}
              </div>
              {recipientImage && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setRecipientImage(null)} className="flex-1 py-2 text-xs font-bold border border-gray-200 rounded-lg bg-white text-gray-600">
                    Retake
                  </button>
                  <button onClick={startCamera} className="flex-1 py-2 text-xs font-bold border border-orange-100 rounded-lg bg-orange-50 text-[#F68E5F]">
                    Camera Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row items-center gap-2 shrink-0">
          <button onClick={onClose} disabled={submitting} className="w-full sm:w-auto px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={submitting} className="flex-1 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F68E5F] text-white text-xs font-black rounded-lg hover:bg-[#ff7637] disabled:opacity-60">
            <Check size={14} /> {submitting ? "Distributing..." : "Confirm Card Distributed"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VitranModal;
