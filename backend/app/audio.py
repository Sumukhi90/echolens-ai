import logging
import os
import tempfile
from pathlib import Path
from typing import Callable, Protocol

from .transcripts import Segment


LOGGER = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 2 * 60 * 60
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a"}
_models: dict[str, object] = {}


class AudioDependencyMissing(RuntimeError):
    pass


class AudioProcessingError(RuntimeError):
    pass


class Transcriber(Protocol):
    def transcribe(self, audio: str, **kwargs): ...


def validate_audio(filename: str, content: bytes) -> str:
    extension = Path(filename).suffix.casefold()
    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise ValueError("Unsupported audio type. Upload WAV, MP3, or M4A.")
    if len(content) > MAX_AUDIO_BYTES:
        raise ValueError("Audio exceeds the 25 MB upload limit.")
    if not content:
        raise ValueError("Audio file is empty.")
    valid_signature = (
        extension == ".wav" and content.startswith(b"RIFF") and content[8:12] == b"WAVE"
    ) or (
        extension == ".mp3"
        and (content.startswith(b"ID3") or (len(content) >= 2 and content[0] == 0xFF and content[1] & 0xE0 == 0xE0))
    ) or (
        extension == ".m4a" and len(content) >= 12 and content[4:8] == b"ftyp"
    )
    if not valid_signature:
        raise ValueError("Audio content does not match the selected file type.")
    return extension


def _probe_duration(path: str) -> float:
    try:
        import av
    except ImportError as exc:
        raise AudioDependencyMissing(
            "Install the optional audio dependencies to inspect local audio."
        ) from exc
    try:
        with av.open(path) as container:
            if container.duration is None:
                raise ValueError("Could not determine audio duration.")
            return float(container.duration) / av.time_base
    except av.error.FFmpegError as exc:
        raise AudioProcessingError("Audio could not be decoded to inspect its duration.") from exc


def _get_model():
    model_name = os.getenv("WHISPER_MODEL", "base")
    if model_name not in _models:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise AudioDependencyMissing(
                "Local speech-to-text is optional. Install backend\\requirements-audio.txt; "
                "the Whisper model downloads on first use."
            ) from exc
        _models[model_name] = WhisperModel(
            model_name, device="cpu", compute_type="int8"
        )
    return _models[model_name]


def _format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, seconds_part = divmod(remainder, 60)
    return f"{hours:02}:{minutes:02}:{seconds_part:02}"


def _ffmpeg_errors() -> tuple[type[Exception], ...]:
    try:
        import av
    except ImportError:
        return ()
    return (av.error.FFmpegError,)


def transcribe_audio(
    filename: str,
    content: bytes,
    *,
    duration_probe: Callable[[str], float] | None = None,
    transcriber: Transcriber | None = None,
) -> list[Segment]:
    validate_audio(filename, content)
    temporary_path = ""
    try:
        with tempfile.NamedTemporaryFile(
            suffix=Path(filename).suffix.casefold(), delete=False
        ) as temporary_file:
            temporary_file.write(content)
            temporary_path = temporary_file.name
        duration = (duration_probe or _probe_duration)(temporary_path)
        if duration <= 0 or duration > MAX_AUDIO_DURATION_SECONDS:
            raise ValueError("Audio duration must be between 1 second and 2 hours.")
        model = transcriber or _get_model()
        segments, _info = model.transcribe(
            temporary_path,
            beam_size=5,
            vad_filter=True,
        )
        result = [
            Segment(
                timestamp=_format_timestamp(float(item.start)),
                speaker="",
                text=str(item.text).strip(),
                duration_seconds=max(0.0, float(item.end) - float(item.start)),
            )
            for item in segments
            if str(item.text).strip()
        ]
        if not result:
            raise AudioProcessingError("No speech could be transcribed from this audio.")
        return result
    except (AudioDependencyMissing, AudioProcessingError, ValueError):
        raise
    except (OSError, RuntimeError, *_ffmpeg_errors()) as exc:
        LOGGER.warning("Local audio transcription failed (%s).", type(exc).__name__)
        raise AudioProcessingError(
            "Audio could not be decoded or transcribed. Check the file and optional local model."
        ) from exc
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)
