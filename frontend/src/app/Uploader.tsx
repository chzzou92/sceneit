// Uploader.tsx
"use client";
import React, { useState } from "react";
import UploadButton from "@/components/uploadButton";

export default function Uploader() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );

  const onFileSelect = (f: File) => {
    setFile(f);
    void uploadFile(f);
  };

  const uploadFile = async (f: File) => {
    const presign = await fetch(process.env.NEXT_PUBLIC_API + "/presign", {
      method: "POST",
      headers: { "Content-type": "Application/json" },
      body: JSON.stringify({
        filename: f.name,
        content_type: f.type || "video/mp4",
      }),
    }).then((r) => r.json()).then((data) =>{
        console.log(data);
        return data;
    }).catch((e) =>{
        console.error("Upload error:", e);
    });

    // upload directly to S3
    await fetch(presign.upload_url, {
      method: "PUT",
      headers: { "Content-Type": f.type || "application/octet-stream" },
      body: f,
    });

    // now get the s3_uri path
    await fetch(process.env.NEXT_PUBLIC_API + "/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_path: presign.s3_uri }),
    });
  };

  return (
    <div style={{ maxWidth: 360 }}>
      <UploadButton
        onFileSelect={onFileSelect}
        label={status === "uploading" ? "Uploading…" : "Choose a video"}
        disabled={status === "uploading"}
      />
      {file && (
        <p style={{ marginTop: 8 }}>
          {file.name} ({Math.round(file.size / 1e6)} MB)
        </p>
      )}
      {status === "error" && (
        <p style={{ color: "salmon" }}>Something went wrong.</p>
      )}
    </div>
  );
}
