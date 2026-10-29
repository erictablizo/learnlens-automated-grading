from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from app.core.config import settings
 
 
# Added 2026-10-29: MySQL/MariaDB support (phpMyAdmin hosting), e.g.
#   DATABASE_URL=mysql+aiomysql://user:pass@localhost:3306/dbname?charset=utf8mb4
# The session time_zone is pinned to UTC so NOW() defaults match the UTC
# values the app writes (see app/models/types.py). pool_recycle stays under
# the short wait_timeout shared hosts use, or idle connections die mid-request.
_is_mysql = settings.DATABASE_URL.startswith(("mysql", "mariadb"))

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    **({
        "pool_recycle": 280,
        "connect_args": {"init_command": "SET time_zone = '+00:00'"},
    } if _is_mysql else {}),
)
 
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
 
 
class Base(DeclarativeBase):
    pass
 
 
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()