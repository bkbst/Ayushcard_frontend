import React from "react";
import { X, Printer } from "lucide-react";
import { LOGO_BASE64 } from "../../../../utils/logoBase64";
import { PENALTY_AMOUNT } from "./vitranUtils";
import PenaltyReceiptPreview from "./PenaltyReceiptPreview";

const ViewPenaltyModal = ({ record, onClose }) => {
  const handlePrint = () => {
    const c = record.card;
    const pw = window.open("", "_blank", "width=400,height=820,status=no,toolbar=no,menubar=no");
    if (!pw) { alert("Pop-up blocked!"); return; }
    pw.document.open();
    pw.document.write(`
<!DOCTYPE html><html><head><title>Penalty Receipt - ${record.receiptNo}</title>
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
  <div class="title">Penelty Recept</div>
  <div class="trust-header">
    <div class="trust-name">Baijnaath Kesar Bai Sewa Trust</div>
    <div class="address-line">1-A Mangla Vihar New PAC Line</div>
    <div class="address-line">Kanpur Nagar – 208015</div>
  </div>
  <div style="margin-bottom:10px; font-size:10.5px;">
    <div class="field-row"><span><b>Date :-</b> ${record.issuedAt}</span></div>
    <div class="field-row"><span><b>Card ID No :-</b> ${c?.id || "—"}</span></div>
    <div class="field-row"><span><b>Camp Area :-</b> ${c?.area || "Mangla Vihar"}</span></div>
    <div class="field-row"><span><b>Mukhiya Name :-</b> ${c?.mukhiyaName || c?.clientName || "—"}</span></div>
    <div class="field-row"><span><b>Full Address :-</b> ${c?.address || "—"}</span></div>
    <div class="field-row"><span><b>District :-</b> ${c?.district || "Kanpur Nagar"}</span></div>
    <div class="field-row"><span><b>Pin Code :-</b> ${c?.pincode || "208015"}</span><span><b>Total Member :-</b> ${c?.totalMember || 1}</span></div>
  </div>
  <div class="penalty-box">Penelty Amount :- Rs. ${PENALTY_AMOUNT}.00</div>
  <div class="dup-info">
    Receipt No :- ${record.receiptNo}<br/>
    Payment Method :- ${record.paymentMethod === "online" ? "Online (UPI/Net Banking)" : "Offline (Cash)"}<br/>
    ${record.paymentRef ? `Ref :- ${record.paymentRef}<br/>` : ""}
    Status :- ${record.paymentStatus === "paid" ? "✓ Paid" : "⏳ Pending"}
  </div>
  <div class="hindi-heading">महत्वपूर्ण जानकारी</div>
  <p class="hindi-para">कार्ड का उपयोग करने से पूर्व, कृपया कार्ड के साथ दिए किए गए लेटर को ध्यानपूर्वक अवश्य पढ़ें।</p>
  <p class="hindi-para">किसी भी प्रकार की समस्या या सहायता हेतु, कृपया कार्ड के साथ दिए गए हेल्पलाइन नंबर 8303902030 पर संपर्क करें।</p>
  <p class="hindi-para">आपके द्वारा जमा की गई राशि का उपयोग जरूरतमंद लोगों की सहायता एवं सामाजिक कल्याण के कार्यों में लगाया जाता है।</p>
  <div class="mitra-section">
    <div>Ayoush Mitra Name :- ${c?.employeeName || "—"}</div>
    <div>Ayoush Mitra ID No :- ${c?.employeeId || "—"}</div>
  </div>
  <div class="sig-box"><span class="sig-text">Signature</span></div>
</div>
<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script>
</body></html>`);
    pw.document.close();
  };

  const handleRawBtPrint = () => {
    const c = record.card;
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
    <div class="field-row"><span><span class="label">Date :-</span> ${record.issuedAt}</span></div>
    <div class="field-row"><span><span class="label">Card ID No :-</span> ${c?.id || "—"}</span></div>
    <div class="field-row"><span><span class="label">Camp Area :-</span> ${c?.area || "Mangla Vihar"}</span></div>
    <div class="field-row"><span><span class="label">Mukhiya Name :-</span> ${c?.mukhiyaName || c?.clientName || "—"}</span></div>
    <div class="field-row"><span><span class="label">Full Address :-</span> ${c?.address || "—"}</span></div>
    <div class="field-row"><span><span class="label">District :-</span> ${c?.district || "Kanpur Nagar"}</span></div>
    <div class="field-row">
      <span><span class="label">Pin Code :-</span> ${c?.pincode || "208015"}</span>
      <span><span class="label">Total Member :-</span> ${c?.totalMember || 1}</span>
    </div>
  </div>
  <div class="penalty-box">Penalty Amount :- Rs. ${PENALTY_AMOUNT}.00</div>
  <div class="dup-info">
    Receipt No :- ${record.receiptNo}<br/>
    Payment Method :- ${record.paymentMethod === "online" ? "Online" : "Offline (Cash)"}<br/>
    ${record.paymentRef ? `Ref :- ${record.paymentRef}<br/>` : ""}
    Status :- Paid
  </div>
  <div class="hindi-heading">महत्वपूर्ण जानकारी</div>
  <p class="hindi-para">कार्ड का उपयोग करने से पूर्व, कृपया कार्ड के साथ दिए किए गए लेटर को ध्यानपूर्वक अवश्य पढ़ें।</p>
  <p class="hindi-para">किसी भी प्रकार की समस्या या सहायता हेतु, कृपया कार्ड के साथ दिए गए हेल्पलाइन नंबर 8303902030 पर संपर्क करें।</p>
  <div class="mitra-section">
    <div>Ayoush Mitra Name :- ${c?.employeeName || "—"}</div>
    <div>Ayoush Mitra ID No :- ${c?.employeeId || "—"}</div>
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
      alert("RawBT printing works on Android phones. Use normal Print on desktop.");
      return;
    }
    window.location.href = rawbtIntent;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-sm font-black text-[#22333B]">Penalty Receipt</h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{record.receiptNo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-5 flex justify-center">
          <PenaltyReceiptPreview card={record.card} receiptRecord={record} />
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full">
          <button onClick={onClose} className="w-full sm:w-auto py-2 px-4 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 text-center whitespace-nowrap">Close</button>
          <div className="flex flex-1 gap-2 w-full">
            <button onClick={handlePrint} className="flex-1 py-2 bg-[#22333B] text-white rounded-xl text-xs font-black hover:bg-[#1a2830] flex items-center justify-center gap-1.5 whitespace-nowrap">
              <Printer size={13} /> Print
            </button>
            <button onClick={handleRawBtPrint} className="flex-1 py-2 bg-[#F68E5F] text-white rounded-xl text-xs font-black hover:bg-[#ff7637] flex items-center justify-center gap-1.5 whitespace-nowrap">
              RawBT Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewPenaltyModal;
