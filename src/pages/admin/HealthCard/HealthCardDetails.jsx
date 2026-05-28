import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2, FileText, UploadCloud, Trash2 } from "lucide-react";
import apiService from "../../../api/service";
import AyushCardPreview from "../../../components/admin/AyushCardPreview";
import { useToast } from "../../../components/ui/Toast";
import { isVerifiedStatus } from "../../../utils/healthCardUtils";
import {
  resolveDocumentFrontFromCard,
  resolveProfileImageFromCard,
} from "../../../utils/profileImage";

// Map API response fields → form fields
const apiToForm = (card) => ({
  // IDs
  _id: card._id || "",
  id: card.applicationId || card._id || "",
  // Application
  dateApplied: card.applicationDate || "",
  status: card.status || "pending",
  // Name (also build a combined 'applicant' for the card preview)
  applicantFirstName: card.firstName || "",
  applicantMiddleName: card.middleName || "",
  applicantLastName: card.lastName || "",
  applicant: [card.firstName, card.middleName, card.lastName].filter(Boolean).join(" "),
  // Contact
  phone: card.contact || "",
  altPhone: card.alternateContact || "",
  email: card.email || "",
  // Card info
  cardNumber: card.cardNo || "",
  cardNo: card.cardNo || "",   // alias used by preview
  issueDate: card.cardIssueDate || "",
  expiryDate: card.cardExpiredDate || "",
  verificationDate: card.verificationDate || "",
  // Members / payment
  totalMembers: card.totalMembers ?? card.totalMember ?? "",
  members: Array.isArray(card.members) ? card.members : [],
  payment: {
    applicationFee: 160,
    memberAddOns: Math.max(0, (Number(card.totalMembers ?? card.totalMember) || 0) - 4) * 40,
    totalPaid: Number((card.totalMembers ?? card.totalMember) || 0) <= 4 ? 160 : 160 + (Number((card.totalMembers ?? card.totalMember) || 0) - 4) * 40,
  },
  // Misc
  address: card.address || "",
  gender: card.gender || "",
  dob: card.dob || card.dateOfBirth || card.birthDate || "",
  relation: card.relation || "",
  relatedPerson: card.relatedPerson || "",
  aadhaarNumber: card.aadhaarNumber || card.aadhaarNo || card.aadharNumber || "",
  campName: card.campId?.name || card.campName || "",
  profileImage: resolveProfileImageFromCard(card),
  documentFront: resolveDocumentFrontFromCard(card),
  documentBack:
    card.documentBack ||
    card.secondDocument ||
    (Array.isArray(card.documents)
      ? card.documents.find((d) => {
          const n = String(d.name || "").toLowerCase();
          const t = String(d.type || "").toLowerCase();
          return (
            n === "documentback" ||
            n === "document_back" ||
            n === "seconddocument" ||
            n === "second_document" ||
            t === "aadhaar_back" ||
            t === "supporting_document"
          );
        })?.path
      : "") ||
    "",
  documents: Array.isArray(card.documents) ? card.documents : [],
  // NGO details for preview
  ngoLocation: card.ngoLocation,
  ngoPhone: card.ngoPhone,
  ngoEmail: card.ngoEmail,
});

// Map form fields → API payload
const formToApi = (f) => ({
  applicationDate: f.dateApplied,
  status: f.status,
  firstName: f.applicantFirstName,
  middleName: f.applicantMiddleName,
  lastName: f.applicantLastName,
  contact: f.phone,
  alternateContact: f.altPhone,
  email: f.email,
  cardNo: f.cardNumber,
  cardIssueDate: f.issueDate,
  cardExpiredDate: f.expiryDate,
  verificationDate: f.verificationDate,
  totalMember: Number(f.totalMembers) || 0,
  totalAmount: Number(f.payment?.totalPaid) || 0,
  address: f.address,
  gender: f.gender,
  dob: f.dob,
  relation: f.relation,
  relatedPerson: f.relatedPerson,
   aadhaarNumber: f.aadhaarNumber,
  documents: f.documents || [],
  members: f.members,
});

