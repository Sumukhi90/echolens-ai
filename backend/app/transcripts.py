import re
from dataclasses import dataclass


MAX_UPLOAD_BYTES = 2 * 1024 * 1024
ALLOWED_EXTENSIONS = {".txt", ".md", ".vtt"}
VTT_TIME_RE = re.compile(
    r"(?P<start>(?:\d{1,2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)\s+-->\s+"
    r"(?P<end>(?:\d{1,2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)"
)
INLINE_TIME_RE = re.compile(
    r"^\[(?P<time>\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]\s*"
)
SPEAKER_RE = re.compile(r"^(?P<speaker>[A-Za-z][\w .'-]{0,60}):\s+(?P<text>.+)$")


@dataclass
class Segment:
    timestamp: str
    speaker: str
    text: str
    duration_seconds: float | None = None


def parse_transcript(filename: str, content: bytes) -> list[Segment]:
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type. Upload TXT, Markdown, or WebVTT.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Transcript exceeds the 2 MB upload limit.")
    try:
        raw = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Transcript must be a UTF-8 text file.") from exc
    if not raw.strip():
        raise ValueError("Transcript file is empty.")
    return parse_text(raw, is_vtt=extension == ".vtt")


def parse_text(text: str, is_vtt: bool = False) -> list[Segment]:
    segments: list[Segment] = []
    current_time = ""
    current_duration: float | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip().lstrip("\ufeff")
        if not line or line.upper() == "WEBVTT" or line.isdigit():
            continue
        timing = VTT_TIME_RE.search(line) if is_vtt else None
        if timing:
            current_time = timing.group("start")
            current_duration = max(
                0.0, _time_seconds(timing.group("end")) - _time_seconds(current_time)
            )
            continue
        if is_vtt and "-->" in line:
            continue
        inline = INLINE_TIME_RE.match(line)
        if inline:
            current_time = inline.group("time")
            current_duration = None
            line = line[inline.end():].strip()
        speaker_match = SPEAKER_RE.match(line)
        speaker = speaker_match.group("speaker") if speaker_match else ""
        content = speaker_match.group("text") if speaker_match else line
        if content:
            segments.append(Segment(current_time, speaker, content, current_duration))
    if not segments:
        raise ValueError("No transcript text could be parsed from this file.")
    return segments


def _time_seconds(value: str) -> float:
    parts = value.split(":")
    seconds = float(parts[-1])
    minutes = int(parts[-2])
    hours = int(parts[-3]) if len(parts) == 3 else 0
    return hours * 3600 + minutes * 60 + seconds
