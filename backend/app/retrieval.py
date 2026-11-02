import json
import logging
import math
import os
import re
from dataclasses import dataclass
from datetime import date
from typing import Protocol, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .models import Meeting, SegmentEmbedding, TranscriptSegment


LOGGER = logging.getLogger(__name__)
MODEL_NAME = os.getenv("LOCAL_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
SEMANTIC_MIN_SCORE = 0.55
SEMANTIC_STRONG_SCORE = 0.65
STOP_WORDS = {
    "about", "and", "are", "did", "does", "for", "from", "have", "how", "is",
    "maybe", "not", "our", "please", "said", "that", "the", "their", "them",
    "there", "this", "was", "were", "what", "when", "where", "which", "who",
    "with", "would", "you", "your",
}


class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> Sequence[Sequence[float]]:
        ...


@dataclass
class RetrievedSegment:
    segment: TranscriptSegment
    score: float


@dataclass
class RetrievalResult:
    items: list[RetrievedSegment]
    mode: str
    notice: str = ""


_embedder: Embedder | None = None


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[A-Za-z0-9'-]{3,}", text.casefold())
        if token not in STOP_WORDS
    }


def _intent_terms(question: str) -> set[str]:
    terms = _tokens(question)
    lower = question.casefold()
    if re.search(r"\b(?:who|owner|assigned|responsible)\b", lower):
        terms.update({"will", "assigned", "owner", "prepare", "send", "share", "create", "follow"})
    if re.search(r"\b(?:when|deadline|due date|due)\b", lower):
        terms.update({"by", "due", "before", "tomorrow", "today", "monday", "tuesday", "wednesday", "thursday", "friday"})
    if re.search(r"\b(?:decid|decision|agree|agreed)\w*\b", lower):
        terms.update({"decided", "agreed", "approved", "confirmed"})
    if re.search(r"\b(?:problem|risk|blocker|blocked)\w*\b", lower):
        terms.update({"risk", "blocker", "blocked", "delay", "unclear"})
    if re.search(r"\b(?:unresolved|remain|open question|unclear)\b", lower):
        terms.update({"unresolved", "clarify", "unclear", "question"})
    return terms


def _get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding

        _embedder = TextEmbedding(model_name=MODEL_NAME)
    return _embedder


def _cosine(left: Sequence[float], right: Sequence[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def _keyword_retrieve(
    question: str, segments: Sequence[TranscriptSegment], limit: int
) -> list[RetrievedSegment]:
    terms = _intent_terms(question)
    if not terms:
        return []
    required_overlaps = max(1, min(2, len(_tokens(question))))
    ranked = []
    for segment in segments:
        words = _tokens(segment.text)
        overlap = terms & words
        if len(overlap) >= required_overlaps:
            ranked.append((len(overlap) / max(len(terms), 1), segment))
    ranked.sort(key=lambda result: result[0], reverse=True)
    return [
        RetrievedSegment(segment=segment, score=score)
        for score, segment in ranked[:limit]
        if score >= 0.1
    ]


def retrieve_segments(
    db: Session,
    question: str,
    *,
    meeting_ids: Sequence[int] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 5,
    embedder: Embedder | None = None,
) -> RetrievalResult:
    statement = (
        select(TranscriptSegment)
        .join(TranscriptSegment.meeting)
        .options(joinedload(TranscriptSegment.meeting))
        .order_by(Meeting.id, TranscriptSegment.position)
    )
    if meeting_ids:
        statement = statement.where(TranscriptSegment.meeting_id.in_(meeting_ids))
    if date_from:
        statement = statement.where(Meeting.meeting_date >= date_from.isoformat())
    if date_to:
        statement = statement.where(Meeting.meeting_date <= date_to.isoformat())
    segments = db.scalars(statement).unique().all()
    if not segments:
        return RetrievalResult([], "keyword")

    use_embeddings = (
        embedder is not None
        or os.getenv("LOCAL_EMBEDDINGS_ENABLED", "false").casefold() == "true"
    )
    if use_embeddings:
        try:
            active_embedder = embedder or _get_embedder()
            cached = {
                row.segment_id: row
                for row in db.scalars(
                    select(SegmentEmbedding).where(
                        SegmentEmbedding.segment_id.in_([item.id for item in segments]),
                        SegmentEmbedding.model_name == MODEL_NAME,
                    )
                ).all()
            }
            missing = [segment for segment in segments if segment.id not in cached]
            if missing:
                texts = [f"Represent this passage: {segment.text}" for segment in missing]
                vectors = list(active_embedder.embed(texts))
                if len(vectors) != len(missing):
                    raise ValueError("Embedding provider returned an unexpected vector count.")
                for segment, vector in zip(missing, vectors):
                    embedding = SegmentEmbedding(
                        segment_id=segment.id,
                        model_name=MODEL_NAME,
                        vector_json=json.dumps([float(value) for value in vector]),
                    )
                    db.add(embedding)
                    cached[segment.id] = embedding
                db.commit()
            query_vectors = list(
                active_embedder.embed(
                    [f"Represent this sentence for searching relevant passages: {question}"]
                )
            )
            if len(query_vectors) != 1:
                raise ValueError("Embedding provider returned an unexpected query vector count.")
            query_vector = query_vectors[0]
            ranked = [
                RetrievedSegment(
                    segment=segment,
                    score=_cosine(
                        query_vector, json.loads(cached[segment.id].vector_json)
                    ),
                )
                for segment in segments
            ]
            ranked.sort(key=lambda item: item.score, reverse=True)
            keyword_ids = {
                item.segment.id
                for item in _keyword_retrieve(question, segments, limit=len(segments))
            }
            relevant = [
                item
                for item in ranked
                if item.score >= SEMANTIC_MIN_SCORE
                and (item.score >= SEMANTIC_STRONG_SCORE or item.segment.id in keyword_ids)
            ][:limit]
            if not relevant:
                return RetrievalResult(
                    _keyword_retrieve(question, segments, limit),
                    "keyword_fallback",
                    "No sufficiently relevant semantic matches were found; keyword retrieval was used.",
                )
            return RetrievalResult(
                relevant,
                "local_semantic",
            )
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            LOGGER.warning(
                "Local embeddings unavailable (%s); using keyword retrieval.",
                type(exc).__name__,
            )
            return RetrievalResult(
                _keyword_retrieve(question, segments, limit),
                "keyword_fallback",
                "Local semantic model unavailable; keyword evidence retrieval was used.",
            )

    return RetrievalResult(_keyword_retrieve(question, segments, limit), "keyword")
