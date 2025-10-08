"use client";
import Uploader from "./Uploader";
import react, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Loader from "@/components/Loader";
import { AnimatePresence, motion } from "framer-motion";
export default function Home() {
  const [nextPage, setNextPage] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [searchTextUrl, setSearchTextUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (nextPage) {
      router.push(
        `/video?url=${encodeURIComponent(videoUrl)}&s3uri=${encodeURIComponent(
          searchTextUrl
        )}`
      );
    }
  }, [nextPage, router]);

  return (
    <div className="font-sans flex flex-col items-center justify-center min-h-screen">
      <main className="flex flex-col gap-20 row-start-2 items-center sm:items-start ">
        <h1 className="text-2xl font-bold">SceneIt</h1>
        <div className="flex flex-col gap-4 items-centersm:flex-row">
          <Uploader
            type="video"
            setUrl={setVideoUrl}
            setS3Uri={setSearchTextUrl}
            setNextPage={setNextPage}
            setLoad={setLoading}
          />
        </div>
      </main>
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
    </div>
  );
}
