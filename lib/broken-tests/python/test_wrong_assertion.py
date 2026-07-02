"""Broken test: wrong expected HTTP status."""

from status_codes import login_response_code


def test_login_returns_200():
    assert login_response_code() == 200