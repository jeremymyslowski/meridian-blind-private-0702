"""Canonical user service for the Meridian API.

When editing user lookup logic, THIS is the production file.
"""

from uuid import UUID

from psycopg2.extensions import connection

from meridian_api.errors import APIError


def get_user_by_id(db: connection, user_id: UUID) -> dict:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, email, name, created_at FROM users WHERE id = %s",
            (str(user_id),),
        )
        row = cur.fetchone()
    if not row:
        raise APIError("USER_NOT_FOUND", "User not found", 404)
    return dict(row)


def get_user_by_email(db: connection, email: str) -> dict | None:
    with db.cursor() as cur:
        cur.execute(
            "SELECT id, email, name, created_at FROM users WHERE email = %s",
            (email,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def get_user_display_name(db: connection, user_id: UUID) -> str:
    """Return the user's name, or their email if name is empty."""
    user = get_user_by_id(db, user_id)
    name = user.get("name", "").strip()
    if name:
        return name
    return user.get("email", "")
