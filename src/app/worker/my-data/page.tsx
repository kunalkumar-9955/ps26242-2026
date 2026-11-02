"use client";

import React, { useState, useEffect } from "react";
import { Download, Trash2, Shield, AlertCircle, CheckCircle, FileCode, RefreshCw } from "lucide-react";

export default function WorkerMyDataPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<any>(null);

  const candidateId = "d0000000-0000-0000-0000-000000000001"; // Mock candidate

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/privacy/my-data?candidateId=${candidateId}`);
      if (!res.ok) {
        throw new Error("Failed to load worker personal data");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `satyarpl-my-data-${candidateId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRequestDeletion = async () => {
    const confirmed = window.confirm(
      "DPDP Right to Erasure Notice:\n\nRequesting deletion will permanently CRYPTO-SHRED your raw media recordings and remove sensitive PII.\n\nPer NSQF RPL regulatory compliance, cryptographic ledger hashes will be preserved to maintain tamper-proof audit trails for certification validity.\n\nDo you wish to proceed?"
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/privacy/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          reason: "Candidate invoked DPDP Act 2023 Right to Erasure via My Data portal",
        }),
      });

      if (!res.ok) {
        throw new Error("Deletion request failed on server");
      }

      const result = await res.json();
      setDeleteSuccess(result.result);
      await fetchData(); // Reload refreshed data
    } catch (err: any) {
      setError(err.message || "Failed to submit deletion request");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center space-x-2 text-xs font-semibold px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full mb-2">
              <Shield className="w-3.5 h-3.5" />
              <span>DPDP Act 2023 • Worker Data Rights</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              मेरा डेटा और गोपनीयता अधिकार (My Data)
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Candidate ID: <span className="font-mono text-emerald-400">{candidateId}</span> (Pseudonymous identifier)
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportJson}
              disabled={!data || loading}
              className="inline-flex items-center min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition"
            >
              <Download className="w-4 h-4 mr-2" />
              डेटा निर्यात करें (Export JSON)
            </button>
            <button
              onClick={handleRequestDeletion}
              disabled={deleting || loading}
              className="inline-flex items-center min-h-[44px] px-4 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-sm font-semibold rounded-xl transition"
            >
              <Trash2 className="w-4 h-4 mr-2 text-rose-400" />
              {deleting ? "श्रेडिंग जारी है..." : "डेटा विलोपन अनुरोध (Request Erasure)"}
            </button>
          </div>
        </header>

        {deleteSuccess && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl flex items-start space-x-3 text-emerald-300">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm text-white">क्रिप्टो-श्रेडिंग सफल (Crypto-Shredding Executed)</p>
              <p>{deleteSuccess.auditMessage}</p>
              <p className="text-slate-400">
                Shredded Media Blobs: {deleteSuccess.shreddedItemsCount} • Preserved Immutable Hashes: {deleteSuccess.preservedHashesCount}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-950/40 border border-rose-500/50 rounded-2xl flex items-center space-x-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
            <p className="text-sm">डेटा लोड हो रहा है... (Fetching secure records)</p>
          </div>
        ) : !data ? (
          <div className="p-8 bg-slate-900 rounded-2xl border border-slate-800 text-center text-slate-400">
            कोई रिकॉर्ड नहीं मिला। (No personal data records found)
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center">
                <FileCode className="w-4 h-4 mr-2 text-emerald-400" />
                मौखिक घोषणाएं (Declarations)
              </h2>
              {data.declarations.length === 0 ? (
                <p className="text-xs text-slate-500">कोई घोषणा नहीं मिली (None found)</p>
              ) : (
                <div className="space-y-2">
                  {data.declarations.map((d: any) => (
                    <div key={d.id} className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-mono text-slate-300 font-semibold">{d.tradeCode}</p>
                        <p className="text-slate-500">{new Date(d.submittedAt).toLocaleDateString()}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-2xs bg-emerald-500/10 text-emerald-400 font-medium">
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center">
                <Shield className="w-4 h-4 mr-2 text-cyan-400" />
                सहमति रिकॉर्ड (Consents Tracked)
              </h2>
              {data.consents.length === 0 ? (
                <p className="text-xs text-slate-500">कोई सहमति रिकॉर्ड नहीं मिला</p>
              ) : (
                <div className="space-y-2">
                  {data.consents.map((c: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                      <div>
                        <p className="text-slate-300 font-medium">{c.scope}</p>
                        <p className="text-slate-500 font-mono text-2xs">v{c.version} • {new Date(c.grantedAt).toLocaleString()}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-2xs bg-emerald-500/10 text-emerald-400">
                        Granted
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-white flex items-center">
                  <Shield className="w-4 h-4 mr-2 text-amber-400" />
                  प्रमाण साक्ष्य एवं हैश चेन (Evidence Ledger & Crypto-Shredding Status)
                </h2>
                <span className="text-xs text-slate-400">Total Items: {data.evidenceItems.length}</span>
              </div>

              {data.evidenceItems.length === 0 ? (
                <p className="text-xs text-slate-500">कोई साक्ष्य आइटम दर्ज नहीं है</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {data.evidenceItems.map((e: any) => (
                    <div
                      key={e.id}
                      className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs flex flex-col sm:flex-row justify-between sm:items-center gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-2xs text-slate-400">Seq #{e.sequenceIndex}</span>
                          <span className="font-mono text-2xs text-slate-300 truncate max-w-xs">
                            SHA: {e.sha256Hash}
                          </span>
                        </div>
                        <p className="text-2xs text-slate-500 font-mono truncate max-w-sm">
                          Prev: {e.prevHash}
                        </p>
                      </div>
                      <div>
                        {e.isCryptoShredded ? (
                          <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xs font-semibold rounded-md">
                            Crypto-Shredded (Blob Removed)
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-2xs font-semibold rounded-md">
                            Encrypted Media Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
