"use client";
import Image from "next/image";
import Uploader from "./Uploader";
import SearchInput from "@/components/SearchInput";
import react, { useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";

export default function Home() {
  const [searchText, setSearchText] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const testShots = async () => {
    const resp = await fetch(process.env.NEXT_PUBLIC_API + "/split_shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_s3_uri:
          "s3://sceneit-chriszou-001/videos/Glizzy_Advertisement.mov-1eca589e2470b39f4f85ac376dc53f4faea0ce760e19acaa1ed455718a666c3c/Glizzy_Advertisement.mov",
        threshold: 22.0,
        min_scene_len: 12,
        split_clips: true,
      }),
    });
    const data = await resp.json();
    console.log(data);
  };

  const getSearchText = async () => {
    const form = new FormData();
    form.append(
      "filename",
      "s3://sceneit-chriszou-001/videos/Walk_on_Water_Trailer_1.mov-b521e513424a08b7fda291ce2c9acf299df49447bb9e392a274b53fd54057132/Walk_on_Water_Trailer_1.mov"
    );
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
  };

  return (
    <div className="font-sans flex flex-col items-center justify-items-center min-h-screen p-24">
      <main className="flex flex-col gap-20 row-start-2 items-center sm:items-start ">
        <h1 className="text-2xl font-bold">SceneIt</h1>
        <div className="flex flex-col gap-4 items-centersm:flex-row">
          <Uploader type="video" setUrl={setVideoUrl}/>
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={testShots}
          >
            Split Shots
          </button>
          {videoUrl ? <VideoPlayer src={videoUrl} /> : ""}
          <div className="flex flex-row w-full gap-1">
            <SearchInput text={searchText} setText={setSearchText} />
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
              onClick={getSearchText}
            >
              Search
            </button>
          </div>
          <div className="py-12">
            <Uploader type="photo" setUrl={setVideoUrl}/>
          </div>
        </div>
      </main>
    </div>
  );
}
