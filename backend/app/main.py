from fastapi import FastAPI, UploadFile, File, Form,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
from uuid import uuid4
import os, boto3, subprocess, logging, sys
from urllib.parse import urlparse, quote
from dotenv import load_dotenv, dotenv_values
from pathlib import Path
import cv2, numpy as np, tempfile, shutil, os
from skimage.metrics import structural_similarity as ssim
from typing import List, Dict, Any, Optional, Tuple
from pinecone import Pinecone
from pinecone import ServerlessSpec
from PIL import Image
from transformers import CLIPProcessor, CLIPModel 
import torch
import hashlib
from io import BytesIO
from botocore.exceptions import ClientError
import re
import json
import time
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector  # or AdaptiveDetector
from scenedetect.video_splitter import split_video_ffmpeg

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
    force=True, 
)

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
PC_KEY = os.getenv("PINECONE_ACCESS_KEY")
logging.info(f"S3_BUCKET: {S3_BUCKET}")
logging.info(f"S3_PREFIX: {S3_PREFIX}")
logging.info(f"REGION: {AWS_REGION}")
logging.info(f"PC: {PC_KEY}")

s3 = boto3.client("s3", region_name=AWS_REGION)

class PresignReq(BaseModel):
    filename: str
    content_type: str | None = "video/mp4"
    key: str 

class ProcessReq(BaseModel):
  video_path: str  # can be "s3://bucket/key" or local path


def resolve_local_video(path: str) -> tuple[str, str|None, str|None]:
    """Return (local_path, bucket, key)."""
    if path.startswith("s3://"):
        u = urlparse(path); bucket = u.netloc; key = u.path.lstrip("/")
        tmp = tempfile.mkdtemp(prefix="sceneit_shots_")
        local = os.path.join(tmp, os.path.basename(key) or "input.mp4")
        s3.download_file(bucket, key, local)
        return local, bucket, key
    return path, None, None

def safe_name(name:str) -> str: 
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "file.bin"

class PresignRequest(BaseModel):
    bucket: str
    keys: list[str]
    expires_in: int | None = 1800  # 30 minutes default

@app.post("/s3/presign")
def presign_keys(req: PresignRequest):
    out = []
    now = int(time.time())
    for k in req.keys:
        url = s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": req.bucket, "Key": k},
            ExpiresIn=req.expires_in or 1800,
        )
        out.append({"key": k, "url": url, "expiresAt": now + (req.expires_in or 1800)})
    return {"items": out}

@app.post("/presign")
def presign(req: PresignReq):
    # videos/<hashKey>/<original-filename>
    fname = safe_name(req.filename)
    key_path = f"videos/{fname}-{req.key}/{fname}"

    try: 
        s3.head_object(Bucket=S3_BUCKET, Key=key_path)
        exists = True
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            exists = False 
        else:
            raise
# Always create a GET presigned URL (for playback)
    get_url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": S3_BUCKET, "Key": key_path},
        ExpiresIn=3600
    )

    # If it doesn’t exist, also create a PUT presigned URL (for upload)
    upload_url = None
    if not exists:
        upload_url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": S3_BUCKET, 
                    "Key": key_path,
                    "ContentType": req.content_type or "application/octet-stream",
            },
            ExpiresIn=3600
        )

    return {
        "exists": exists,
        "s3_uri": f"s3://{S3_BUCKET}/{key_path}",
        "http_url": f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key_path}",
        "get_url": get_url,
        "upload_url": upload_url,  # may be None if already exists
        "key": key_path
    }

    
# ---------- Config / Helpers ----------

def parse_s3_uri(s3_uri: str):
    # s3://bucket/key...
    if not s3_uri.startswith("s3://"):
        raise ValueError("S3 URI must start with s3://")
    no_scheme = s3_uri[len("s3://"):]
    bucket, _, key = no_scheme.partition("/")
    if not bucket or not key:
        raise ValueError("Invalid S3 URI; expected s3://bucket/key")
    return bucket, key

