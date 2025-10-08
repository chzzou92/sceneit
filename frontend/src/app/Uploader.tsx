"use client";
import React, { useState } from "react";
import UploadButton from "@/components/uploadButton";
import { createSHA256 } from "hash-wasm";

type UploaderProps = {
  setUrl: React.Dispatch<React.SetStateAction<string>>;
  setS3Uri: React.Dispatch<React.SetStateAction<string>>;
  setNextPage: React.Dispatch<React.SetStateAction<boolean>>;
  setLoad: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function Uploader({
  setUrl,
  setS3Uri,
  setNextPage,
  setLoad,
}: UploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "done" | "error" | "already_in"
  >("idle");

  async function sha256VideoFile(file: File): Promise<string> {
    const hasher = await createSHA256();
    const chunkSize = 4 * 1024 * 1024;
    let offset = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      hasher.update(new Uint8Array(buffer));
      offset += chunkSize;
    }
    return hasher.digest("hex");
  }

  const onFileSelect = async (f: File) => {
    const sha256 = await sha256VideoFile(f);
    console.log("Hash:", sha256);

    setFile(f);
    void uploadFile(f, sha256);
  };

  const uploadFile = async (f: File, hash: String) => {
    setLoad(true);
    setStatus("uploading");
    try {
      const presign = await fetch(process.env.NEXT_PUBLIC_API + "/presign", {
        method: "POST",
        headers: { "Content-type": "Application/json" },
        body: JSON.stringify({
          filename: f.name,
          key: hash,
          content_type: f.type || "video/mp4",
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          console.log(data);
          return data;
        })
        .catch((e) => {
          console.error("Upload error:", e);
        });
      setS3Uri(presign.s3_uri);
      if (presign?.exists === true) {
        setUrl(presign.get_url);
        setStatus("already_in");
      } else {
        // upload directly to S3
        await fetch(presign.upload_url, {
          method: "PUT",
          headers: { "Content-Type": f.type || "application/octet-stream" },
          body: f,
        });
        setUrl(presign.get_url);
        console.log(presign);
      }
      setStatus("done");
      setLoad(false);
      setNextPage(true);
    } catch (e) {
      console.error("Upload error:", e);
      setStatus("error");
    }
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
