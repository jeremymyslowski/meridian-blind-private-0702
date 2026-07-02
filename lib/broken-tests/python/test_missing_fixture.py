"""Broken test: references wrong fixture name."""


def test_user_has_email(seeded_user):
    # Fixture is named 'seeded_user' in conftest, not 'sample_user'
    assert "@" in seeded_user["email"]