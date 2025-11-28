import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, SmallInteger, BigInteger, Boolean, TIMESTAMP, Enum, Text, Index
from sqlalchemy.orm import sessionmaker

# Load environment variables
load_dotenv()

# Construct database URL
# Prioritize POSTGRES_URL, fall back to individual components
DATABASE_URL = os.getenv("POSTGRES_URL")

if not DATABASE_URL:
    DB_USER = os.getenv("POSTGRES_USER", "postgres")
    DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")
    DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
    DB_PORT = os.getenv("POSTGRES_PORT", "5432")
    DB_NAME = os.getenv("POSTGRES_DB", "maimai_charts")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# SQLAlchemy requires 'postgresql+psycopg2' or just 'postgresql' (which defaults to psycopg2)
# but sometimes 'postgres://' (common in older envs) causes issues if not mapped.
# Let's fix the protocol if it is 'postgres://'
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

metadata = MetaData()

# Define relevant tables matching src/lib/db/schema-pg.ts
# Note: Using exact column names as quoted identifiers where necessary

songs = Table(
    "songs",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("publicId", String(21), unique=True, nullable=False),
    Column("songName", Text, nullable=False),
    Column("artist", Text, nullable=False),
    Column("level", Enum("1", "1+", "2", "2+", "3", "3+", "4", "4+", "5", "5+", "6", "6+", "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+", "13", "13+", "14", "14+", "15", "15+", "16", "16+", name="level"), nullable=False),
    Column("levelPrecise", SmallInteger, nullable=False), # Y variable
    Column("difficulty", Enum("basic", "advanced", "expert", "master", "remaster", name="difficulty"), nullable=False),
    Column("type", Enum("dx", "std", name="chart_type"), nullable=False),
    Column("region", Enum("jp", "intl", "cn", name="region"), nullable=False),
    Column("gameVersion", SmallInteger, nullable=False),
)

user_snapshots = Table(
    "user_snapshots",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("userId", Text, nullable=False),
    Column("region", Enum("jp", "intl", "cn", name="region"), nullable=False),
    Column("rating", SmallInteger, nullable=False), # X1 variable
    Column("fetchedAt", TIMESTAMP(timezone=False), nullable=False),
)

user_scores = Table(
    "user_scores",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("snapshotId", BigInteger, nullable=False),
    Column("songId", BigInteger, nullable=False),
    Column("achievement", Integer, nullable=False), # X2 variable (stored as 10000x)
)

def get_db_connection():
    return engine.connect()