def s3_key_exists(bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "404":
            return False
        raise
def any_under_prefix(bucket: str, prefix: str) -> bool:
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
    return resp.get("KeyCount", 0) > 0

def s3_download(s3_uri: str, local_path: str):
    bucket, key = parse_s3_uri(s3_uri)
    s3 = boto3.client("s3")
    s3.download_file(bucket, key, local_path)

def s3_upload(local_path: str, dest_s3_uri: str):
    bucket, key = parse_s3_uri(dest_s3_uri)
    s3 = boto3.client("s3")
    s3.upload_file(local_path, bucket, key)

def ensure_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except Exception:
        raise RuntimeError("ffmpeg not found on PATH; required for splitting clips.")

def video_id_from_s3_uri(s3_uri: str) -> str:
    # s3://bucket/key
    key = s3_uri.split("/", 3)[-1]
    return hashlib.sha1(key.encode()).hexdigest()[:16]

def s3_uri_to_http(s3_uri: str, region: str = AWS_REGION) -> str:
    u = urlparse(s3_uri)
    if u.scheme != "s3":
        raise ValueError(f"Invalid S3 URI: {s3_uri}")
    bucket = u.netloc
    key = u.path.lstrip("/")
    # URL-encode path segments but keep slashes
    key_enc = quote(key, safe="/")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key_enc}"

# ---------- Request/Response Models ----------

class SplitShotsRequest(BaseModel):
    # Input video
    source_s3_uri: str = Field(..., description="e.g., s3://my-bucket/path/to/video.mp4")
    # Shot detection params
    threshold: float = Field(27.0, description="PySceneDetect ContentDetector threshold (higher = fewer cuts)")
    min_scene_len: int = Field(4, description="Minimum scene length in frames (e.g., at 24fps)")
    # Whether to actually cut clips (requires ffmpeg)
    split_clips: bool = Field(True, description="If true, export per-shot clips via ffmpeg.")

class ShotBoundary(BaseModel):
    start_time: float  # seconds
    end_time: float    # seconds
    start_frame: int
    end_frame: int

class SplitShotsResponse(BaseModel):
    shots: List[ShotBoundary]
    thumbnail_s3_uris_by_scene: Optional[List[List[str]]] = None
    thumb_embeddings: Optional[List[List[List[float]]]] = None
    already_processed: bool
    output_prefix: Optional[str] = ""
    manifest_s3_uri: Optional[str] = ""
    pc_namespace: Optional[str]= ""

# ---------- Core Shot Detection ----------

def detect_scenes(video_path: str, threshold: float, min_scene_len: int):
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=30.0, min_scene_len=min_scene_len))
    scene_manager.detect_scenes(video)

    scene_list = scene_manager.get_scene_list()  

    shots = []
    for start_tc, end_tc in scene_list:
        shots.append((
            start_tc.get_seconds(),
            end_tc.get_seconds(),
            start_tc.get_frames(),
            end_tc.get_frames()
        ))
    return scene_list, shots


def pick_timepoints(start_s: float, end_s: float, count: int = 3) -> List[float]:
    """Pick `count` times inside [start_s, end_s] (biased away from hard cuts)."""
    dur = max(0.0, end_s - start_s)
    if dur <= 0.0:
        return [start_s]

    # If the scene is very short, just return the midpoint (or up to count=2)
    if dur < 0.6:  
        mids = [start_s + dur * 0.5]
        if dur > 0.25 and count >= 2:
            mids = [start_s + dur * 0.33, start_s + dur * 0.66]
        return mids[:count]

    # For longer scenes, spread across interior (20%, 50%, 80%)
    anchors = [0.2, 0.5, 0.8]
    # Respect requested count
    anchors = anchors[:count] if count <= 3 else [(i+1)/(count+1) for i in range(count)]

    # Avoid landing exactly on cuts: pull slightly inward by epsilon on each side.
    eps = min(0.1, dur * 0.02)  # 100ms or 2% of scene, whichever smaller
    return [max(start_s + eps, min(end_s - eps, start_s + a*dur)) for a in anchors]

