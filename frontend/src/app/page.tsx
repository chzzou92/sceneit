"use client";
import Image from "next/image";
import Uploader from "./Uploader";
import SearchInput from "@/components/SearchInput";
import react, { useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import ErrorCard from "@/components/ErrorCard";
import { AnimatePresence, motion } from "framer-motion";
import { video } from "framer-motion/client";

export default function Home() {
  const [errorType, setErrorType] = useState("");
  const [searchText, setSearchText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [textError, setTextError] = useState(false);
  const [searchTextUrl, setSearchTextUrl] = useState("");
  const [startPoint, setStartPoint] = useState(0);
  const testShots = async () => {
    const resp = await fetch(process.env.NEXT_PUBLIC_API + "/split_shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_s3_uri: videoUrl,
        threshold: 22.0,
        min_scene_len: 12,
        split_clips: true,
      }),
    });
    const data = await resp.json();
    console.log(data);
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
      console.log(searchTextUrl);
      form.append("filename", searchTextUrl);
      form.append("text_search", searchText);
      form.append("top_k", String(11));

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
      const data = await resp.json();
      console.log(data);
      setStartPoint(data.matches[0].metadata.t_sec)
    }
  };

  return (
    <div className="font-sans flex flex-col items-center justify-items-center min-h-screen p-24">
      <main className="flex flex-col gap-20 row-start-2 items-center sm:items-start ">
        <h1 className="text-2xl font-bold">SceneIt</h1>
        <div className="flex flex-col gap-4 items-centersm:flex-row">
          <Uploader
            type="video"
            setUrl={setVideoUrl}
            setS3Uri={setSearchTextUrl}
          />
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={testShots}
          >
            Split Shots
          </button>
          {videoUrl != "" ? <VideoPlayer src={videoUrl} startAt={startPoint} autoPlayOnSeek={false}/> : ""}
          <div className="flex flex-col gap-2">
            <div className="flex flex-row w-full gap-1">
              <SearchInput text={searchText} setText={setSearchText} />
              <button
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
                onClick={getSearchText}
              >
                Search
              </button>
            </div>
            <AnimatePresence>
              {textError && (
                <motion.div
                  key={textError}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ position: "relative" }}
                >
                  <ErrorCard type={errorType} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="py-12">
            <Uploader
              type="photo"
              setUrl={setVideoUrl}
              setS3Uri={setSearchTextUrl}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
