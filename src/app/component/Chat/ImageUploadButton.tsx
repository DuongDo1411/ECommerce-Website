"use client";

import React, { useRef, useState } from "react";
import { FaImage } from "react-icons/fa";

export default function ImageUploadButton({
  disabled,
  onUploaded,
}: {
  disabled?: boolean;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.url) {
        onUploaded(data.url);
      }
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.06] text-gray-200 transition hover:border-emerald-400/30 hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        title="Gửi ảnh"
      >
        <FaImage size={17} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
