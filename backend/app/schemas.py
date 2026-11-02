from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    transcript: str = Field(min_length=1, max_length=2_000_000)
    meeting_date: str = Field(default="", max_length=40)
    source_filename: str = Field(default="", max_length=255)


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    meeting_date: str | None = Field(default=None, max_length=40)


class MeetingSummary(BaseModel):
    id: int
    title: str
    meeting_date: str
    source_filename: str
    processing_status: str
    created_at: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    mode: Literal["local", "live_ai"] = "local"
    allow_external_processing: bool = False


class CrossMeetingAskRequest(AskRequest):
    meeting_ids: list[int] = Field(default_factory=list, max_length=50)
    date_from: date | None = None
    date_to: date | None = None


class ActionItemUpdate(BaseModel):
    task: str | None = Field(default=None, min_length=1, max_length=2000)
    owner: str | None = Field(default=None, max_length=100)
    due_date: str | None = Field(default=None, max_length=100)
    status: Literal["pending", "open", "completed"] | None = None


class InspectRequest(BaseModel):
    claim: str = Field(min_length=1, max_length=2000)
