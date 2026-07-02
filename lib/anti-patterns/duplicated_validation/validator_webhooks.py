"""Refactored to use shared email validation (previously Copy 3)."""

import sys
from pathlib import Path

# Make shared module importable when this file is run directly as a script
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from email_validator import validate_email


def is_valid_contact_email(email: str) -> bool:
    """Backwards-compatible wrapper around the shared validate_email."""
    return validate_email(email)
