from pydantic import BaseModel, ConfigDict, Field


class CitedAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(max_length=4000)
    citation_segment_ids: list[int] = Field(max_length=5)
    abstained: bool
