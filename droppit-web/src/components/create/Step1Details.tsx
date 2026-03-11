import React, { Dispatch, SetStateAction } from 'react';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL, ALLOWED_MIME_ACCEPT, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, MAX_IMAGE_PIXELS } from "@/lib/constants/upload";
import { validateImageMedia, extractImageDimensions, type ImageDimensions } from "@/lib/media-validation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DropFormData } from "./types";

interface Step1DetailsProps {
    isAiDraftFlow: boolean;
    hasReusableMedia: boolean;
    showMissingArtworkBanner: boolean;
    formData: DropFormData;
    setFormData: Dispatch<SetStateAction<DropFormData>>;
    file: File | null;
    setFile: Dispatch<SetStateAction<File | null>>;
    setFileImageDimensions: Dispatch<SetStateAction<ImageDimensions | null>>;
    setFormError: Dispatch<SetStateAction<string | null>>;
    filePreviewUrl: string | null;
    normalizedDraftImageUrl: string | null;
}

export function Step1Details({
    isAiDraftFlow,
    hasReusableMedia,
    showMissingArtworkBanner,
    formData,
    setFormData,
    file,
    setFile,
    setFileImageDimensions,
    setFormError,
    filePreviewUrl,
    normalizedDraftImageUrl,
}: Step1DetailsProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-2">
                <h3 className="font-display text-lg font-bold text-white">{isAiDraftFlow ? "AI Draft Details" : "Drop Details"}</h3>
                <p className="text-sm text-slate-500">
                    {isAiDraftFlow
                        ? (hasReusableMedia
                            ? "Review the saved AI artwork below. Upload a replacement only if you want to override it."
                            : "This AI draft needs a high-resolution artwork upload before deployment.")
                        : "Give your drop a name, tell its story, and upload the artwork."}
                </p>
            </div>
            
            {showMissingArtworkBanner && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                    This AI draft does not have reusable artwork yet. Upload a high-resolution image to continue to deployment.
                </div>
            )}
            
            {isAiDraftFlow && hasReusableMedia && !file && (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
                    Saved AI artwork is ready. Upload a replacement only if you want to override the current image.
                </div>
            )}
            
            <Input
                label="Drop Title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. The Farcaster Genesis"
            />
            
            <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Tell the story behind this drop..."
                className="h-32"
            />
            
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Artwork Image</label>
                <p className="text-xs text-slate-500 mb-3">
                    {isAiDraftFlow && !hasReusableMedia
                        ? `Upload a high-resolution PNG, JPG, or WebP. Max ${MAX_UPLOAD_SIZE_LABEL}`
                        : `PNG, JPG, or WebP. Max ${MAX_UPLOAD_SIZE_LABEL}`}
                </p>
                <div className="group relative rounded-2xl border-2 border-dashed border-white/[0.08] p-8 text-center transition-all hover:border-[#0052FF]/30 hover:bg-[#0052FF]/[0.02] cursor-pointer">
                    <input
                        type="file"
                        accept={ALLOWED_MIME_ACCEPT}
                        className="hidden"
                        id="file-upload"
                        onChange={async (e) => {
                            const selectedFile = e.target.files?.[0] || null;
                            setFormError(null);

                            if (!selectedFile) {
                                setFile(null);
                                setFileImageDimensions(null);
                                return;
                            }

                            if (selectedFile.size > MAX_UPLOAD_SIZE_BYTES) {
                                setFormError(`Artwork media exceeds the ${MAX_UPLOAD_SIZE_LABEL} size limit.`);
                                setFile(null);
                                setFileImageDimensions(null);
                                return;
                            }

                            try {
                                const buffer = await selectedFile.arrayBuffer();
                                const bytes = new Uint8Array(buffer);

                                const mediaValidation = validateImageMedia(bytes, selectedFile.type);
                                if (!mediaValidation.ok) {
                                    setFormError(mediaValidation.error);
                                    setFile(null);
                                    setFileImageDimensions(null);
                                    return;
                                }

                                const dimensions = extractImageDimensions(mediaValidation.normalizedMime, bytes);
                                if (!dimensions) {
                                    setFormError("Could not read image dimensions from uploaded file.");
                                    setFile(null);
                                    setFileImageDimensions(null);
                                    return;
                                }

                                if (dimensions.width > MAX_IMAGE_WIDTH || dimensions.height > MAX_IMAGE_HEIGHT) {
                                    setFormError(`Image dimensions exceed limit (${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} max).`);
                                    setFile(null);
                                    setFileImageDimensions(null);
                                    return;
                                }

                                const totalPixels = dimensions.width * dimensions.height;
                                if (totalPixels > MAX_IMAGE_PIXELS) {
                                    setFormError("Image is too large to process safely.");
                                    setFile(null);
                                    setFileImageDimensions(null);
                                    return;
                                }

                                setFile(selectedFile);
                                setFileImageDimensions(dimensions);
                            } catch (err) {
                                console.error("Client-side validation failed:", err);
                                setFormError("Failed to validate artwork file.");
                                setFile(null);
                                setFileImageDimensions(null);
                            }
                        }}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full">
                        {(filePreviewUrl || normalizedDraftImageUrl) ? (
                            <div className="relative flex justify-center w-full mb-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={filePreviewUrl || normalizedDraftImageUrl || undefined}
                                    alt={file ? "Preview" : "Draft artwork preview"}
                                    className="max-h-[250px] max-w-full object-contain rounded-xl border border-white/[0.08] shadow-[0_0_30px_rgba(0,82,255,0.15)]"
                                />
                            </div>
                        ) : (
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0052FF]/20 bg-[#0052FF]/8 text-[#22D3EE] transition-transform group-hover:scale-110">
                                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 16V7" /><path d="M8.5 10.5L12 7l3.5 3.5" /><rect x="4" y="16" width="16" height="4" rx="1.5" /></svg>
                            </div>
                        )}
                        <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
                            {file
                                ? file.name
                                : hasReusableMedia
                                    ? "Saved draft artwork preview. Click to upload a replacement."
                                    : isAiDraftFlow
                                        ? "Click to upload high-resolution artwork"
                                        : "Click to upload artwork"}
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
}
