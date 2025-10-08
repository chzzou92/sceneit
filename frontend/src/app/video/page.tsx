"use client";
import React, { useState, useEffect } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import { useSearchParams } from "next/navigation";
import SearchInput from "@/components/SearchInput";
import ErrorCard from "@/components/ErrorCard";
import { AnimatePresence, motion } from "framer-motion";
import Uploader from "../Uploader";
import { useRouter } from "next/navigation";
import Loader from "@/components/Loader";
import { setLazyProp } from "next/dist/server/api-utils";
import S3ImageCarousel from "@/components/S3ImageCarousel";
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
  const router = useRouter();

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

  const getSearchText = async () => {
    if (searchText === "") {
      setTextError(true);
      setErrorType("no-text");
    } else if (searchTextUrl === "") {
      setTextError(true);
      setErrorType("no-url");
    } else {
      setTextError(false);
      const form = new FormData();
      form.append("filename", searchTextUrl);
      form.append("text_search", searchText);
      form.append("top_k", String(10));

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API}/search_embeddings`,
        {
          method: "POST",
          body: form,
        }
      );

      if (!resp.ok) {
        console.error("Search failed:", await resp.text());
        return;
      }
      const data: Data = await resp.json();
      setStartPoint(data.matches[0].metadata.t_sec);

      console.log(data);
      const bucket = data.bucket;
      const keys = data.matches.slice(0, 7).map((m) => m.metadata.thumb_key);

      const presignResp = await fetch(
        `${process.env.NEXT_PUBLIC_API}/s3/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket, keys, expires_in: 1800 }), // 30 min
        }
      );
      const { items } = await presignResp.json();
      console.log(items);
      // Keep both key and url so you can refresh later if needed
      setSearchTextImages(items.map((item: any) => item.url));

      setSearchTextImagesStart(
        data.matches.slice(0, 7).map((match) => match.metadata.t_sec)
      );
    }
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
            onEnter={getSearchText}
          />
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={getSearchText}
          >
            Search
          </button>
        </div>
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
      {/* <div className="py-12">
        <Uploader
          type="photo"
          setUrl={setVideoUrl}
          setS3Uri={setSearchTextUrl}
          setNextPage={setNextPage}
        />
      </div> */}
    </div>
  );
}
