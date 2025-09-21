from fastapi import FastAPI, UploadFile, File, Form,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from uuid import uuid4
import os, boto3, json, subprocess, logging
from urllib.parse import urlparse
from dotenv import load_dotenv, dotenv_values
from pathlib import Path
import cv2, numpy as np, tempfile, shutil, os
from skimage.metrics import structural_similarity as ssim
from typing import List, Dict, Any


DOTENV_PATH = Path(__file__).resolve().parent.parent / ".env"  # backend/.env
if not DOTENV_PATH.exists():
    raise RuntimeError(f".env not found at {DOTENV_PATH}. Put your backend env there.")
load_dotenv(dotenv_path=DOTENV_PATH, override=True)

app = FastAPI(title="My FastAPI Backend")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Item(BaseModel):
    name: str
    qty: int

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

AWS_REGION = os.getenv("AWS_REGION")
S3_BUCKET  = os.getenv("S3_BUCKET")
S3_PREFIX  = os.getenv("S3_PREFIX")
logging.warning(f"S3_BUCKET: {S3_BUCKET}")
logging.warning(f"S3_PREFIX: {S3_PREFIX}")
logging.warning(f"REGION: {AWS_REGION}")

s3 = boto3.client("s3", region_name=AWS_REGION)

class PresignReq(BaseModel):
    filename: str
    content_type: str | None = "video/mp4"

class ProcessReq(BaseModel):
  video_path: str  # can be "s3://bucket/key" or local path

def ffprobe_json(path: str) -> dict:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", 
        "-print_format", "json",
        "-show_format", "-show_streams",
        path
    ], text=True)
    logging.warning(json.loads(out))
    return json.loads(out)

def presign_get(bucket: str, key:str, expires=3600) -> str:
    return s3.generate_presigned_url(
        ClientMethod="get_object", 
        Params={"Bucket": bucket, "Key": key}, 
        ExpiresIn=expires
    )

def run_ffmpeg(cmd: list[str]) -> None: 
    subprocess.check_call(cmd)

def upload_file_to_s3(local_path: str, bucket: str, key: str, content_type: str | None = None):
    extra = {"ContentType": content_type} if content_type else {}
    s3.upload_file(local_path, bucket, key, ExtraArgs=extra)

@app.post("/process")
def process(req: ProcessReq):
    path = req.video_path
    if path.startswith("s3://"):
        u = urlparse(path); bucket = u.netloc; key = u.path.lstrip("/")
        s3.download_file(bucket, key, "/tmp/input.mp4")
        local_path = "/tmp/input.mp4"
        source_bucket, source_key = bucket, key
    else:
        local_path = path
        source_bucket, source_key = bucket, key

    # ... run ffmpeg/keyframes/embeddings here on local_path ...
    return {"ok": True}

def resolve_local_video(path: str) -> tuple[str, str|None, str|None]:
    """Return (local_path, bucket, key)."""
    if path.startswith("s3://"):
        u = urlparse(path); bucket = u.netloc; key = u.path.lstrip("/")
        tmp = tempfile.mkdtemp(prefix="sceneit_shots_")
        local = os.path.join(tmp, os.path.basename(key) or "input.mp4")
        s3.download_file(bucket, key, local)
        return local, bucket, key
    return path, None, None

@app.post("/presign")
def presign(req: PresignReq):
    ext = Path(req.filename).suffix or ".mp4"
    key = f"{S3_PREFIX}{uuid4()}{ext}"
    
    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": S3_BUCKET,
            "Key": key,
            "ContentType": req.content_type or "application/octet-stream",
        },
        ExpiresIn=600
    )
    return {
        "upload_url": url,                                        # PUT here from browser
        "s3_uri":     f"s3://{S3_BUCKET}/{key}",                  # stable path for backend
        "http_url":   f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}",
        "key":        key
    }


# --- OpenCV helpers ---
def frame_time(frame_idx: int, fps: float) -> float:
    return frame_idx / max(fps, 1e-6)

def hsv_hist(frame_bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0,1,2], None, [16,8,8], [0,180, 0,256, 0,256])
    cv2.normalize(hist, hist)
    return hist.reshape(-1)

def bhatta(a: np.ndarray, b: np.ndarray) -> float:
    return float(cv2.compareHist(a.astype(np.float32), b.astype(np.float32), cv2.HISTCMP_BHATTACHARYYA))

def pick_keyframe_ssim(frames: List[np.ndarray]) -> int:
    """Return index of the most 'representative' frame via SSIM-to-mean heuristic."""
    if not frames: return 0
    gray_frames = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
    mean_img = np.mean(np.stack(gray_frames, axis=0), axis=0).astype(np.uint8)
    scores = [ssim(g, mean_img, data_range=255) for g in gray_frames]
    return int(np.argmax(scores))

def smooth_signal(x: np.ndarray, k: int = 3) -> np.ndarray:
    if len(x) < k: return x
    kernel = np.ones(k) / k
    return np.convolve(x, kernel, mode="same")


# --- S3 upload util ---
def s3_put_bytes(img_bgr: np.ndarray, bucket: str, key: str, quality: int = 90):
    ok, buf = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("cv2.imencode failed for keyframe upload")
    s3.put_object(Bucket=bucket, Key=key, Body=buf.tobytes(), ContentType="image/jpeg")

