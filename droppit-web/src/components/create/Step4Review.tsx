import React from 'react';
import { type Chain } from "viem";
import { MINIAPP_SHARE_CARD } from "@/lib/share-card-layout";
import { DropFormData } from "./types";

interface Step4ReviewProps {
    isAiDraftFlow: boolean;
    selectedChain: Chain;
    formData: DropFormData;
    address?: string;
    hasSelectedChainContractConfig: boolean;
    deployGasEstimate: string | null;
    previewImageUrl: string | null;
    previewGlyph: string;
    previewFrameInset: string;
    previewArtPaddingTop: string;
    previewArtPaddingX: string;
    previewArtPaddingBottom: string;
    previewArtworkFrameStyle?: React.CSSProperties | null;
}

export function Step4Review({
    isAiDraftFlow,
    selectedChain,
    formData,
    address,
    hasSelectedChainContractConfig,
    deployGasEstimate,
    previewImageUrl,
    previewGlyph,
    previewFrameInset,
    previewArtPaddingTop,
    previewArtPaddingX,
    previewArtPaddingBottom,
    previewArtworkFrameStyle
}: Step4ReviewProps) {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0052FF]/20 to-[#22D3EE]/15 border border-[#22D3EE]/20">
                    <svg viewBox="0 0 24 24" className="h-9 w-9 text-[#22D3EE]" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h2 className="font-display text-2xl font-bold mb-2">{isAiDraftFlow ? "Review Before Deploy" : "Ready to Deploy"}</h2>
                <p className="text-slate-400">
                    {isAiDraftFlow
                        ? `Review the AI draft details below. You can still go back and edit steps 1-3 before signing the ${selectedChain.name} transaction.`
                        : `Review your drop details before signing the ${selectedChain.name} transaction.`}
                </p>
            </div>

            {!hasSelectedChainContractConfig && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl text-yellow-200 text-sm">
                    Deployment is disabled: missing factory/implementation configuration for {selectedChain.name}.
                </div>
            )}

            <div className="space-y-0 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 font-mono text-sm sm:p-6">
                <div className="flex flex-col gap-1.5 border-b border-white/[0.06] py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <span className="text-slate-500">Title</span>
                    <span className="w-full break-words text-left font-medium text-white sm:w-auto sm:max-w-xs sm:text-right">{formData.title || "Untitled"}</span>
                </div>
                <div className="flex flex-col gap-1.5 border-b border-white/[0.06] py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <span className="text-slate-500">Supply</span>
                    <span className="w-full break-words text-left text-white sm:w-auto sm:text-right">{formData.editionSize}</span>
                </div>
                <div className="flex flex-col gap-1.5 border-b border-white/[0.06] py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <span className="text-slate-500">Price</span>
                    <span className={`w-full break-words text-left sm:w-auto sm:text-right ${Number(formData.mintPrice) === 0 ? "font-bold text-[#22D3EE]" : "text-white"}`}>{Number(formData.mintPrice) === 0 ? "Free mint" : `${formData.mintPrice} ETH`}</span>
                </div>
                <div className="flex flex-col gap-1.5 border-b border-white/[0.06] py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <span className="text-slate-500">Recipient</span>
                    <span className="w-full break-all text-left text-white sm:w-auto sm:max-w-xs sm:text-right">{formData.payoutRecipient.trim() ? formData.payoutRecipient.trim() : address}</span>
                </div>
                <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <span className="text-slate-500">Est. Deploy Gas</span>
                    <span className="w-full break-words text-left font-medium text-[#22D3EE] sm:w-auto sm:text-right">{deployGasEstimate ? (deployGasEstimate === "Unknown" ? "Unknown" : `~${parseFloat(deployGasEstimate).toFixed(4)} ETH`) : "Estimating..."}</span>
                </div>
            </div>

            {/* Share-Card Preview */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#05070f]">
                <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-4 sm:px-6">
                    <h3 className="text-sm font-semibold text-white">Share Card Preview</h3>
                    <p className="text-xs text-slate-500">This previews the real 3:2 miniapp share image used in Warpcast.</p>
                </div>
                <div className="bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.15),transparent_40%),radial-gradient(circle_at_top_left,rgba(124,58,237,0.15),transparent_40%)] p-4 sm:p-6">
                    <div className="mx-auto w-full" style={{ maxWidth: MINIAPP_SHARE_CARD.previewMaxWidth }}>
                        <div className="rounded-[28px] border border-white/[0.08] bg-[#040916]/92 shadow-[0_20px_52px_rgba(0,0,0,0.30)]" style={{ padding: previewFrameInset }}>
                            <div
                                className="relative overflow-hidden rounded-[26px] border border-white/[0.04] bg-[#020617] shadow-[0_18px_44px_rgba(0,0,0,0.30)]"
                                style={{ aspectRatio: "3 / 2" }}
                            >
                                {previewImageUrl && (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                        src={previewImageUrl}
                                        alt=""
                                        className="absolute inset-0 h-full w-full object-cover opacity-30"
                                        style={{ filter: "blur(28px)", transform: "scale(1.18)" }}
                                    />
                                )}
                                <div
                                    className="absolute inset-0"
                                    style={{
                                        backgroundColor: "rgba(2,6,23,0.46)",
                                        backgroundImage: "radial-gradient(circle at 50% 15%, rgba(124,58,237,0.18), transparent 36%), radial-gradient(circle at 50% 85%, rgba(0,82,255,0.16), transparent 40%)",
                                    }}
                                />
                                <div
                                    className="relative flex h-full w-full items-center justify-center"
                                    style={{ padding: `${previewArtPaddingTop} ${previewArtPaddingX} ${previewArtPaddingBottom}` }}
                                >
                                    <div className="relative flex items-center justify-center rounded-[24px]" style={{ width: previewArtworkFrameStyle?.width || "100%", height: previewArtworkFrameStyle?.height || "100%" }}>
                                        {previewImageUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={previewImageUrl} alt="" className="relative z-10 h-full w-full object-contain object-center" />
                                        ) : (
                                            <div className="text-6xl font-bold text-white/50 sm:text-7xl">{previewGlyph}</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-col gap-3 rounded-[20px] border border-white/10 bg-[#07101f]/92 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Warpcast Post</div>
                                    <div className="mt-1 text-sm text-slate-300">The launch button renders outside the share image. The caption stays compact while the miniapp page holds the full details.</div>
                                </div>
                                <div className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0052FF] to-[#22D3EE] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(0,82,255,0.28)]">
                                    Mint
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
