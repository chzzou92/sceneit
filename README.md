# SceneIt: Video Semantic Search with CLIP and Pinecone

SceneIt is a system for semantic video search. Instead of scrubbing through footage manually, you can query your films with natural language (e.g., *"when does a dog appear on the couch?"*) or with an image example (e.g., upload a still frame from another film to find visually similar scenes).

At its core, SceneIt extracts representative frames from videos, embeds them using OpenAI CLIP, and indexes the embeddings in Pinecone for efficient semantic search.

---

## Features

- Upload videos directly to S3 via presigned URLs for scalability and resumability.
- Automatic shot boundary detection with [PySceneDetect](https://pyscenedetect.readthedocs.io/) (FFmpeg backend).
- Keyframe extraction: one representative frame per detected shot, stored in S3.
- CLIP embeddings for both image frames and text queries.
- Pinecone vector database for fast nearest-neighbor search.
- Two query modes:
  - **Text → Frame search**: encode natural language queries and retrieve matching frames.
  - **Image → Frame search**: encode an uploaded still image and retrieve visually similar frames.
- JSON manifest for each processed video, including metadata, thumbnails, and embedding status.

---

## Architecture

1. **Upload**  
   - Frontend requests a presigned S3 URL from the FastAPI backend.  
   - Video file is uploaded directly to S3.  
   - Backend stores the S3 URI for further processing.

2. **Process**  
   - Backend downloads the video locally from S3.  
   - PySceneDetect with FFmpeg detects shots.  
   - One keyframe per shot is extracted and uploaded to S3.  
   - Each keyframe is embedded with CLIP.  
   - Embeddings and metadata are inserted into Pinecone.

3. **Search**  
   - Text queries are encoded into CLIP text embeddings.  
   - Image queries are encoded into CLIP image embeddings.  
   - Pinecone performs k-NN search against the stored embeddings.  
   - The system returns top-k matching frames with timestamps and S3 URLs.

---

## Tech Stack

- **Frontend**: Next.js, React, styled-components  
- **Backend**: FastAPI, boto3 (S3 integration), PySceneDetect, ffmpeg, OpenCV (optional frame processing)  
- **ML model**: CLIP (via HuggingFace Transformers)  
- **Vector DB**: Pinecone  
- **Storage**: Amazon S3  

---

## Setup

### Environment variables (`.env` in backend)
```env
AWS_REGION=us-east-1
S3_BUCKET=sceneit
S3_PREFIX=uploads/
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key

PINECONE_API_KEY=your-pinecone-key
PINECONE_ENVIRONMENT=us-east1-gcp
```

---

## Install Dependencies

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend 
```bash 
cd frontend 
npm install 
```

### Root Project 
```bash
npm install 
```

## Run Services 

### Run Back/Front 
In root:
```bash
npm run deev
```

### Run Only Frontend 
```bash
npm run dev:frontend
```

### Run Only Backend 
```bash 
npm run dev:backend 
```

---

## Example Workflows 

### Text Query 
```http
POST /search_embeddings
{
  "filename": "s3://sceneit/uploads/myfilm.mp4",
  "text_search": "man holding a red umbrella",
  "top_k": 5
}
```
Response: Returns 5 frames with timestamps where CLIP embeddings match the query.

### Image Query 
```http
POST /search_embeddings
{
  "filename": "s3://sceneit/uploads/myfilm.mp4",
  "image_search": <upload-file>,
  "top_k": 5
}
```
Response: Finds frames visually similar to the uploaded image.

### Pinecone Model 
Frame Embedding Record 
```json 
{
  "frame_id": "uuid",
  "video_id": "uuid",
  "shot_index": 3,
  "time_sec": 42.8,
  "vector": [0.123, -0.456, 0.789,...],
  "modality": "image",
  "s3_key": "uploads/frames/myfilm/shot_0003.jpg"
}
```
