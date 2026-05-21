import { User, UploadCloud, Check, Camera, Loader2, X as CloseIcon, Plus, ArrowLeft, ArrowRight, Banknote, CheckCircle2, ScanLine, FileText, ImageIcon, Calendar, RefreshCw } from "lucide-react";
import { useAyushCardForm } from "../AyushCardFormContext.jsx";
import AadhaarScanOverlay, { AadhaarCameraFrame } from "../components/AadhaarScanOverlay.jsx";

export default function Step1FamilyHead() {
  const form = useAyushCardForm();
  return <Step1FamilyHeadView {...form} />;
}

function Step1FamilyHeadView(form) {
  const { variant, isOpen, onClose, skipPayment, staffPaymentFlow, onStaffSubmit, onBack, currentStep, setCurrentStep, applicationId, setApplicationId, submissionReceipt, setSubmissionReceipt, toastWarn, toastError, toastSuccess, todayCampId, todayCampName, submitting, setSubmitting, docFront, setDocFront, docBack, setDocBack, docAadhaarBack, setDocAadhaarBack, ocrFileInputRef, aadhaarBackOcrInputRef, docBackInputRef, docBackCameraInputRef, headImageInputRef, headCameraVideoRef, headCameraCanvasRef, paymentInputRef, maxDobForAdult, paymentScreenshot, setPaymentScreenshot, isEditingReview, setIsEditingReview, declarationAccepted, setDeclarationAccepted, paymentMethod, setPaymentMethod, onlinePaymentLoading, setOnlinePaymentLoading, verifyLoading, setVerifyLoading, orderId, setOrderId, txnId, setTxnId, saveError, setSaveError, staffPaymentMode, setStaffPaymentMode, staffCashReceiptImage, setStaffCashReceiptImage, staffCashVideoRef, staffCashCanvasRef, staffCashCameraActive, staffCashCameraLoading, ocrLoading, ocrProgress, ocrStatusMessage, backOcrLoading, backOcrProgress, backOcrStatusMessage, videoRef, canvasRef, cameraActive, aadhaarBackVideoRef, aadhaarBackCanvasRef, aadhaarBackCameraActive, docBackVideoRef, docBackCanvasRef, docBackCameraActive, docBackCameraLoading, headImage, setHeadImage, headCameraActive, headCameraPermissionDenied, familyHead, setFamilyHead, headPhoneDuplicate, headAadhaarDuplicate, headNameDuplicate, members, setMembers, activeMemberTab, setActiveMemberTab, memberScanningIndex, memberScanProgress, memberOcrLoading, memberVideoRef, memberCanvasRef, memberCameraActive, memberInputRef, addMemberScrollAnchorRef, successStep, totalMembersCount, estimatedFee, extraMembersBeyondIncluded, stepperSteps, stepperProgressPct, footerStepMax, stopStaffCashCamera, handleRawBtPrint, resetForm, handleStaffChooseOfflineCash, handleStaffChooseOnline, handleAadhaarBackScanImage, handleScanImage, handleHeadChange, handleMemberChange, handleDocumentUpload, handleHeadImageUpload, handlePaymentScreenshotUpload, handleMemberScanImage, submitFinalApplication, buildStaffHealthCardPayload, submitStaffApplication, handleInitiateCashfreePayment, handleVerifyCashfreePayment, handleNext, handleBack, cardPreviewData, renderHeadDuplicateHint, thermalPaymentLabel, thermalPaymentRef, hasPrintableReceipt, captureHeadPhoto, stopHeadCamera, startHeadCamera, startCamera, stopCamera, capturePhoto, startAadhaarBackCamera, stopAadhaarBackCamera, captureAadhaarBackPhoto, startDocBackCamera, stopDocBackCamera, captureDocBackPhoto, addMember, removeMember, startMemberCamera, stopMemberCamera, captureMemberPhoto, captureStaffCashReceipt, setHeadCameraActive, setHeadCameraPermissionDenied, setMemberScanningIndex, setMemberScanProgress, setMemberOcrLoading, setMemberCameraActive, setStaffCashCameraLoading, setOcrLoading, setOcrProgress, setBackOcrLoading, setBackOcrProgress, setCameraActive, setAadhaarBackCameraActive, setDocBackCameraLoading, setDocBackCameraActive } = form;
  return (
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

                      {/* Aadhaar front — OCR */}
                      <div className="w-full md:flex-1 md:min-w-0 flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border border-[#fa8112]/30 bg-[#faf3e1] min-h-0">
                        <h4 className="w-full text-[11px] sm:text-[12px] font-bold text-[#222222] mb-0.5 text-center">
                          Aadhaar front — scan
                        </h4>
                        <p className="text-[10px] text-gray-500 text-center mb-2 px-1">
                          Name, DOB, gender &amp; Aadhaar number
                        </p>

                        {cameraActive ? (
                          <div className="w-full max-w-sm space-y-2 animate-in fade-in zoom-in-95">
                            <div className="relative aspect-[4/3] max-h-[200px] sm:max-h-[220px] bg-zinc-900 rounded-lg overflow-hidden shadow border border-white">
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain"
                              />
                              <AadhaarCameraFrame
                                label="Align Aadhaar front in frame"
                                hint="Point rear camera at the card — not your face"
                              />
                              <AadhaarScanOverlay
                                active={ocrLoading}
                                progress={ocrProgress}
                                statusMessage={ocrStatusMessage || "Scanning…"}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={stopCamera}
                                disabled={ocrLoading}
                                className="flex-1 py-2 text-[12px] bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold transition-all disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={capturePhoto}
                                disabled={ocrLoading}
                                className="flex-[2] py-2 text-[12px] bg-[#fa8112] text-white rounded-lg font-semibold shadow flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-70"
                              >
                                {ocrLoading ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : (
                                  <Camera size={16} />
                                )}
                                {ocrLoading ? "Scanning…" : "Capture & Scan"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative flex flex-col items-center group w-full min-h-[168px] justify-center rounded-lg">
                            <AadhaarScanOverlay
                              active={ocrLoading}
                              progress={ocrProgress}
                              statusMessage={ocrStatusMessage || "Scanning Aadhaar front…"}
                            />
                            <div
                              className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow mb-3 cursor-pointer hover:scale-105 transition-all border border-orange-100 group-hover:border-[#fa8112]"
                              onClick={ocrLoading ? undefined : startCamera}
                              role="presentation"
                            >
                              {ocrLoading ? (
                                <Loader2
                                  className="animate-spin text-[#fa8112]"
                                  size={24}
                                />
                              ) : docFront ? (
                                <Check size={24} className="text-green-600" />
                              ) : (
                                <Camera size={24} className="text-[#fa8112]" />
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 text-center mb-3 px-1">
                              Camera or gallery
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
                            {docFront && (
                              <p className="text-[11px] text-green-700 mt-2 text-center truncate max-w-full px-2">
                                {docFront.name}
                              </p>
                            )}
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
                      {/* Aadhaar back OCR — right of 1st document */}
                      <div className="w-full md:flex-1 md:min-w-0 flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border border-[#fa8112]/30 bg-[#faf3e1] min-h-0">
                        <h4 className="w-full text-[11px] sm:text-[12px] font-bold text-[#222222] mb-1 text-center">
                          Aadhaar back — scan
                        </h4>
                        <p className="text-[10px] text-gray-500 text-center mb-2 px-1">
                          Address &amp; pincode
                        </p>
                        {aadhaarBackCameraActive ? (
                          <div className="w-full max-w-sm space-y-2 animate-in fade-in zoom-in-95">
                            <div className="relative aspect-[4/3] max-h-[200px] sm:max-h-[220px] bg-zinc-900 rounded-lg overflow-hidden shadow border border-white">
                              <video ref={aadhaarBackVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                              <AadhaarCameraFrame
                                label="Align Aadhaar back in frame"
                                hint="Show address side of the card"
                              />
                              <AadhaarScanOverlay
                                active={backOcrLoading}
                                progress={backOcrProgress}
                                statusMessage={backOcrStatusMessage || "Scanning…"}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={stopAadhaarBackCamera} disabled={backOcrLoading} className="flex-1 py-2 text-[12px] bg-white border border-gray-200 text-gray-600 rounded-lg font-semibold disabled:opacity-50">Cancel</button>
                              <button type="button" onClick={captureAadhaarBackPhoto} disabled={backOcrLoading} className="flex-[2] py-2 text-[12px] bg-[#fa8112] text-white rounded-lg font-semibold shadow flex items-center justify-center gap-1.5 disabled:opacity-70">
                                {backOcrLoading ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
                                {backOcrLoading ? "Scanning…" : "Capture & Scan"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative flex flex-col items-center w-full min-h-[168px] justify-center rounded-lg">
                            <AadhaarScanOverlay
                              active={backOcrLoading}
                              progress={backOcrProgress}
                              statusMessage={backOcrStatusMessage || "Scanning Aadhaar back…"}
                            />
                            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow mb-3 cursor-pointer border border-orange-100 hover:border-[#fa8112]" onClick={backOcrLoading ? undefined : startAadhaarBackCamera} role="presentation">
                              {backOcrLoading ? <Loader2 className="animate-spin text-[#fa8112]" size={24} /> : docAadhaarBack ? <Check size={24} className="text-green-600" /> : <Camera size={24} className="text-[#fa8112]" />}
                            </div>
                            <p className="text-[11px] text-gray-500 text-center mb-3 px-1">Camera or gallery</p>
                            <div className="flex gap-2 w-full text-[12px] justify-center flex-wrap">
                              <button type="button" onClick={startAadhaarBackCamera} className="px-3 py-2 bg-[#fa8112] text-white rounded-lg font-semibold flex items-center gap-1.5"><Camera size={13} /> Camera</button>
                              <button type="button" onClick={() => aadhaarBackOcrInputRef.current?.click()} className="px-3 py-2 bg-white border border-[#fa8112] text-[#fa8112] rounded-lg font-semibold flex items-center gap-1.5"><UploadCloud size={13} /> Gallery</button>
                            </div>
                            {docAadhaarBack && <p className="text-[11px] text-green-700 mt-2 text-center truncate max-w-full px-2">{docAadhaarBack.name}</p>}
                          </div>
                        )}
                        <canvas ref={aadhaarBackCanvasRef} className="hidden" />
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

                        {/* 2nd document: file upload only — no OCR */}
                        <div className="mt-4 border-2 border-[#fa8112] bg-[#faf3e1] p-3 sm:p-4 rounded-xl flex flex-col">
                          <h4 className="font-bold text-[11px] sm:text-[12px] text-[#222222] mb-1 text-center">
                            2nd document — upload
                          </h4>

                          <div className="flex flex-1 flex-col items-center justify-center py-1 min-h-[100px]">
                            {docBackCameraActive ? (
                              <div className="w-full max-w-sm space-y-2 animate-in fade-in zoom-in-95">
                                <div className="relative aspect-[4/3] max-h-[200px] sm:max-h-[220px] bg-black rounded-lg overflow-hidden shadow border border-white">
                                  <video
                                    ref={docBackVideoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-2 border-white/50 border-dashed aspect-[1.6/1] rounded-lg pointer-events-none" />
                                  {docBackCameraLoading && (
                                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-6 transition-all animate-in fade-in">
                                      <Loader2 className="animate-spin text-white mb-2" size={24} />
                                      <p className="text-white text-[12px] font-bold animate-pulse">
                                        Capturing...
                                      </p>
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
                                    disabled={docBackCameraLoading}
                                    className="flex-[2] py-2 text-[12px] bg-[#fa8112] text-white rounded-lg font-semibold shadow flex items-center justify-center gap-1.5 active:scale-95"
                                  >
                                    {docBackCameraLoading ? (
                                      <Loader2 className="animate-spin" size={16} />
                                    ) : (
                                      <Camera size={16} />
                                    )}
                                    Capture
                                  </button>
                                </div>
                              </div>
                            ) : docBack ? (
                              <div className="w-full flex flex-col items-center justify-center py-4 px-4 rounded-lg transition-all shadow-sm bg-white border-2 border-green-500">
                                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white mb-3">
                                  <Check size={20} className="text-white" />
                                </div>
                                <span className="text-[14px] font-semibold text-[#222222]">
                                  2nd document added
                                </span>
                                <span className="text-[12px] text-gray-500 truncate w-full px-1 text-center max-w-[200px] mt-1 mb-3">
                                  {docBack.name}
                                </span>
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
                                    onClick={() => docBackInputRef.current?.click()}
                                    className="px-3 py-2 bg-white border border-[#fa8112] text-[#fa8112] rounded-lg font-semibold flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-all"
                                  >
                                    <UploadCloud size={13} /> Gallery
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center group w-full">
                                <div
                                  className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow mb-3 cursor-pointer hover:scale-105 transition-all border border-orange-100 group-hover:border-[#fa8112]"
                                  onClick={startDocBackCamera}
                                >
                                  <Camera size={24} className="text-[#fa8112]" />
                                </div>
                                <p className="text-[11px] text-gray-500 text-center mb-3 px-1">
                                  Camera or gallery — any supporting identity document (JPG/PNG).
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
                                    onClick={() => docBackInputRef.current?.click()}
                                    className="px-3 py-2 bg-white border border-[#fa8112] text-[#fa8112] rounded-lg font-semibold flex items-center justify-center gap-1.5 hover:bg-orange-50 transition-all"
                                  >
                                    <UploadCloud size={13} /> Gallery
                                  </button>
                                </div>
                              </div>
                            )}
                            <canvas ref={docBackCanvasRef} className="hidden" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
  );
}
