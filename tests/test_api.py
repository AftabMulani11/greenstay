import importlib
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock

import pytest


@pytest.fixture
def demo_client(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "backend"))
    monkeypatch.setenv("PUBLIC_DEMO", "true")
    monkeypatch.setenv("DEMO_SESSION_KEY", "local-test-session-key")
    monkeypatch.setenv("DEMO_EMAIL_RECIPIENT", "demo@example.test")
    monkeypatch.setenv("CLOUDFRONT_ORIGIN_TOKEN", "local-test-origin")
    storage = ModuleType("db")
    storage.initialize = Mock()
    storage.hotel_registration = Mock(return_value={"success": True, "hotel_id": "DEMO01"})
    storage.get_all_guests = Mock(return_value=[])
    storage.convert_decimals = lambda value: value
    monkeypatch.setitem(sys.modules, "db", storage)
    module = importlib.import_module("app")
    try:
        yield module.app
    finally:
        sys.modules.pop("app", None)


def test_health_requires_the_proxy_header_for_the_public_route(demo_client):
    client = demo_client.test_client()
    assert client.get("/healthz").json == {"status": "ok"}
    assert client.get("/api/healthz").status_code == 403
    response = client.get("/api/healthz", headers={"X-GreenStay-Origin": "local-test-origin"})
    assert response.json == {"status": "ok"}


def test_registration_scopes_demo_bookings_to_the_browser(demo_client):
    client = demo_client.test_client()
    request = {
        "base_url": "https://localhost",
        "headers": {"X-GreenStay-Origin": "local-test-origin"},
    }
    response = client.post("/api/hotel-registration", json={"hotel_name": "Sample Hotel"}, **request)
    assert response.status_code == 200
    assert client.post("/api/login", json={"type": "hotel"}, **request).json["hotel_id"] == "DEMO01"
    assert client.get("/api/guests/DEMO01", **request).status_code == 200
    assert demo_client.test_client().get("/api/guests/DEMO01", **request).status_code == 404
