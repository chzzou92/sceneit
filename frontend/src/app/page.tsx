"use client";
import Image from "next/image";
import Uploader from "./Uploader";

export default function Home() {
  const testShots = async () => {
    const resp = await fetch(process.env.NEXT_PUBLIC_API + "/split_shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
         source_s3_uri: "s3://sceneit-chriszou-001/uploads918c75ff-d0c2-4401-abd5-4e0fc586e357.mov",
        threshold: 22.0,
        min_scene_len: 12,
        split_clips: true,
        output_prefix_s3: "s3://sceneit-chriszou-001/outputs/video1/",
      }),
    });
    const data = await resp.json();
    console.log(data);
  };

  return (
    <div className="font-sans flex flex-col items-center justify-items-center min-h-screen p-24">
      <main className="flex flex-col gap-20 row-start-2 items-center sm:items-start ">
        <h1 className="text-2xl font-bold">SceneIt</h1>
        <div className="flex flex-col gap-4 items-centersm:flex-row">
          <Uploader />
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={testShots}
          >
            Button
          </button>
        </div>
      </main>
    </div>
  );
}
