import re
from collections import Counter

from .models import Meeting, TranscriptSegment


STOP_WORDS = {
    "about", "after", "again", "also", "and", "are", "because", "been", "before",
    "being", "but", "can", "could", "did", "does", "during", "each", "for", "from",
    "get", "had", "has", "have", "here", "how", "into", "its", "just", "like", "make",
    "more", "most", "not", "our", "out", "please", "said", "she", "should", "that",
    "the", "their", "them", "then", "there", "they", "this", "those", "through", "was",
    "what", "when", "where", "which", "who", "will", "with", "would", "you", "your",
}
ACTION_RE = re.compile(
    r"\b(?:will|need to|needs to|action item|follow up|follow-up|send|share|prepare|"
    r"create|schedule|review|update|deliver|own|assigned to)\b",
    re.I,
)
DECISION_RE = re.compile(r"\b(?:decided|agreed|approved|confirmed|we will|we'll)\b", re.I)
TENTATIVE_RE = re.compile(r"\b(?:maybe|perhaps|suggest|suggestion|could|might|tentative)\b", re.I)
DATE_RE = re.compile(
    r"\b(?:by|due|before)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|"
    r"today|tomorrow|next week|next month|(?:20\d{2}-\d{2}-\d{2}))\b",
    re.I,
)
OWNER_RE = re.compile(
    r"\b(?:assigned to|owner is|owned by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b"
)
FIRST_PERSON_RE = re.compile(r"^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s*(?:I will|I'll)\b")


def _topic_words(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z'-]{3,}", text.lower())
    return [word for word in words if word not in STOP_WORDS]


def analyze(meeting: Meeting) -> dict:
    segments = meeting.segments
    sentences = []
    for segment in segments:
        for sentence in re.split(r"(?<=[.!?])\s+", segment.text.strip()):
            if sentence:
                sentences.append((segment, sentence))
    topic_candidates = [word for segment in segments for word in _topic_words(segment.text)]
    topics = [word for word, _ in Counter(topic_candidates).most_common(5)]
    decisions = []
    actions = []
    unresolved = []
    points = []
    for segment, sentence in sentences:
        lower = sentence.lower()
        if any(term in lower for term in ("open question", "unresolved", "not sure", "need to clarify", "still unclear")):
            unresolved.append({"text": sentence, "evidence": _evidence(segment)})
        if TENTATIVE_RE.search(sentence) and not re.search(
            r"\b(?:risk|blocked|blocker|delay)\b", sentence, re.I
        ):
            decisions.append({"text": sentence, "classification": "suggestion", "evidence": _evidence(segment)})
        elif DECISION_RE.search(sentence):
            decisions.append({"text": sentence, "classification": "confirmed", "evidence": _evidence(segment)})
        if ACTION_RE.search(sentence):
            owner_match = OWNER_RE.search(sentence)
            speaker_action = FIRST_PERSON_RE.match(f"{segment.speaker}: {sentence}") if segment.speaker else None
            owner = owner_match.group(1) if owner_match else (segment.speaker if speaker_action else "")
            due_match = DATE_RE.search(sentence)
            actions.append(
                {
                    "task": sentence,
                    "owner": owner,
                    "due_date": due_match.group(0) if due_match else "",
                    "status": "open",
                    "evidence": _evidence(segment),
                }
            )
        if len(points) < 6 and len(sentence) > 20:
            points.append({"text": sentence, "evidence": _evidence(segment)})
    unique_actions = []
    seen = set()
    for action in actions:
        if action["task"].lower() not in seen:
            unique_actions.append(action)
            seen.add(action["task"].lower())
    return {
        "overview": points[0]["text"] if points else "No substantive discussion could be summarized from this transcript.",
        "topics": topics,
        "discussion_points": points,
        "decisions": decisions,
        "unresolved_questions": unresolved,
        "follow_ups": unique_actions,
        "risks_and_blockers": [
            {"text": sentence, "evidence": _evidence(segment)}
            for segment, sentence in sentences
            if re.search(r"\b(?:risk|blocked|blocker|delay|at risk)\b", sentence, re.I)
        ],
        "mode": "local deterministic analysis",
    }


def _evidence(segment: TranscriptSegment) -> dict:
    return {
        "excerpt": segment.text,
        "speaker": segment.speaker,
        "timestamp": segment.timestamp,
        "segment_id": segment.id,
    }
