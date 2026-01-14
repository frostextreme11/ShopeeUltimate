"""
Database configuration with SQLite and SQLModel.
Zero-config: automatically creates the database file on startup.
"""
import os
from sqlmodel import SQLModel, create_engine, Session

# Database file path - created automatically if doesn't exist
DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "shopeehunter.db")
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# Create engine with check_same_thread=False for FastAPI async compatibility
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False}
)


def init_db():
    """
    Initialize the database.
    Creates all tables if they don't exist.
    The .db file is created automatically by SQLite.
    """
    SQLModel.metadata.create_all(engine)


def get_session():
    """
    Dependency for FastAPI to get a database session.
    """
    with Session(engine) as session:
        yield session
