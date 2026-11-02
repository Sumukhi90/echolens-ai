from datetime import datetime, timezone

from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    meeting_date: Mapped[str] = mapped_column(String(40), default="")
    source_filename: Mapped[str] = mapped_column(String(255), default="")
    processing_status: Mapped[str] = mapped_column(String(30), default="ready")
    transcript_text: Mapped[str] = mapped_column(Text)
    summary_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)

    segments: Mapped[list["TranscriptSegment"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="TranscriptSegment.position"
    )
    decisions: Mapped[list["Decision"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    actions: Mapped[list["ActionItem"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    evidence_references: Mapped[list["EvidenceReference"]] = relationship(
        cascade="all, delete-orphan"
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    position: Mapped[int]
    timestamp: Mapped[str] = mapped_column(String(30), default="")
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    speaker: Mapped[str] = mapped_column(String(100), default="")
    text: Mapped[str] = mapped_column(Text)
    meeting: Mapped[Meeting] = relationship(back_populates="segments")
    embedding: Mapped["SegmentEmbedding | None"] = relationship(
        back_populates="segment", cascade="all, delete-orphan", uselist=False
    )


class SegmentEmbedding(Base):
    __tablename__ = "segment_embeddings"

    segment_id: Mapped[int] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), primary_key=True
    )
    model_name: Mapped[str] = mapped_column(String(160))
    vector_json: Mapped[str] = mapped_column(Text)
    segment: Mapped[TranscriptSegment] = relationship(back_populates="embedding")


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    classification: Mapped[str] = mapped_column(String(40))
    evidence_segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="SET NULL"), nullable=True
    )
    meeting: Mapped[Meeting] = relationship(back_populates="decisions")


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    task: Mapped[str] = mapped_column(Text)
    owner: Mapped[str] = mapped_column(String(100), default="")
    due_date: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(30), default="open")
    evidence_segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="SET NULL"), nullable=True
    )
    meeting: Mapped[Meeting] = relationship(back_populates="actions")
    evidence_segment: Mapped[TranscriptSegment | None] = relationship(
        foreign_keys=[evidence_segment_id]
    )


class EvidenceReference(Base):
    __tablename__ = "evidence_references"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    claim: Mapped[str] = mapped_column(Text)
    classification: Mapped[str] = mapped_column(String(40))
    explanation: Mapped[str] = mapped_column(Text)
    evidence_segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="SET NULL"), nullable=True
    )
    review_status: Mapped[str] = mapped_column(String(30), default="unreviewed")
