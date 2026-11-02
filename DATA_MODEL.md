# Data model

- **Meeting:** title, date, source filename, original transcript, processing status, serialized local summary, creation time.
- **TranscriptSegment:** ordered text excerpt with optional speaker, timestamp, and duration; owned by a meeting. Duration is nullable for old/plain-text records and is added through a non-destructive SQLite migration.
- **SegmentEmbedding:** optional local vector cache keyed by transcript segment and model; removed with its segment.
- **Decision:** extracted statement, `confirmed` or `suggestion` classification, source segment reference.
- **ActionItem:** editable task, explicitly identified owner and due-date text (blank if absent), open/completed state, source segment reference. Overdue is derived when an open item has a past ISO due date; it is not persisted as a separate state.
- **EvidenceReference:** inspected claim, classification, explanation, review status, optional source segment.

Deleting a meeting cascades to its segments, cached embeddings, decisions, actions, and inspection records. Evidence foreign keys become null if a source segment is removed independently. Schema changes are additive; the application does not reset or delete existing databases.
