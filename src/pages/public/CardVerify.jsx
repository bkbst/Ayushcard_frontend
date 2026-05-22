import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { MapPin, Phone, Mail, CheckCircle, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { resolveProfileImageFromCard } from "../../utils/profileImage";

// Public (no-auth) axios instance — works without login
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

/* ─── tiny Row helper ─── */
const Row = ({ label, value }) => (
  <div className="flex gap-2">
    <span className="w-24 shrink-0 font-bold text-sm text-gray-700">{label}</span>
    <span className="text-sm font-medium text-gray-800">: {value || "—"}</span>
  </div>
);

/* ─── Status pill ─── */
const StatusPill = ({ status }) => {
  const s = (status || "").toLowerCase();
  const ok = s === "approved" || s === "active" || s === "verified";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
      ok ? "bg-green-100 text-green-700 border border-green-300"
         : "bg-red-100 text-red-700 border border-red-300"
    }`}>
      {ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
      {ok ? "Verified" : "Not Verified"}
    </span>
  );
};

/* ─── Main Page ─── */
export default function CardVerify() {
  const { cardId } = useParams();
  const [card, setCard]       = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!cardId) return;

    const doFetch = async () => {
      setLoading(true);
      setError("");

      let raw = null;

      // 1) Try lookup by cardNo / applicationId via new API endpoint
      try {
        const res = await publicApi.get(`/api/cards/card/${encodeURIComponent(cardId)}`);
        const d = res.data;
        raw = d?.data?.card || d?.data || d;
      } catch {
        // 2) Fall back to older query param approach if new one fails
        try {
          const res = await publicApi.get(`/api/cards?cardNo=${encodeURIComponent(cardId)}`);
          const d   = res.data;
          if (Array.isArray(d?.data)) raw = d.data[0];
          else raw = d?.data?.card || d?.data || d;
        } catch {
          /* ignore */
        }
      }

      if (!raw || (!raw._id && !raw.cardNo && !raw.applicationId)) {
        setError("Card not found or not accessible. Please check the QR code.");
        setLoading(false);
        return;
      }

      setCard(raw);

      // Fetch members
      try {
        const mId  = raw._id || cardId;
        const mRes = await publicApi.get(`/api/card-members/card/${mId}`);
        const mArr =
          Array.isArray(mRes.data?.data)          ? mRes.data.data :
          Array.isArray(mRes.data?.data?.members) ? mRes.data.data.members :
          Array.isArray(mRes.data)                ? mRes.data : [];
        setMembers(mArr.length > 0 ? mArr : (Array.isArray(raw.members) ? raw.members : []));
      } catch {
        setMembers(Array.isArray(raw.members) ? raw.members : []);
      }

      setLoading(false);
    };

    doFetch();
  }, [cardId]);

  /* ─── Loading ─── */
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={40} className="animate-spin text-orange-500" />
        <p className="text-gray-600 font-medium">Verifying Card…</p>
      </div>
    </div>
  );

  /* ─── Error ─── */
  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <XCircle size={56} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Card Not Found</h2>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    </div>
  );

  /* ─── Derived values ─── */
  const name      = [card.firstName, card.middleName, card.lastName].filter(Boolean).join(" ");
  const s         = (card.status || "").toLowerCase();
  const isVerified = s === "approved" || s === "active" || s === "verified";
  const cardNo    = card.applicationId || card._id || cardId;
  const ngoLocation = card.ngoLocation || "Mangla Vihar Kanpur - 208015";
  const ngoPhone    = card.ngoPhone    || "9927384859";
  const ngoEmail    = card.ngoEmail    || "baijnaathkesarbaisewatrust9625@gmail.com";

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col items-center justify-start py-8 px-4"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* Simple Header */}
      <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-8 text-center drop-shadow-sm">
        {isVerified ? "This Ayush Card is Verified" : "This Ayush Card is NOT Verified"}
      </h1>


      {/* Front card visual */}
      <div className="w-full max-w-lg rounded-[28px] overflow-hidden shadow-2xl mb-5">
        <div className="bg-gradient-to-r from-[#CC2B2B] to-[#F59E0B] p-5 text-white">
          {/* Card header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex gap-3 items-center">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0">
                <img src="/logo1.svg" alt="logo" className="w-full h-full object-contain rounded-full"
                  onError={(e) => { e.target.style.display = "none"; }} />
              </div>
              <div>
                <div className="border-t border-b border-white py-0.5 mb-1">
                  <p className="text-[13px] font-bold leading-tight">BAIJNAATH KESAR</p>
                  <p className="text-[13px] font-bold leading-tight">BAI SEWA TRUST</p>
                </div>
                <p className="text-[11px] text-white/80">Card ID: {cardNo}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-extrabold tracking-wide">AYUSH CARD</h2>
              <p className="text-[10px] mt-0.5 text-white/80">सेहत का सुरक्षा कवच – आयुष्य कार्ड के साथ!</p>
              <p className="text-[10px] text-white/80">Health Shield – With Ayush Card!</p>
            </div>
          </div>

          {/* Body row */}
          <div className="flex gap-3 items-start">
            {/* Photo */}
            <div className="w-20 h-24 bg-white rounded-xl overflow-hidden border-2 border-black shrink-0">
              {(() => {
                const profileSrc = resolveProfileImageFromCard(card);
                return profileSrc ? (
                  <img src={profileSrc} alt="profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs">No Photo</div>
                );
              })()}
            </div>

            {/* Info */}
            <div className="flex-1 bg-white text-black rounded-xl p-3 space-y-1">
              <Row label="Name"     value={name} />
              <Row label="W/o"      value={card.relatedPerson} />
              <Row label="DOB"      value={card.dob} />
              <Row label="Phone"    value={card.contact} />
              <Row label="Reg Date" value={card.applicationDate} />
            </div>

            {/* QR (self-referential) */}
            <div className="w-20 h-20 bg-white rounded-xl p-1 shrink-0 flex items-center justify-center border-2 border-black">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(window.location.href)}`}
                alt="qr"
                className="w-full h-full"
              />
            </div>
          </div>
        </div>

        {/* Golden footer */}
        <div className="bg-[#E5B556] px-4 py-2 flex justify-between items-center text-[11px] text-white gap-2">
          <span className="flex items-center gap-1 truncate"><MapPin size={11} />{ngoLocation}</span>
          <span className="flex items-center gap-1 shrink-0"><Phone size={11} />{ngoPhone}</span>
          <span className="flex items-center gap-1 truncate"><Mail size={11} />{ngoEmail}</span>
        </div>
      </div>



      {/* Back card — family members */}
      {members.length > 0 && (
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-md overflow-hidden mb-5">
          {/* Back card header */}
          <div className="bg-gradient-to-r from-[#CC2B2B] to-[#F59E0B] px-5 py-3 text-white">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold">BAIJNAATH KESAR BAI SEWA TRUST</p>
                <p className="text-[10px] text-white/70">card ID: {cardNo}</p>
              </div>
              <p className="text-base font-extrabold">AYUSH CARD</p>
            </div>
          </div>

          {/* Family table */}
          <div className="p-1">
            <p className="text-center font-bold text-sm py-2 text-gray-800">Family Details</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-xs font-bold text-gray-500">
                  <th className="py-2 px-3 border-b border-gray-200 text-left">Sr. No</th>
                  <th className="py-2 px-3 border-b border-gray-200 text-left">Name</th>
                  <th className="py-2 px-3 border-b border-gray-200 text-center">Age</th>
                  <th className="py-2 px-3 border-b border-gray-200 text-left">Relation</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                    <td className="py-2 px-3 font-semibold text-gray-800">{m.name}</td>
                    <td className="py-2 px-3 text-center text-gray-600">{m.age}</td>
                    <td className="py-2 px-3 text-gray-600">{m.relation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Instructions + Dates in gradient */}
          <div className="bg-gradient-to-r from-[#CC2B2B] to-[#F59E0B] px-5 py-4 text-white mt-1">
            <p className="text-xs font-bold uppercase mb-2 tracking-wide">Important Information / Instructions</p>
            <ol className="text-[11px] list-decimal list-inside space-y-0.5 text-white/90">
              <li>Carry this card during every hospital visit.</li>
              <li>Inform NGO staff if the card is lost.</li>
              <li>This card is non-transferable.</li>
              <li>Update your info yearly with coordinator.</li>
            </ol>

            <p className="text-[10px] font-bold uppercase mt-4 mb-1.5 tracking-wider">Issue Date</p>
            <div className="bg-white text-black rounded-lg px-3 py-2 text-xs font-semibold w-48 leading-relaxed">
              <div>Date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : {card.cardIssueDate || "—"}</div>
              <div>Expire Date : {card.cardExpiredDate || "—"}</div>
            </div>
          </div>

          {/* Back card footer */}
          <div className="bg-[#E5B556] px-4 py-2 flex justify-between items-center text-[11px] text-white gap-2">
            <span className="flex items-center gap-1 truncate"><MapPin size={11} />{ngoLocation}</span>
            <span className="flex items-center gap-1 shrink-0"><Phone size={11} />{ngoPhone}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full max-w-lg flex justify-center gap-4 mt-6 mb-8">
        <button
          onClick={() => window.history.back()}
          className="bg-[#0b646e] hover:bg-[#09525a] text-white px-6 py-2.5 rounded-md font-semibold text-sm transition-colors"
        >
          Go Back
        </button>
        <button
          onClick={() => window.print()}
          className="bg-[#0b646e] hover:bg-[#09525a] text-white px-6 py-2.5 rounded-md font-semibold text-sm transition-colors"
        >
          Download
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center max-w-sm mt-2 mb-8 hidden print:block">
        This page is auto-generated by scanning the QR code on the Ayush Card issued by
        Baijnaath Kesar Bai Sewa Trust.
      </p>
    </div>
  );
}
