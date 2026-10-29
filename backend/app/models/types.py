from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


# Added 2026-10-29 for MySQL/MariaDB hosting (phpMyAdmin).
#
# PostgreSQL stores `timestamptz` and hands back timezone-aware datetimes.
# MySQL DATETIME has no timezone, so it hands back naive ones, and the API
# would start emitting "2026-10-29T03:00:00" without the "+00:00" — which the
# browser then reads as LOCAL time, shifting every date by 8 hours.
#
# This type keeps both databases behaving the same: values are stored as UTC
# and always come back timezone-aware UTC. database.py sets the MySQL session
# time_zone to +00:00 so server-side NOW() defaults are UTC as well.
class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None or dialect.name not in ("mysql", "mariadb"):
            return value
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value
