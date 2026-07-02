"""Refactored to use shared email validation (previously Copy 1)."""

import sys
from pathlib import Path

# Make shared module importable when this file is run directly as a script
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from email_validator import validate_email

# validate_email is now provided by the shared module
__all__ = ["validate_email"]