def extract_frame_ffmpeg(video_path: str, t_sec: float, out_path: str):
    """Extract a single frame as JPEG at time t_sec using accurate seeking."""
    # Accurate seek: place -ss AFTER -i; a bit slower but reliable for MOV/VFR.
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", video_path,
        "-ss", f"{t_sec:.3f}",
        "-frames:v", "1",
        "-q:v", "2",           # 2 = high quality JPEG
        "-y", out_path
    ]
    subprocess.run(cmd, check=True)

def make_scene_thumbnails(
    video_path: str,
    shots: List[Tuple[float, float, int, int]],  # (start_s, end_s, start_f, end_f)
    out_dir: str,
    per_scene: int = 3,
    basename: str = "shot"
) -> List[List[str]]:
    """
    For each scene, produce up to `per_scene` JPEGs.
    Returns a parallel list: [[paths for scene 0], [paths for scene 1], ...]
    """
    os.makedirs(out_dir, exist_ok=True)
    all_paths: List[List[str]] = []
    for idx, (s_start, s_end, _, _) in enumerate(shots):
        times = pick_timepoints(s_start, s_end, per_scene)
        scene_paths = []
        for j, t in enumerate(times, start=1):
            out_name = f"{basename}-{idx:03d}_{j:02d}.jpg"
            out_path = os.path.join(out_dir, out_name)
            extract_frame_ffmpeg(video_path, t, out_path)
            scene_paths.append(out_path)
        all_paths.append(scene_paths)
    return all_paths

model_name = "openai/clip-vit-large-patch14"  
processor = CLIPProcessor.from_pretrained(model_name)
model = CLIPModel.from_pretrained(model_name)
pc = Pinecone(api_key=PC_KEY)
index_name = "sceneit-thumbs"
# create once; if it already exists, skip
if index_name not in [i.name for i in pc.list_indexes()]:
    pc.create_index(
        name=index_name,
        dimension=768,                 # CLIP L/14
        metric="cosine",               # use cosine similarity
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
def create_embeddings(source_list: List[str]) -> List[List[float]]:
    image_objects = []
    for source in source_list: 
        image_objects.append(Image.open(source))
    inputs = processor(images=image_objects, return_tensors="pt" )
    with torch.no_grad():
        image_embeddings = model.get_image_features(**inputs)
    emb_list = image_embeddings.detach().cpu().numpy().tolist()
    
    return emb_list

def put_embeddings(thumb_embeddings: List[List[List[float]]], thumb_timepoints: List[List[float]], source: str, shots: List[ShotBoundary], thumb_keys: List[List[str]], bucket: str) -> None: 
    vid = video_id_from_s3_uri(source)
    vectors = []
    index = pc.Index(index_name)
    for scene_i, (scene_embeds, timepoints, thumb_key) in enumerate(zip(thumb_embeddings, thumb_timepoints, thumb_keys)):  
        # thumb_embeddings: [scene][thumb_idx][768]
        # thumb_timepoints: [scene][thumb_idx] 
        start_s, end_s, start_f, end_f = shots[scene_i]
        for thumb_j, (vec, t_sec, key) in enumerate(zip(scene_embeds, timepoints, thumb_key)):
            vec_id = f"{vid}:s{scene_i:03d}:t{thumb_j:02d}"
            meta = {
                "video_id": vid,
                "source_s3_uri": source,  # or bucket/key separately
                "scene_index": scene_i,
                "thumb_index": thumb_j,
                "t_sec": float(t_sec),
                "start_s": float(start_s),
                "end_s": float(end_s),
                "start_f": int(start_f),
                "end_f": int(end_f),
                "thumb_key": key
            }
            vectors.append((vec_id, vec, meta))

    # batch upsert
    for i in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[i:i+100], namespace=vid)

