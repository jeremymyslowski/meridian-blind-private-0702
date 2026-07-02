"""Shared email validation module.

Extracted from the duplicated copies previously in
lib/anti-patterns/duplicated_validation/ (the four Copy X files).
This removes the duplication.
"""

import re

EMAIL_RE = re.compile(r"^[^@]+@[^@]+\.[^@]+$")


def validate_email(email: str) -> bool:
    """Return True if email looks valid (non-empty, no spaces, basic regex match)."""
    if not email:
        return False
    if " " in email:
        return False
    return bool(EMAIL_RE.match(email))
