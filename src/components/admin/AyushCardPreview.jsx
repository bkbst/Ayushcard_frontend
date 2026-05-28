import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { MapPin, Phone, Mail } from "lucide-react";
import { resolveProfileImageFromCard } from "../../utils/profileImage";

const AyushCardPreview = ({ data, side = "front", onFlip, exportMode = false }) => {
  const BASE_WIDTH = 580;
  const BASE_HEIGHT = 340;

  const displayCardId =
    data?.applicationId || data?.id || data?.cardNo || data?._id || data?.card_id || "—";

  const [isFlipped, setIsFlipped] = useState(side === "back");
  const [previewScale, setPreviewScale] = useState(1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setIsFlipped(side === "back");
  }, [side]);

  useLayoutEffect(() => {
    if (exportMode) {
      setPreviewScale(1);
      return;
    }

    const element = wrapperRef.current;
    if (!element) return;

    const updateScale = () => {
      const containerWidth = element.clientWidth || BASE_WIDTH;
      const calculatedScale = Math.min(containerWidth / BASE_WIDTH, 1);
      setPreviewScale(calculatedScale);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    resizeObserver.observe(element);
    window.addEventListener("resize", updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [exportMode]);

  const handleFlip = () => {
    const newState = !isFlipped;
    setIsFlipped(newState);
    if (onFlip) onFlip(newState ? "back" : "front");
  };

  /* ================= FRONT ================= */

  const Front = () => (
    <div 
      className={`absolute inset-0 backface-hidden z-20`} 
      style={{ 
        backfaceVisibility: "hidden", 
        WebkitBackfaceVisibility: "hidden",
        opacity: isFlipped ? 0 : 1,
        pointerEvents: isFlipped ? "none" : "auto",
        zIndex: isFlipped ? 0 : 20,
        transition: "opacity 0.3s ease-in-out"
      }}
    >
      {/* Golden Wrapper */}
      <div className="h-full w-full bg-[#E5B556] rounded-[36px] py-[18px]">
        {/* Main Card */}
        <div
          className="absolute top-[18px] left-0 w-full h-[calc(100%-18px-45px)] bg-linear-to-r from-[#CC2B2B] to-[#F59E0B] px-6 py-5 text-white flex flex-col z-10"
          style={{ borderTopLeftRadius: "28px", borderTopRightRadius: "28px" }}
        >
          {/* Header */}
          <div className="flex justify-between mb-2">
            <div className="flex gap-3 items-center">
              <img src="/logo1.svg" alt="logo" className="w-14 h-14" />
              <div>
                <div className="border-t border-b border-white py-1 mb-1">
                  <h2 className="text-[16px] font-bold">BAIJNAATH KESAR</h2>
                  <h2 className="text-[16px] font-bold">BAI SEWA TRUST</h2>
                </div>
                <p className="text-[11px]">
                  Card ID: {displayCardId}
                </p>
              </div>
            </div>

            <div className="text-right">
              <h1 className="text-[24px] font-bold">AYUSH CARD</h1>
              <p className="text-[10px]">
                सेहत का सुरक्षा कवच - आयुष्य कार्ड के साथ !
              </p>
              <p className="text-[10px]">Health Shield - With Ayush Card!</p>
            </div>
          </div>

          {/* Body */}
          <div className="flex gap-4 flex-1 h-2/3">
            <div className="w-[110px] bg-white rounded-xl overflow-hidden border-2 border-black">
              {(() => {
                const getImageUrl = (url) => {
                  if (!url) return null;
                  if (typeof url !== "string") return null;
                  if (url.startsWith("data:") || url.startsWith("http") || url.startsWith("blob:")) return url;

                  // On localhost, Vite proxies /uploads/* — use relative path to avoid CORS
                  if (url.startsWith("/uploads")) return url;

                  let baseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "";
                  if (!baseUrl && window.location.hostname === "localhost") {
                    baseUrl = "https://bkbsbackend-production.up.railway.app";
                  }

                  const fileBase = baseUrl.replace(/\/api$/, "");
                  const cleanBase = fileBase.endsWith("/") ? fileBase.slice(0, -1) : fileBase;
                  return `${cleanBase}${url.startsWith("/") ? "" : "/"}${url}`;
                };

                const isImageLike = (path = "", mime = "") => {
                  const lower = path.toLowerCase();
                  if (/(\.jpg|\.jpeg|\.png|\.webp|\.gif)$/.test(lower)) return true;
                  if (lower.startsWith("data:image/")) return true;
                  if (mime && typeof mime === "string" && mime.toLowerCase().startsWith("image/")) return true;
                  return false;
                };

                let imgSrc = null;
                const profilePath = resolveProfileImageFromCard(data);

                if (isImageLike(profilePath, data?.profileImageMime)) {
                  imgSrc = getImageUrl(profilePath);
                }

                if (!imgSrc) {
                  imgSrc = "/gallery1.svg";
                }

                return (
                  <img
                    src={imgSrc}
                    alt="profile"
                    className="w-full h-full object-cover"
                  />
                );
              })()}
            </div>

            <div className="flex-1 bg-white text-black rounded-xl p-2 text-[13px] space-y-2 flex flex-col justify-center">
              <Row
                label="Name"
                value={
                  data?.applicant ||
                  [
                    data?.firstName || data?.applicantFirstName,
                    data?.middleName || data?.applicantMiddleName,
                    data?.lastName || data?.applicantLastName,
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                  "—"
                }
              />
              <Row label="DOB" value={data?.dob || "—"} muted={!data?.dob} />
              <Row label="Phone" value={data?.phone || data?.contact || "—"} />
              <Row
                label="Aadhaar No."
                value={
                  data?.aadhaarNumber ||
                  data?.aadhaarNo ||
                  data?.aadharNumber ||
                  "—"
                }
                muted={!data?.aadhaarNumber && !data?.aadhaarNo && !data?.aadharNumber}
              />
              <Row label="Reg Date" value={data?.dateApplied || data?.applicationDate || "—"} />
            </div>

            <div className="w-[115px] bg-white rounded-xl p-2 flex items-center justify-center">
              {(() => {
                const cardId =
                  data?.applicationId || data?.id || data?.cardNo || data?._id || "unknown";
                const verifyUrl = `${window.location.origin}/verify/${encodeURIComponent(cardId)}`;
                return (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyUrl)}`}
                    alt="qr"
                    className="w-full h-full border-2 border-black rounded"
                    crossOrigin="anonymous"
                  />
                );
              })()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-1.5 left-0 w-full h-10 px-4 flex justify-between items-center text-[11px] text-white">
          <span className="flex items-center gap-1">
            <MapPin size={12} className="inline mr-1 shrink-0" />{" "}
            <span className="truncate">
              {data?.ngoLocation || "Mangla Vihar Kanpur - 208015"}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Phone size={12} className="inline mr-1 shrink-0" />{" "}
            <span className="truncate">{data?.ngoPhone || "8303902030"}</span>
          </span>
          <span className="flex items-center gap-1">
            <Mail size={12} className="inline mr-1 shrink-0" />{" "}
            <span className="truncate">
              {data?.ngoEmail || "baijnaathkesarbaisewatrust9625@gmail.com"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );

  /* ================= BACK ================= */

  const Back = () => (
    <div
      className={`absolute inset-0 backface-hidden`}
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: exportMode ? "rotate(180deg)" : "rotateY(180deg)",
        opacity: isFlipped ? 1 : 0,
        pointerEvents: isFlipped ? "auto" : "none",
        zIndex: isFlipped ? 20 : 0,
        transition: "opacity 0.3s ease-in-out"
      }}
    >
      {/* Golden Wrapper */}
      <div className="h-full w-full bg-[#E5B556] rounded-[36px] relative shadow-lg">
        {/* Main Card (Red Gradient) */}
        <div
          className="absolute top-2.5 left-2.5 w-[calc(100%-55px)] h-[calc(100%-10px-10px)] bg-linear-to-tr from-[#CC2B2B] to-[#F59E0B] text-white flex flex-col z-10 overflow-hidden"
          style={{
            borderTopLeftRadius: "28px",
            borderBottomLeftRadius: "28px",
          }}
        >
          {/* Rotated Wrapper */}
          <div className="absolute top-1/2 left-1/2 w-[284px] h-[548px] -translate-x-1/2 -translate-y-1/2 -rotate-90 flex flex-col justify-end pt-5">
            {/* Header */}
            <div className="flex justify-between items-start w-full mb-4 ">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 bg-white rounded-full flex shrink-0 items-center justify-center">
                  <img
                    src="/logo1.svg"
                    alt="logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <div className="border-t-[1.5px] border-b-[1.5px] border-white py-0.5 mb-1 inline-block">
                    <h2 className="text-[10px] font-bold m-0 leading-tight tracking-wide">
                      BAIJNAATH KESAR
                    </h2>
                    <h2 className="text-[10px] font-bold m-0 leading-tight tracking-wide">
                      BAI SEWA TRUST
                    </h2>
                  </div>
                  <p className="text-[8px] m-0 font-medium">
                    Card ID:{" "}
                    {displayCardId}
                  </p>  
                </div>
              </div>
              <div className="text-right flex flex-col justify-center">
                <h1 className="text-[16px] font-bold m-0 text-white tracking-wide mb-1 leading-tight">
                  AYUSH CARD
                </h1>
                <p className="text-[7px] m-0 font-normal">
                  सेहत का सुरक्षा कवच - आयुष्य कार्ड के साथ !
                </p>
                <p className="text-[8px] m-0 font-normal mt-0.5">
                  Health Shield - With Ayush Card!
                </p>
              </div>
            </div>

            {/* Body */}
            {/* Table */}
            <div className="text-white text-center font-bold py-1 text-[12px] tracking-wide">
              Family Details
            </div>

            <div className="w-full bg-white mb-4 text-black shrink-0 border border-gray-300 rounded-xs overflow-hidden self-start">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-white text-[8px] font-bold border-b border-gray-200 text-[#1e293b]">
                    <th className="py-1.5 px-1 border-r border-gray-200 w-8">
                      Sr No
                    </th>
                    <th className="py-1.5 px-1 border-r border-gray-200">
                      Name
                    </th>
                    <th className="py-1.5 px-1 border-r border-gray-200 w-8">
                      Age
                    </th>
                    <th className="py-1.5 px-1">Relation</th>
                  </tr>
                </thead>
                <tbody className="text-[8px] font-medium text-black">
                  {(data?.members || []).slice(0, 5).map((m, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-200 last:border-0 hover:bg-slate-50"
                    >
                      <td className="py-1.5 px-1 border-r border-gray-200">
                        {i + 1}
                      </td>
                      <td className="py-1.5 px-1 border-r border-gray-200 text-left truncate max-w-13.75 font-semibold">
                        {m.name}
                      </td>
                      <td className="py-1.5 px-1 border-r border-gray-200">
                        {m.age}
                      </td>
                      <td className="py-1.5 px-1 truncate max-w-11.25">
                        {m.relation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Instructions & Dates */}
            <div className="flex-1 flex flex-col self-stretch pb-6">
              <div>
                <h3 className="font-semibold text-[11px] uppercase mb-1.5 text-center tracking-wide drop-shadow-sm">
                  Important Information / Instructions
                </h3>
                <ol className="text-[10px] list-decimal list-inside ml-0.5 text-white/95 font-medium">
                  <li>Carry this card during every hospital visit.</li>
                  <li>Inform NGO staff if the card is lost.</li>
                  <li>This card is non-transferable.</li>
                  <li>Update your info yearly with coordinator.</li>
                </ol>
              </div>

              <div className="gap-3 mt-4">
                <span className="text-[8px] font-bold tracking-wider drop-shadow-sm">
                  ISSUE DATE
                </span>
                <div className="bg-white text-black p-1.5 text-[8px] font-semibold flex-1 w-[150px] rounded border border-gray-300 shadow-sm leading-tight flex flex-col justify-center">
                  <div className="flex items-center">
                    <span className="w-16">Date</span>:{" "}
                    <span className="ml-1 font-medium">
                      {data?.issueDate || data?.cardIssueDate || "—"}
                    </span>
                  </div>
                  <div className="flex items-center mt-1">
                    <span className="w-16">Expiry Date</span>:{" "}
                    <span className="ml-1 font-medium">
                      {data?.expiryDate || data?.cardExpiredDate || "—"}
                    </span>
                  </div>
                </div>
              </div>

              {(data?.campName || data?.campId?.name || data?.camp) && (
                <div className="mt-auto pt-2 mb-2 flex items-center justify-center gap-1.5 border-t border-white/20">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-white/80">Issued Camp:</span>
                  <span className="text-[9px] font-bold text-white drop-shadow-sm">
                    {data.campName || data.campId?.name || data.camp}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer in Golden right edge (rotated) */}
        <div className="absolute right-1 top-0 h-full w-9 flex items-center justify-center">
          <div className="transform -rotate-90 text-[11px] text-white font-bold flex gap-6 whitespace-nowrap origin-center">
            <span className="flex items-center gap-1 drop-shadow-sm">
              <MapPin size={12} strokeWidth={2.5} className="inline mb-0.5" />{" "}
              {data?.ngoLocation || "Mangla Vihar Kanpur - 208015"}
            </span>
            <span className="flex items-center gap-1 drop-shadow-sm">
              <Phone size={12} strokeWidth={2.5} className="inline mb-0.5" />{" "}
              {data?.ngoPhone || "8303902030"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ================= RETURN ================= */

  return (
    <div className="flex justify-center items-center w-full h-full">
      <div
        ref={wrapperRef}
        className="w-full max-w-[580px] relative overflow-visible"
        style={{
          height: exportMode ? `${BASE_HEIGHT}px` : `${BASE_HEIGHT * previewScale}px`,
          perspective: exportMode ? "none" : "1000px",
        }}
      >
        <div
          className="absolute top-0 left-1/2 preserve-3d transition-transform duration-700 cursor-pointer"
          onClick={handleFlip}
          style={{
            width: `${BASE_WIDTH}px`,
            height: `${BASE_HEIGHT}px`,
            transformOrigin: "top center",
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transform: exportMode
              ? "translateX(-50%)"
              : `translateX(-50%) ${isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"} scale(${previewScale})`,
          }}
        >
          {exportMode ? (
            side === "front" ? <Front /> : <Back />
          ) : (
            <>
              <Front />
              <Back />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* Row Component */
const Row = ({ label, value, muted }) => (
  <div className="flex">
    <span className="w-20 font-bold">{label}</span>
    <span className="mr-2 font-bold">:</span>
    <span className={muted ? "text-gray-400" : "font-medium"}>{value}</span>
  </div>
);

export default AyushCardPreview;
