import io
import re
import wave
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from ollama import AsyncClient, ResponseError
from piper import PiperVoice
from pydantic import BaseModel

MODEL = "qwen2.5:1.5b"
MAX_TOKENS = 120          # cap on reply length, keeps speech short
HISTORY_MESSAGES = 10
VOICE_PATH = Path(__file__).parent / "voices" / "en_GB-alba-medium.onnx"

SYSTEM_PROMPT = (
    "You are a friendly conversational assistant. "
    "Always use British English spelling and phrasing. "
    "Keep replies to one to three short sentences, in plain text with no markdown or emojis."
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncClient()
voice = PiperVoice.load(VOICE_PATH)


# ---------- helpers ----------

EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF\uFE0F\u200d]+"
)

def clean_text(text: str) -> str:
    """Strip markdown, emojis and stray symbols so the text reads well aloud."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)        # code blocks
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)      # [label](url) -> label
    text = re.sub(r"[*_`#>~]+", "", text)                      # markdown symbols
    text = EMOJI_RE.sub("", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def trim_to_sentence(text: str) -> str:
    """If the token cap cut the reply mid-sentence, drop the unfinished part."""
    if text.endswith((".", "!", "?")):
        return text
    last = max(text.rfind("."), text.rfind("!"), text.rfind("?"))
    return text[: last + 1] if last > 0 else text


# ---------- models ----------

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[Message] = []

class TTSRequest(BaseModel):
    text: str


# ---------- endpoints ----------

@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is empty")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [m.model_dump() for m in req.history[-HISTORY_MESSAGES:]]
    messages.append({"role": "user", "content": req.message})

    try:
        response = await client.chat(
            model=MODEL,
            messages=messages,
            options={"num_predict": MAX_TOKENS, "temperature": 0.7},
        )
    except (ConnectionError, httpx.ConnectError):
        raise HTTPException(
            status_code=503,
            detail="Cannot reach Ollama. Is it running? Try: ollama serve",
        )
    except ResponseError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Model error: {e.error}. Have you run: ollama pull {MODEL}?",
        )

    reply = trim_to_sentence(clean_text(response.message.content))
    if not reply:
        raise HTTPException(status_code=502, detail="The model returned an empty reply")
    return {"reply": reply}


@app.post("/api/tts")
def tts(req: TTSRequest):
    text = clean_text(req.text)
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")
    try:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)
    except Exception:
        raise HTTPException(status_code=500, detail="Speech synthesis failed")
    return Response(content=buf.getvalue(), media_type="audio/wav")