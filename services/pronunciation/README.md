# Local phoneme-level pronunciation service

SpeakUp AI can use [OpenPronounce](https://github.com/Halleck45/OpenPronounce), a self-hosted pronunciation-assessment service built around Wav2Vec2 phoneme recognition. The app sends the target sentence and a short audio recording to this service; it does not send recordings to Ollama. Keep the service bound to localhost for private local use.

## Install on macOS

Requirements: Python 3.10+, Homebrew, ffmpeg, and espeak-ng. The first model run downloads model weights (multiple gigabytes total).

```bash
brew install ffmpeg espeak-ng
git clone https://github.com/Halleck45/OpenPronounce.git ../OpenPronounce
cd ../OpenPronounce
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -e ".[app]"
uvicorn server:app --host 127.0.0.1 --port 8001
```

If your checkout documents a different app extra or ASGI module, follow its current upstream instructions. The default model is downloaded on first use and needs audio sampled at 16 kHz; OpenPronounce handles supported audio decoding and resampling.

## Configure SpeakUp AI

Add this server-side variable to `.env.local` (or your deployment environment):

```dotenv
PRONUNCIATION_SERVICE_URL=http://127.0.0.1:8001
```

Restart Next.js after changing environment variables. Open Practice Room, request English feedback, choose **Record pronunciation**, say the corrected sentence, and press **Stop and assess**. The service returns an overall estimate and sound-level differences. These scores are coaching signals, not a validated language-proficiency or clinical assessment.

## Privacy and fallback

- The app requests microphone permission only when the learner starts a recording.
- Recordings are uploaded only to the configured pronunciation service; by default this is localhost. If you configure a remote URL, audio is sent to that server.
- Audio is not stored in the browser's session history by this integration.
- If the service is not running, the UI explains how to start it and the existing browser transcript comparison remains available.
- The upstream OpenPronounce project is MIT-licensed; its Wav2Vec2 phoneme-recognition checkpoint is Apache-2.0. Review upstream licenses and setup notes before redistribution.