const HealthCardDetails = () => {
  const { id } = useParams();          // MongoDB _id (from HealthCard list navigation)
  const navigate = useNavigate();
  const location = useLocation();
  const { toastSuccess } = useToast();
  const docInputRef = useRef(null);
  const isAdminRoute = location.pathname.startsWith("/admin");
  const healthCardBase = isAdminRoute ? "/admin/health-card" : "/employee/health-card";

  const [isEditing, setIsEditing] = useState(location.state?.editMode || false);
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingFile, setPendingFile] = useState(null); // file to send with Save
  const [cardSide, setCardSide] = useState("front");

  // ── Fetch card + members on mount ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setFetchErr("");
      try {
        let res;
        try {
          // If the ID looks like a custom ID rather than mongo ObjectId, try to fetch by cardNo first
          res = await apiService.getHealthCardById(id);
        } catch (err) {
          if (err?.response?.status === 404) {
             res = await apiService.getHealthCardByCardNo(id);
          } else {
             throw err;
          }
        }
        // Response: { success, data: { card: {...} } } OR { data: {} } OR { data: [{...}] }
        const rawArray = Array.isArray(res?.data?.data) ? res.data.data : [];
        const raw = rawArray[0] || res?.data?.card || res?.data?.data || res?.data || res;
        const mapped = apiToForm(raw);
        setFormData(mapped);

        // Fetch members separately via GET /api/card-members/card/:_id
        const mongoId = raw._id || id;
        try {
          const mRes = await apiService.getCardMembers(mongoId);
          console.log("[HealthCardDetails] members response:", mRes);
          // Response shape: { data: [...] } or { data: { members: [...] } } or [...]
          const mRaw =
            Array.isArray(mRes?.data) ? mRes.data :
              Array.isArray(mRes?.data?.members) ? mRes.data.members :
                Array.isArray(mRes) ? mRes :
                  [];
          if (mRaw.length > 0) {
            setFormData((prev) => ({ ...prev, members: mRaw }));
          }
        } catch (mErr) {
          // Members API failed — keep whatever came from the card response
          console.warn("[HealthCardDetails] members fetch failed:", mErr?.response?.data || mErr?.message);
        }
      } catch (err) {
        console.error("[HealthCardDetails] fetch failed:", err?.response?.data || err?.message);
        setFetchErr("Could not load card from server.");
        setFormData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);


  // ── Payment auto-calc ────────────────────────────────────────────────────
  useEffect(() => {
    if (!formData) return;
    const n = Number(formData.totalMembers) || 0;
    setFormData((prev) => ({
      ...prev,
      payment: { 
        ...prev.payment, 
        memberAddOns: Math.max(0, n - 4) * 40, 
        totalPaid: n <= 4 ? 160 : 160 + (n - 4) * 40 
      },
    }));
  }, [formData?.totalMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleChange = (e, field) => {
    let value = e.target.value;
    if (["applicantFirstName", "applicantMiddleName", "applicantLastName", "applicant", "relatedPerson"].includes(field))
      value = value.replace(/[^a-zA-Z\s]/g, "");
    else if (["phone", "altPhone"].includes(field))
      value = value.replace(/\D/g, "").slice(0, 10);
    else if (["payment.totalPaid", "cardNumber", "totalMembers"].includes(field))
      value = value.replace(/[^0-9.]/g, "");
    if (field === "totalMembers" && Number(value) > 7) value = "7";
    if (field.startsWith("payment.")) {
      setFormData((prev) => ({ ...prev, payment: { ...prev.payment, [field.split(".")[1]]: value } }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return "";
    if (dateStr.includes("-") && dateStr.split("-")[0].length === 4) return dateStr;
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  };

  const handleDateChange = (e, field) => {
    const val = e.target.value;
    if (!val) { setFormData((prev) => ({ ...prev, [field]: "" })); return; }
    const parts = val.split("-");
    setFormData((prev) => ({
      ...prev,
      [field]: parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : val,
    }));
  };

  // Profile image upload (local preview only — document upload goes to API)
  // Not currently used in UI - keeping for future but commenting out logic
  // const handleImageUpload = (e) => { ... };

  // Document file selected → store in state, send with Save Changes
  const handleDocSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);

    // Use FileReader to get a base64 data URL — blob URLs can't cross origins
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        documents: [
          ...(prev.documents || []),
          { name: file.name, path: reader.result, pending: true },
        ],
      }));
    };
    reader.readAsDataURL(file);

    if (docInputRef.current) docInputRef.current.value = "";
  };

  // Save — two API calls:
  //   PATCH /api/cards/:id/status  → status field
  //   PUT   /api/cards/:id         → all other fields + optional file
  const handleSave = async () => {
    setSaveLoading(true);
    setSaveError("");
    try {
      const mongoId = formData._id || id;

      // 1. Upload any base64 documents first
      const uploadedDocs = await Promise.all(
        (formData.documents || []).map(async (doc) => {
          if (doc.path && doc.path.startsWith("data:")) {
            try {
              const res = await apiService.uploadBase64(doc.path, doc.name || "document.jpg", "card-documents");
              return {
                name: doc.name,
                path: res.data?.path || res.data?.url || res.data || "",
                type: doc.type || "supporting_document",
              };
            } catch (err) {
              console.error("Failed to upload document", doc.name, err);
              throw new Error(`Failed to upload ${doc.name || "document"}.`);
            }
          }
          return {
            name: doc.name,
            path: doc.path,
            type: doc.type || "supporting_document",
          };
        })
      );

      const payload = {
        ...formToApi(formData),
        documents: uploadedDocs,
      };

      console.log("[HealthCardDetails] saving:", { mongoId, status: payload.status });

      await Promise.all([
        // Status via PATCH
        apiService.updateHealthCardStatus(mongoId, payload.status),
        // All other fields (+ documents) via JSON PUT
        apiService.updateHealthCard(mongoId, { ...payload, status: undefined }, null),
      ]);

      setPendingFile(null);
      setFormData((prev) => ({
        ...prev,
        documents: uploadedDocs.map((d) => ({ ...d, pending: false })),
      }));
      setIsEditing(false);

      if (isVerifiedStatus(payload.status)) {
        toastSuccess("Card verified. It is now listed under Verified Cards.");
        navigate(`${healthCardBase}/verified`, { replace: true });
      } else {
        navigate(".", { replace: true, state: { editMode: false } });
      }
    } catch (err) {
      console.error("[HealthCardDetails] save failed:", err?.response?.data || err?.message);
      setSaveError(
        `${err?.response?.status ? `API Error (${err.response.status}): ` : ""}` +
        (err?.response?.data?.message || err?.message || "Save failed.")
      );
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Render states ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24">
        <Loader2 size={36} className="animate-spin text-[#F68E5F] mb-3" />
        <p className="text-sm text-gray-500">Loading application…</p>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24">
        <p className="text-red-500 font-medium mb-4">{fetchErr || "Card not found."}</p>
        <button onClick={() => navigate(-1)} className="text-[#F68E5F] underline text-sm">Go back</button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-[#FFFFFF] pb-10"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 border border-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold text-[#22333B]">
            Application Details
          </h2>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          {isEditing ? (
            <>
              <button
                onClick={() => { setIsEditing(false); setSaveError(""); }}
                disabled={saveLoading}
                className="flex-1 sm:flex-none px-4 py-1.5 border border-gray-200 rounded-lg text-[15px] font-medium text-[#374151] hover:bg-gray-50 bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="flex-1 sm:flex-none px-4 py-1.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[15px] font-medium hover:bg-[#ff702d] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saveLoading && <Loader2 size={14} className="animate-spin" />}
                {saveLoading ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-full sm:w-auto px-4 py-1.5 bg-[#F68E5F] text-[#FFFCFB] rounded-lg text-[15px] font-medium hover:bg-[#ff6e2b] flex items-center justify-center gap-2 transition-colors"
            >
              Edit
              <img src="/admin_images/Edit 3.svg" alt="" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* API save error banner */}
      {saveError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[13px]">
          {saveError}
        </div>
      )}

      <div className="space-y-6">
        {/* Application Details Section */}
        <div className="border border-[#E2E8F0] rounded-xl p-4 sm:p-6 bg-white">
          <h3 className="font-bold text-[16px] text-[#22333B] mb-5">
            Application Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Application ID</label>
              <input type="text" value={formData.id} readOnly
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none bg-[#F8FAFC]" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Application Date</label>
              <input type="date" value={formatDateForInput(formData.dateApplied)}
                onChange={(e) => handleDateChange(e, "dateApplied")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Status</label>
              <div className="relative">
                <select value={formData.status || ""}
                  onChange={(e) => handleChange(e, "status")} disabled={!isEditing}
                  className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none appearance-none ${!isEditing ? "bg-gray-50" : "bg-white"}`}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">First Name</label>
              <input type="text" value={formData.applicantFirstName || ""}
                onChange={(e) => handleChange(e, "applicantFirstName")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Middle Name</label>
              <input type="text" value={formData.applicantMiddleName || ""}
                onChange={(e) => handleChange(e, "applicantMiddleName")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Last Name</label>
              <input type="text" value={formData.applicantLastName || ""}
                onChange={(e) => handleChange(e, "applicantLastName")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Phone Number</label>
              <input type="text" value={formData.phone || ""}
                onChange={(e) => handleChange(e, "phone")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Alternate Number</label>
              <input type="text" value={formData.altPhone || ""}
                onChange={(e) => handleChange(e, "altPhone")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Email</label>
              <input type="email" value={formData.email || ""}
                onChange={(e) => handleChange(e, "email")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Gender</label>
              <div className="relative">
                <select value={formData.gender || ""}
                  onChange={(e) => handleChange(e, "gender")} disabled={!isEditing}
                  className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none appearance-none ${!isEditing ? "bg-gray-50" : "bg-white"}`}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Date of birth</label>
              <input type="date" value={formatDateForInput(formData.dob)}
                onChange={(e) => handleDateChange(e, "dob")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Relation</label>
              <div className="relative">
                <select value={formData.relation || ""}
                  onChange={(e) => handleChange(e, "relation")} disabled={!isEditing}
                  className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none appearance-none ${!isEditing ? "bg-gray-50" : "bg-white"}`}>
                  <option value="">Select Relation</option>
                  <option value="Self">Self</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Child">Child</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Related person</label>
              <input type="text" value={formData.relatedPerson || ""}
                onChange={(e) => handleChange(e, "relatedPerson")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            {formData.campName && (
              <div>
                <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Camp</label>
                <input type="text" value={formData.campName} readOnly
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none bg-[#F8FAFC]" />
              </div>
            )}
          </div>

          <div className="mb-5">
            <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Address</label>
            <textarea rows={2} value={formData.address || ""}
              onChange={(e) => handleChange(e, "address")} disabled={!isEditing}
              className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none resize-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Card Issue Date</label>
              <input type="date" value={formatDateForInput(formData.issueDate)}
                onChange={(e) => handleDateChange(e, "issueDate")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Card Expiry Date</label>
              <input type="date" value={formatDateForInput(formData.expiryDate)}
                onChange={(e) => handleDateChange(e, "expiryDate")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Verification Date</label>
              <input type="date" value={formatDateForInput(formData.verificationDate)}
                onChange={(e) => handleDateChange(e, "verificationDate")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Total Members</label>
              <input type="text" value={formData.totalMembers ?? ""}
                onChange={(e) => handleChange(e, "totalMembers")} disabled={!isEditing}
                className={`w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none ${!isEditing ? "bg-gray-50" : "bg-white"}`} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Total Amount Paid</label>
              <input type="text" value={formData.payment?.totalPaid || ""} readOnly
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[14px] text-[#22333B] focus:outline-none bg-gray-50" />
            </div>
          </div>
        </div>

        {/* Upload & QR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Document Upload */}
          <div className="border border-[#E2E8F0] rounded-xl p-4 sm:p-6 bg-white flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-[15px] text-[#22333B]">Document Upload</h3>
              <p className="text-[13px] text-[#6D6D6D] mt-1">Upload supporting documents (Aadhaar, photo, etc.)</p>
            </div>

            {/* Drop zone */}
            <div className="border border-dashed border-[#1849D6] rounded-xl flex flex-col items-center justify-center p-6 bg-[#FFFFFF]">
              <div className="w-10 h-10 bg-white text-[#1849D6] rounded-xl flex items-center justify-center mb-3">
                <UploadCloud size={22} />
              </div>
              <p className="text-[13px] text-[#0F172A] font-medium mb-1">
                {pendingFile ? pendingFile.name : "Drag & drop or browse a file"}
              </p>
              {pendingFile && (
                <p className="text-[11px] text-amber-600 mb-3">Will be uploaded on Save Changes</p>
              )}
              {!pendingFile && (
                <p className="text-[11px] text-[#94A3B8] mb-3">Documents sent with Save Changes</p>
              )}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                ref={docInputRef}
                onChange={handleDocSelect}
              />
              <button
                onClick={() => docInputRef.current?.click()}
                className="px-3 py-1.5 border border-[#1849D6] text-[#1849D6] rounded-lg text-[13px] font-medium bg-white hover:bg-[#1849D6] hover:text-white transition-colors"
              >
                {pendingFile ? "Change File" : "Browse Files"}
              </button>
            </div>

            {/* Documents list */}
            {formData.documents && formData.documents.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">
                  Documents ({formData.documents.length})
                </p>
                {formData.documents.map((doc, i) => {
                  const resolveUrl = (path) => {
                    if (!path) return "";
                    if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) return path;
                    
                    let baseUrl = import.meta.env.VITE_API_BASE_URL || "";
                    if (!baseUrl && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
                      baseUrl = "https://bkbsbackend-production.up.railway.app";
                    }

                    const fileBase = baseUrl.replace(/\/api$/, "");
                    const cleanBase = fileBase.endsWith("/") ? fileBase.slice(0, -1) : fileBase;
                    const cleanPath = path.startsWith("/") ? path : `/${path}`;
                    return `${cleanBase}${cleanPath}`;
                  };

                  const handleView = (e) => {
                    e.preventDefault();
                    const url = resolveUrl(doc.url || doc.path);
                    if (!url) return;
                    
                    if (url.startsWith('data:')) {
                      const newWindow = window.open();
                      if (newWindow) {
                        newWindow.document.write(`
                          <html>
                            <head><title>Document View</title></head>
                            <body style="margin:0; padding:0; height:100vh; overflow:hidden;">
                              <iframe src="${url}" frameborder="0" style="border:0; width:100%; height:100%;" allowfullscreen></iframe>
                            </body>
                          </html>
                        `);
                        newWindow.document.close();
                      }
                    } else {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  };

                  return (
                    <div
                      key={i}
                      onClick={handleView}
                      className="flex items-center gap-2 px-3 py-2 border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors group cursor-pointer"
                    >
                      <FileText size={16} className="text-[#1849D6] shrink-0" />
                      <span className="text-[13px] text-[#22333B] truncate flex-1">
                        {doc.name || doc.originalName || `Document ${i + 1}`}
                      </span>
                      {doc.pending ? (
                        <span className="text-[11px] text-amber-600 font-medium">Pending save</span>
                      ) : (
                        <span className="text-[11px] text-[#94A3B8] group-hover:text-[#1849D6]">View →</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-[#94A3B8] text-center">No documents uploaded yet.</p>
            )}
          </div>

          {/* QR Code */}
          <div className="border border-[#E2E8F0] rounded-xl p-4 sm:p-6 bg-white flex flex-col">
            <h3 className="font-bold text-[15px] text-[#22333B]">QR Code</h3>
            <p className="text-[13px] text-[#6D6D6D] mb-5">A Unique QR code of your Ayush Card</p>
            <div className="flex-1 flex items-center justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/verify/${formData.id}`)}`}
                alt="QR"
                className="w-45 h-45 object-contain border-4 border-black rounded-lg p-1"
              />
            </div>
          </div>
        </div>

        {/* Members Table */}
        <div className="border border-[#E2E8F0] rounded-xl bg-white overflow-hidden">
          <div className="p-4 border border-[#E2E8F0]">
            <h3 className="font-bold text-[15px] text-[#22333B]">
              Included Members ({formData.members?.length || 0})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC]">
                <tr>
                  <th className="py-4 px-6 text-[12px] font-bold text-[#64748B] uppercase tracking-wider w-25">SR. NO</th>
                  <th className="py-4 px-6 text-[12px] font-bold text-[#64748B] uppercase tracking-wider min-w-50">MEMBER NAME</th>
                  <th className="py-4 px-6 text-[12px] font-bold text-[#64748B] uppercase tracking-wider min-w-37.5">RELATION</th>
                  <th className="py-4 px-6 text-[12px] font-bold text-[#64748B] uppercase tracking-wider min-w-25">AGE</th>
                  <th className="py-4 px-6 text-[12px] font-bold text-[#64748B] uppercase tracking-wider min-w-37.5">DOCUMENT ID</th>
                  {isEditing && <th className="py-4 px-6 text-[12px] font-bold text-[#64748B] uppercase tracking-wider w-24">ACTIONS</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {formData.members?.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="py-4 px-6 text-[14px] text-[#475569]">{i + 1}</td>
                    <td className="py-4 px-6">
                      {isEditing ? (
                        <input type="text" value={m.name || ""} placeholder="Name"
                          onChange={(e) => { const nm = [...formData.members]; nm[i] = { ...nm[i], name: e.target.value }; setFormData({ ...formData, members: nm }); }}
                          className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-[14px]" />
                      ) : <span className="text-[14px] font-semibold text-[#1E293B]">{m.name}</span>}
                    </td>
                    <td className="py-4 px-6">
                      {isEditing ? (
                        <input type="text" value={m.relation || ""} placeholder="Relation"
                          onChange={(e) => { const nm = [...formData.members]; nm[i] = { ...nm[i], relation: e.target.value }; setFormData({ ...formData, members: nm }); }}
                          className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-[14px]" />
                      ) : <span className="text-[14px] text-[#475569]">{m.relation}</span>}
                    </td>
                    <td className="py-4 px-6">
                      {isEditing ? (
                        <input type="text" value={m.age || ""} placeholder="Age"
                          onChange={(e) => { const nm = [...formData.members]; nm[i] = { ...nm[i], age: e.target.value }; setFormData({ ...formData, members: nm }); }}
                          className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-[14px]" />
                      ) : <span className="text-[14px] text-[#475569]">{m.age}</span>}
                    </td>
                    <td className="py-4 px-6">
                      {isEditing ? (
                        <input type="text" value={m.docId || m.documentId || ""} placeholder="Document ID"
                          onChange={(e) => { const nm = [...formData.members]; nm[i] = { ...nm[i], docId: e.target.value }; setFormData({ ...formData, members: nm }); }}
                          className="w-full border border-[#E2E8F0] rounded px-3 py-2 text-[14px]" />
                      ) : <span className="text-[14px] text-[#475569]">{m.docId || m.documentId || "—"}</span>}
                    </td>
                    {isEditing && (
                      <td className="py-4 px-6">
                        <button onClick={() => setFormData({ ...formData, members: formData.members.filter((_, idx) => idx !== i) })}
                          className="text-red-500 hover:text-red-700 text-[14px] font-medium">Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
                {(!formData.members || formData.members.length === 0) && (
                  <tr><td colSpan={isEditing ? 6 : 5} className="py-8 text-center text-gray-400">No members added yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {isEditing && (formData.members?.length || 0) < 7 && (
            <div className="p-4 border-t border-[#E2E8F0]">
              <button
                onClick={() => setFormData((prev) => ({ ...prev, members: [...(prev.members || []), { name: "", relation: "", age: "" }] }))}
                className="text-[#F68E5F] font-normal text-[14px] flex items-center gap-1.5 hover:text-[#e57745] transition-colors"
              >
                Add Member <span className="text-lg leading-none pb-0.5">+</span>
              </button>
            </div>
          )}
        </div>

        {/* Card Preview */}
        <div className="border border-[#F1F5F9] rounded-xl bg-white overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-white">
            <h3 className="font-bold text-[16px] text-[#22333B]">Card Preview</h3>
            <div className="flex bg-[#F8FAFC] p-1 rounded-lg">
              {["front", "back"].map((side) => (
                <button key={side} onClick={() => setCardSide(side)}
                  className={`px-6 py-1.5 rounded-md text-[13px] font-semibold transition-all ${cardSide === side ? "bg-white shadow-sm text-[#0F172A]" : "text-[#64748B] hover:text-[#0F172A]"}`}>
                  {side.charAt(0).toUpperCase() + side.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-[#F8FAFC] p-4 sm:p-8 md:p-12 flex flex-col items-center justify-center min-h-[360px] sm:min-h-112.5">
            <AyushCardPreview data={formData} side={cardSide} onFlip={(side) => setCardSide(side)} />
            <p className="text-[13px] text-[#94A3B8] mt-6 sm:mt-10 flex items-center gap-2 font-medium text-center">
              <img src="/admin_images/click.svg" alt="click" /> Click the card or use the buttons to flip • Preview reflects saved application data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthCardDetails;
