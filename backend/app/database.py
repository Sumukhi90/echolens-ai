import os
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{(PROJECT_ROOT / 'echolens.db').as_posix()}",
)
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def migrate_schema(target_engine: Engine = engine) -> None:
    """Apply non-destructive SQLite additions needed by newer application versions."""
    if target_engine.dialect.name != "sqlite":
        return
    columns = {
        column["name"]
        for column in inspect(target_engine).get_columns("transcript_segments")
    }
    if "duration_seconds" not in columns:
        with target_engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE transcript_segments ADD COLUMN duration_seconds FLOAT")
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