# --- API model ---
class ShotReq(BaseModel):
    video_path: str             # s3://... or local path
    save_frames: bool = True    # upload keyframes to S3
    threshold: float = 0.25     # Bhattacharyya distance threshold
    min_shot_len_sec: float = 0.7
    smooth_k: int = 5           # moving average window over distances
    max_frames: int | None = None  # for debugging; limit frames scanned

@app.post("/shots")
def shots(req: ShotReq):
    local_path, src_bucket, src_key = resolve_local_video(req.video_path)
    tmp_dir = os.path.dirname(local_path) if src_bucket else tempfile.mkdtemp(prefix="sceneit_shots_")
    try:
        cap = cv2.VideoCapture(local_path)
        if not cap.isOpened():
            raise HTTPException(400, "OpenCV failed to open the video (unsupported codec/container or missing ffmpeg build).")

        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        max_i = min(total, req.max_frames) if req.max_frames else total

        # 1) Pass 1: compute per-frame histograms & distances
        hists = []
        distances = [0.0]  # distance[0] = 0
        frames_meta = []   # store (frame_idx, time_sec) for shot delineation

        i = 0
        while i < max_i:
            ok, frame = cap.read()
            if not ok:
                break
            hist = hsv_hist(frame)
            hists.append(hist)
            if i > 0:
                distances.append(bhatta(hist, hists[i-1]))
            frames_meta.append((i, frame_time(i, fps)))
            i += 1

        cap.release()
        distances = np.array(distances, dtype=np.float32)
        distances_s = smooth_signal(distances, k=req.smooth_k)

        # 2) Find boundaries by threshold with a minimum shot length
        shots_idx = [0]  # start index of each shot (frame idx)
        last_cut_time = 0.0
        for idx, d in enumerate(distances_s):
            t = frame_time(idx, fps)
            if d >= req.threshold and (t - last_cut_time) >= req.min_shot_len_sec:
                shots_idx.append(idx)
                last_cut_time = t
        if shots_idx[-1] != (i-1):
            shots_idx.append(i-1)  # ensure closing boundary

        # 3) For each shot, select a keyframe (SSIM-to-mean heuristic)
        results = []
        cap = cv2.VideoCapture(local_path)  # reopen for frame access
        # quick random access helper
        def read_frame(idx: int) -> np.ndarray | None:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, f = cap.read()
            return f if ok else None

        for s in range(len(shots_idx)-1):
            s_start_idx = shots_idx[s]
            s_end_idx   = shots_idx[s+1]
            # Guard against empty shots
            if s_end_idx <= s_start_idx:
                continue

            # Sample frames in the shot (stride to save CPU on long shots)
            stride = max(int(fps // 4), 1)  # ~4 samples per second; tune as needed
            sample_indices = list(range(s_start_idx, s_end_idx, stride))
            sample_frames = []
            for idx in sample_indices:
                f = read_frame(idx)
                if f is not None:
                    sample_frames.append(f)
            if not sample_frames:
                continue

            best_local = pick_keyframe_ssim(sample_frames)
            best_idx   = sample_indices[best_local]
            best_time  = frame_time(best_idx, fps)
            start_t    = frame_time(s_start_idx, fps)
            end_t      = frame_time(s_end_idx, fps)

            keyframe_s3 = None
            if req.save_frames and S3_BUCKET:
                # choose a video id-ish base from source key/path
                base = (src_key or os.path.basename(local_path)).rsplit(".", 1)[0].replace("/", "_")
                key = f"{S3_PREFIX}frames/{base}/shot_{s:04d}_t{int(round(best_time*1000)):06d}.jpg"
                kf = read_frame(best_idx)  # read exactly the chosen frame
                if kf is not None:
                    s3_put_bytes(kf, S3_BUCKET, key)
                    keyframe_s3 = key

            results.append({
                "shot_index": s,
                "start_time": round(start_t, 3),
                "end_time": round(end_t, 3),
                "keyframe_time": round(best_time, 3),
                "keyframe_s3_key": keyframe_s3
            })

        cap.release()
        return {
            "ok": True,
            "video_path": req.video_path,
            "fps": fps,
            "frame_count": i,
            "threshold_used": req.threshold,
            "min_shot_len_sec": req.min_shot_len_sec,
            "shots": results
        }
        # distances = np.array(distances, dtype=np.float32)
        # dist_s = smooth_signal(distances, k=req.smooth_k)

        # def q(x, p):  # percentile helper
        #     return float(np.percentile(x, p)) if len(x) else 0.0

        # dbg = {
        #     "fps": fps,
        #     "frame_count": int(i),
        #     "duration_sec": float(i / max(fps,1e-6)),
        #     "threshold": req.threshold,
        #     "smooth_k": req.smooth_k,
        #     "min_shot_len_sec": req.min_shot_len_sec,
        #     "dist_mean": float(distances.mean()) if len(distances) else 0.0,
        #     "dist_std": float(distances.std()) if len(distances) else 0.0,
        #     "dist_min": float(distances.min()) if len(distances) else 0.0,
        #     "dist_max": float(distances.max()) if len(distances) else 0.0,
        #     "dist_p90": q(distances, 90),
        #     "dist_p95": q(distances, 95),
        #     "dist_p99": q(distances, 99),
        #     "sm_mean": float(dist_s.mean()) if len(dist_s) else 0.0,
        #     "sm_p95": q(dist_s, 95),
        #     "sm_p99": q(dist_s, 99),
        # }

        # return {
        #     "yeah" : dbg
        # }
    finally:
        if not src_bucket:  # if the source was local, we created our own tmp dir
            shutil.rmtree(tmp_dir, ignore_errors=True)