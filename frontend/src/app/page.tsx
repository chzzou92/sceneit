"use client";
import Uploader from "./Uploader";
import react, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [nextPage, setNextPage] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [searchTextUrl, setSearchTextUrl] = useState("");
  const router = useRouter();
 

  useEffect(() => {
    if (nextPage) {
      router.push(`/video?url=${encodeURIComponent(videoUrl)}&s3uri=${encodeURIComponent(searchTextUrl)}`);
    }
  }, [nextPage, router]);


  return (
    <div className="font-sans flex flex-col items-center justify-items-center min-h-screen p-24">
      <main className="flex flex-col gap-20 row-start-2 items-center sm:items-start ">
        <h1 className="text-2xl font-bold">SceneIt</h1>
        <div className="flex flex-col gap-4 items-centersm:flex-row">
          <Uploader
            type="video"
            setUrl={setVideoUrl}
            setS3Uri={setSearchTextUrl}
            setNextPage={setNextPage}
          />
        </div>
      </main>
    </div>
  );
}
