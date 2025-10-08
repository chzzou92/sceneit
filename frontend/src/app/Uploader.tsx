"use client";
import React, { useState } from "react";
import UploadButton from "@/components/uploadButton";
import { createSHA256 } from "hash-wasm";
import { create } from "domain";

type UploaderProps = {
  type: "video" | "photo";
  setUrl: React.Dispatch<React.SetStateAction<string>>;
  setS3Uri: React.Dispatch<React.SetStateAction<string>>;
  setNextPage: React.Dispatch<React.SetStateAction<boolean>>;
  setLoad: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function Uploader({
  type,
  setUrl,
  setS3Uri,
  setNextPage,
  setLoad
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
      if (type === "video") {
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

          // now get the s3_uri path
          // await fetch(process.env.NEXT_PUBLIC_API + "/process", {
          //   method: "POST",
          //   headers: { "Content-Type": "application/json" },
          //   body: JSON.stringify({ video_path: presign.s3_uri }),
          // });
        }
        setStatus("done");
        setLoad(false);
        setNextPage(true);
      } else if (type === "photo") {
        const form = new FormData();
        form.append(
          "filename",
          "s3://sceneit-chriszou-001/uploads918c75ff-d0c2-4401-abd5-4e0fc586e357.mov"
        );
        form.append("top_k", String(12));
        form.append("image_search", f); // field name must match FastAPI param

        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_API}/search_embeddings`,
          {
            method: "POST",
            body: form, // DO NOT set Content-Type
          }
        );

        if (!resp.ok) {
          console.error("Image search failed:", await resp.text());
          return;
        }
        const data = await resp.json();
        console.log("Search results:", data);

        setStatus("done");
      }
    } catch (e) {
      console.error("Upload error:", e);
      setStatus("error");
    }
  };

  return (
    <div style={{ maxWidth: 360 }}>
      <UploadButton
        onFileSelect={onFileSelect}
        accept={type === "video" ? "video/*" : "image/*"}
        label={
          status === "uploading"
            ? "Uploading…"
            : type === "video"
            ? "Choose a video"
            : "Choose a photo"
        }
        disabled={status === "uploading"}
        uploadType={type}
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
