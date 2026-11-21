# British Voice Chat

This project is a web app to chat with a local LLM and listen to its replies in a British English Voice. 
React as a front-end and FastAPI as a back-end.
Ollama (qwen2.5:1.5b) for text generation and Piper for speech generation. 
Everything runs locally; no cloud services.

## Requirements
- Python 3.12
- Node.js 18+
- [Ollama](https://ollama.com/download), installed and running

## Setup (first time only)

1. Download the model:

       ollama pull qwen2.5:1.5b

2. Backend (from the project folder):
       
       python -m venv venv
       venv\Scripts\activate          (Mac/Linux: source venv/bin/activate)
       pip install -r requirements.txt

3. Frontend (in a second terminal):

       cd frontend
       npm install

## Run

1. Backend (venv active):

       cd backend
       uvicorn main:app --reload

2. Frontend (second terminal):

       cd frontend
       npm run dev

3. Open http://localhost:5173

## Notes
- The British voice files are included in `backend/voices/`.
- Turn speech on or off with the toggle at the top right.
- Runs on CPU if there's no GPU, just more slowly.