@app.post("/search_embeddings")
async def search_embeddings(
    filename: str = Form(...),
    text_search: str | None = Form(None),
    image_search: UploadFile | None = File(None),
    top_k: int = Form(10)
):

    try: 
        vid = video_id_from_s3_uri(filename)
        if text_search:
            with torch.no_grad():
                inputs = processor(text=[text_search], return_tensors="pt",padding=True)
                q = model.get_text_features(**inputs)
            query_vec = q[0].cpu().numpy().tolist()
        elif image_search is not None: 
            content = await image_search.read()
            image = Image.open(BytesIO(content))
            with torch.no_grad():
                inputs = processor(images=[image], return_tensors="pt")
                q = model.get_image_features(**inputs)
            query_vec = q[0].cpu().numpy().tolist()
        else: 
            raise HTTPException(status_code=400, detail="Provide either text_search or image_search")
        
        index = pc.Index("sceneit-thumbs")   
        res = index.query(
            vector=query_vec,
            top_k=top_k,
            namespace=vid,   
            include_metadata=True,
        )
        logging.info("Seraching frames")

        # Convert to clean JSON
        matches = [
            {
                "id": m.id,
                "score": float(m.score),
                "metadata": dict(m.metadata) if m.metadata is not None else {}
            }
            for m in res.matches
        ]
        #log a compact line per match
        for m in matches:
            logging.info(
                f"{m['id']} | score={m['score']:.3f} | scene={m['metadata'].get('scene_index')} | t={m['metadata'].get('t_sec')}"
            )
        
        return {
            "namespace": vid,
            "query": text_search if text_search else image_search,
            "top_k": top_k,
            "matches": matches,
            "bucket": S3_BUCKET
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/split_shots", response_model=SplitShotsResponse)
def split_shots(req: SplitShotsRequest):
    tmp_dir = tempfile.mkdtemp(prefix="scenes_")
    bucket, key_path = parse_s3_uri(req.source_s3_uri)

    # 1) Ensure the source video exists
    if not s3_key_exists(bucket, key_path):
        raise HTTPException(status_code=404, detail=f"Video not found in S3: s3://{bucket}/{key_path}")

    # 2) Derive base prefix for all outputs: "videos/<hash>/"
    base_prefix = f"{key_path}/"       # e.g., "videos/<hash>/"
    clips_prefix = base_prefix + "clips/"                   
    thumbs_prefix = base_prefix + "thumbnails/"
    manifest_key = base_prefix + "manifest.json"

    # 3) Short-circuit if video has been processed
    # Preferred: single manifest file as the idempotency marker
    if s3_key_exists(bucket, manifest_key):
        # Already processed; return minimal response (or load manifest and return full)
        return SplitShotsResponse(
            already_processed=True,
            output_prefix=f"s3://{bucket}/{base_prefix}",
            manifest_s3_uri=f"s3://{bucket}/{manifest_key}",
            shots=[]
        )

    # Fallback: if we don't write a manifest yet, detect any existing outputs
    if any_under_prefix(bucket, thumbs_prefix) or any_under_prefix(bucket, clips_prefix):
        return SplitShotsResponse(
            already_processed=True,
            output_prefix=f"s3://{bucket}/{base_prefix}",
            manifest_s3_uri=None,
            shots=[]
        )

    # 4) Download the source video locally
    ext = os.path.splitext(key_path)[1] or ".mp4"
    local_video = os.path.join(tmp_dir, f"input-{uuid4().hex}{ext}")
    s3.download_file(bucket, key_path, local_video)
    logging.info("Detecting Scenes")
    # 5) Detect scenes
    scene_list, shots = detect_scenes(
        video_path=local_video,
        threshold=req.threshold,
        min_scene_len=req.min_scene_len
    )

    if not req.split_clips:
        return SplitShotsResponse(
            already_processed=False,
            output_prefix=f"s3://{bucket}/{base_prefix}",
            shots=[ShotBoundary(
                start_time=s[0], end_time=s[1],
                start_frame=s[2], end_frame=s[3]
            ) for s in shots]
        )

    # 6) Actually split and make thumbnails
    ensure_ffmpeg()

    out_dir = os.path.join(tmp_dir, "out")
    os.makedirs(out_dir, exist_ok=True)
    output_template = os.path.join(out_dir, "shot-$SCENE_NUMBER.mp4")

    logging.info("Splitting Scenes")

    split_video_ffmpeg(
        input_video_path=local_video,
        scene_list=scene_list,
        output_file_template=output_template
    )
    logging.info("Making Thumbnails")
    thumb_out_dir = os.path.join(tmp_dir, "thumbs")
    thumb_paths_by_scene = make_scene_thumbnails(
        video_path=local_video,
        shots=shots,
        out_dir=thumb_out_dir,
        per_scene=3,
        basename="shot"
    )

    # 7) Upload outputs under the SAME video folder
    clip_s3_uris,  thumb_keys_by_scene = [], []

    # created = sorted(
    #     f for f in os.listdir(out_dir)
    #     if f.startswith("shot-") and f.endswith(".mp4")
    # )

    # for filename in created:
    #     local_path = os.path.join(out_dir, filename)
    #     dest_key = clips_prefix + filename
    #     s3.upload_file(local_path, bucket, dest_key, ExtraArgs={"ContentType": "video/mp4"})
    #     clip_s3_uris.append(f"s3://{bucket}/{dest_key}")
    logging.info("Uploading Thumbnails")
    for scene_paths in thumb_paths_by_scene:
        uris_keys = []
        for p in scene_paths:
            dest_key = thumbs_prefix + os.path.basename(p)
            s3.upload_file(p, bucket, dest_key, ExtraArgs={"ContentType": "image/jpeg"})
            uris_keys.append(dest_key)
        thumb_keys_by_scene.append(uris_keys)
    # 8) create embeddings / put in Pinecone 
    logging.info("Creating Embeddings")
    if thumb_paths_by_scene: 
        flat_thumb_paths = [p for scene in thumb_paths_by_scene for p in scene]
        flat_embeds = create_embeddings(flat_thumb_paths)
    counts = [len(shot) for shot in thumb_paths_by_scene]
    thumb_embeddings = []
    i = 0
    for c in counts:
        thumb_embeddings.append(flat_embeds[i:i+c])
        i += c
    thumb_timepoints = []
    for (start_s, end_s, start_f, end_f) in shots:
        times = pick_timepoints(start_s, end_s, count=3)
        thumb_timepoints.append(times)
    logging.info("Putting Embeddings")
    put_embeddings(thumb_embeddings=thumb_embeddings, 
                   thumb_timepoints=thumb_timepoints, 
                   source=req.source_s3_uri, 
                   shots=shots,
                   thumb_keys=thumb_keys_by_scene,
                   bucket=S3_BUCKET)
    
    # 9) Write a small manifest.json for idempotency and UI
    manifest = {
        "source": f"s3://{bucket}/{key_path}",
        "outputs": {
            "clips_prefix": f"s3://{bucket}/{clips_prefix}",
            "thumbnails_prefix": f"s3://{bucket}/{thumbs_prefix}",
            "clips": clip_s3_uris,
        },
        "shots": [
            {"start_time": s[0], "end_time": s[1], "start_frame": s[2], "end_frame": s[3]}
            for s in shots
        ],
    }
    s3.put_object(
        Bucket=bucket,
        Key=manifest_key,
        Body=json.dumps(manifest).encode("utf-8"),
        ContentType="application/json"
    )

    return SplitShotsResponse(
        already_processed=False,
        output_prefix=f"s3://{bucket}/{base_prefix}",
        manifest_s3_uri=f"s3://{bucket}/{manifest_key}",
        shots=[ShotBoundary(
            start_time=s[0], end_time=s[1],
            start_frame=s[2], end_frame=s[3]
        ) for s in shots], 
        thumb_keys_by_scene=thumb_keys_by_scene,
        thumb_embeddings=thumb_embeddings,
        pc_namespace=video_id_from_s3_uri(req.source_s3_uri)
    )