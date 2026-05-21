import { User, UploadCloud, Check, Camera, Loader2, X as CloseIcon, Plus, ArrowLeft, ArrowRight, Banknote, CheckCircle2, ScanLine, FileText, ImageIcon, Calendar, RefreshCw } from "lucide-react";
import { useAyushCardForm } from "../AyushCardFormContext.jsx";
import { AadhaarCameraScanner } from "../components/AadhaarCameraScanner.jsx";

export default function Step2Members() {
  const form = useAyushCardForm();
  return <Step2MembersView {...form} />;
}

function Step2MembersView(form) {
  const { variant, isOpen, onClose, skipPayment, staffPaymentFlow, onStaffSubmit, onBack, currentStep, setCurrentStep, applicationId, setApplicationId, submissionReceipt, setSubmissionReceipt, toastWarn, toastError, toastSuccess, todayCampId, todayCampName, submitting, setSubmitting, docFront, setDocFront, docBack, setDocBack, docAadhaarBack, setDocAadhaarBack, ocrFileInputRef, aadhaarBackOcrInputRef, docBackInputRef, docBackCameraInputRef, headImageInputRef, headCameraVideoRef, headCameraCanvasRef, paymentInputRef, maxDobForAdult, paymentScreenshot, setPaymentScreenshot, isEditingReview, setIsEditingReview, declarationAccepted, setDeclarationAccepted, paymentMethod, setPaymentMethod, onlinePaymentLoading, setOnlinePaymentLoading, verifyLoading, setVerifyLoading, orderId, setOrderId, txnId, setTxnId, saveError, setSaveError, staffPaymentMode, setStaffPaymentMode, staffCashReceiptImage, setStaffCashReceiptImage, staffCashVideoRef, staffCashCanvasRef, staffCashCameraActive, staffCashCameraLoading, ocrLoading, ocrProgress, backOcrLoading, backOcrProgress, videoRef, canvasRef, cameraActive, aadhaarBackVideoRef, aadhaarBackCanvasRef, aadhaarBackCameraActive, docBackVideoRef, docBackCanvasRef, docBackCameraActive, docBackCameraLoading, headImage, setHeadImage, headCameraActive, headCameraPermissionDenied, familyHead, setFamilyHead, headPhoneDuplicate, headAadhaarDuplicate, headNameDuplicate, members, setMembers, activeMemberTab, setActiveMemberTab, memberScanningIndex, memberScanProgress, memberOcrLoading, memberVideoRef, memberCanvasRef, memberCameraActive, memberCameraLoading, memberCameraError, memberInputRef, addMemberScrollAnchorRef, successStep, totalMembersCount, estimatedFee, extraMembersBeyondIncluded, stepperSteps, stepperProgressPct, footerStepMax, stopStaffCashCamera, handleRawBtPrint, resetForm, handleStaffChooseOfflineCash, handleStaffChooseOnline, handleAadhaarBackScanImage, handleScanImage, handleHeadChange, handleMemberChange, handleDocumentUpload, handleHeadImageUpload, handlePaymentScreenshotUpload, handleMemberScanImage, submitFinalApplication, buildStaffHealthCardPayload, submitStaffApplication, handleInitiateCashfreePayment, handleVerifyCashfreePayment, handleNext, handleBack, cardPreviewData, renderHeadDuplicateHint, thermalPaymentLabel, thermalPaymentRef, hasPrintableReceipt, captureHeadPhoto, stopHeadCamera, startHeadCamera, startCamera, stopCamera, capturePhoto, startAadhaarBackCamera, stopAadhaarBackCamera, captureAadhaarBackPhoto, startDocBackCamera, stopDocBackCamera, captureDocBackPhoto, addMember, removeMember, startMemberCamera, stopMemberCamera, captureMemberPhoto, captureStaffCashReceipt, setHeadCameraActive, setHeadCameraPermissionDenied, setMemberScanningIndex, setMemberScanProgress, setMemberOcrLoading, setMemberCameraActive, setStaffCashCameraLoading, setOcrLoading, setOcrProgress, setBackOcrLoading, setBackOcrProgress, setCameraActive, setAadhaarBackCameraActive, setDocBackCameraLoading, setDocBackCameraActive } = form;
  return (
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
                            {memberCameraLoading ? (
                              <div
                                className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg bg-zinc-900/90 min-h-[120px]"
                                role="status"
                                aria-live="polite"
                              >
                                <Loader2
                                  className="animate-spin text-[#FA8112]"
                                  size={28}
                                />
                                <p className="text-[12px] text-white font-medium">
                                  Starting camera…
                                </p>
                              </div>
                            ) : memberCameraActive ? (
                              <div className="space-y-3">
                                <AadhaarCameraScanner
                                  videoRef={memberVideoRef}
                                  hint="Hold ID card flat inside the frame"
                                />
                                <canvas
                                  ref={memberCanvasRef}
                                  className="hidden"
                                  aria-hidden
                                />
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button
                                    type="button"
                                    onClick={captureMemberPhoto}
                                    disabled={
                                      memberOcrLoading || memberCameraLoading
                                    }
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-[#FA8112] text-white rounded-lg hover:bg-[#E47510] font-semibold text-[10px] sm:text-[13px] leading-tight disabled:opacity-60"
                                  >
                                    {memberOcrLoading ? (
                                      <Loader2
                                        className="animate-spin"
                                        size={16}
                                      />
                                    ) : (
                                      <Check size={16} />
                                    )}{" "}
                                    Capture & Scan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => stopMemberCamera()}
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 font-semibold text-[10px] sm:text-[13px] leading-tight disabled:opacity-60"
                                  >
                                    <CloseIcon size={16} /> Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {memberCameraError ? (
                                  <div
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
                                    role="alert"
                                  >
                                    <p className="text-[12px] text-red-700 font-medium">
                                      {memberCameraError}
                                    </p>
                                  </div>
                                ) : null}
                                {memberOcrLoading || memberScanProgress > 0 ? (
                                  <div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                      <div
                                        className="bg-[#FA8112] h-2 rounded-full transition-all"
                                        style={{
                                          width: `${memberScanProgress}%`,
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
                                    type="button"
                                    onClick={() =>
                                      startMemberCamera(activeMemberTab - 1)
                                    }
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-[#FA8112] text-white rounded-lg hover:bg-[#E47510] font-semibold text-[10px] sm:text-[13px] leading-tight disabled:opacity-60"
                                  >
                                    <Camera size={16} /> Use Camera
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      memberInputRef.current?.click()
                                    }
                                    disabled={memberOcrLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 bg-[#FA8112] text-white rounded-lg hover:bg-[#E47510] font-semibold text-[10px] sm:text-[13px] leading-tight disabled:opacity-60"
                                  >
                                    <UploadCloud size={16} /> Upload Photo
                                  </button>
                                </div>
                                <input
                                  ref={memberInputRef}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) =>
                                    handleMemberScanImage(
                                      e,
                                      activeMemberTab - 1,
                                    )
                                  }
                                  className="hidden"
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
  );
}
