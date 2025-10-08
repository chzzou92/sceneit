"use client";
import React, { useState, useEffect } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import { useSearchParams } from "next/navigation";
import SearchInput from "@/components/SearchInput";
import ErrorCard from "@/components/ErrorCard";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Loader from "@/components/Loader";
import S3ImageCarousel from "@/components/S3ImageCarousel";
import PhotoUpload from "@/components/PhotoUpload";
export default function VideoPage() {
  const sp = useSearchParams();
  const url = sp.get("url") ?? "";
  const searchTextUrl = sp.get("s3uri") ?? "";
  const [errorType, setErrorType] = useState("");
  const [startPoint, setStartPoint] = useState(0);
  const [textError, setTextError] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTextImages, setSearchTextImages] = useState<string[]>([]);
  const [searchTextImagesStart, setSearchTextImagesStart] = useState<number[]>(
    []
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  interface Match {
    id: string;
    score: number;
    metadata: {
      t_sec: number;
      thumb_key: string;
    };
  }

  interface Data {
    matches: Match[];
    bucket: string;
  }

  useEffect(() => {
    if (!textError) return;
    const t = setTimeout(() => setTextError(false), 2500);
    return () => clearTimeout(t);
  }, [textError, errorType]);
  const testShots = async () => {
    setLoading(true);
    const resp = await fetch(process.env.NEXT_PUBLIC_API + "/split_shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_s3_uri: searchTextUrl,
        threshold: 22.0,
        min_scene_len: 4,
        split_clips: true,
      }),
    });
    const data = await resp.json();
    if (data.already_processed === true) {
      setTextError(true);
      setErrorType("already-split");
    }
    console.log(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    getSearch();
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const getSearch = async () => {
    if (!searchTextUrl.trim()) {
      setTextError(true);
      setErrorType("no-url");
      return;
    }

    const hasText = !!searchText.trim();
    const hasImage = !!imageFile;
    if (!hasText && !hasImage) {
      setTextError(true);
      setErrorType("no-query");
      return;
    }
    setTextError(false);

    try {
      const form = new FormData();
      form.append("filename", searchTextUrl);
      form.append("top_k", String(10));

      if (hasImage) {
        form.append("image_search", imageFile as Blob, imageFile!.name);
      } else {
        form.append("text_search", searchText);
      }

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API}/search_embeddings`,
        {
          method: "POST",
          body: form, // DO NOT set Content-Type; browser sets multipart boundary
        }
      );
      if (!resp.ok) {
        console.error("Search failed:", await resp.text());
        return;
      }

      // parse + presign
      const data: Data = await resp.json();
      setStartPoint(data.matches[0]?.metadata.t_sec ?? 0);
      console.log(data);
      const bucket = data.bucket;
      const keys = data.matches.slice(0, 7).map((m) => m.metadata.thumb_key);

      const presignResp = await fetch(
        `${process.env.NEXT_PUBLIC_API}/s3/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket, keys, expires_in: 1800 }),
        }
      );
      const { items } = await presignResp.json();

      setSearchTextImages(items.map((it: any) => it.url));
      setSearchTextImagesStart(
        data.matches.slice(0, 7).map((m) => m.metadata.t_sec)
      );
    } catch (e) {
      console.error(e);
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
  };
  return (
    <div className="flex flex-col p-24 min-h-screen items-center justify-center">
      <div className="absolute top-6 left-6">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
          onClick={() => router.push("/")}
        >
          Back
        </button>
      </div>
      <AnimatePresence initial={false}>
        {loading && (
          <motion.div
            key={loading}
            className="absolute center z-10"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <Loader />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-1/2 h-1/2 items-center justify-center">
        <VideoPlayer src={url} startAt={startPoint} autoPlayOnSeek={false} />
        <S3ImageCarousel
          urls={searchTextImages}
          urlStartPoints={searchTextImagesStart}
          visible={3}
          height={130}
          setStartPoint={setStartPoint}
        />
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
          onClick={testShots}
        >
          Split Shots
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row w-full gap-1">
          <SearchInput
            text={searchText}
            setText={setSearchText}
            onEnter={getSearch}
          />
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={getSearch}
          >
            Search
          </button>
          <div className="flex items-center justify-center">
            <PhotoUpload onChange={onPickImage} />
          </div>
        </div>
        {previewUrl && (
          <img
            src={previewUrl}
            alt="query preview"
            className="mt-2 h-24 w-24 object-cover rounded"
          />
        )}
        <div className="relative h-0">
          <AnimatePresence initial={false}>
            {textError && (
              <motion.div
                key={errorType}
                className="absolute top-0 left-0"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <ErrorCard type={errorType} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
