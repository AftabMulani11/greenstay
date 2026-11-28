import importlib
import json
from pathlib import Path
from unittest.mock import Mock

from botocore.exceptions import ClientError


def test_email_batch_retries_only_the_failed_job(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "backend"))
    monkeypatch.setenv("SENDER_EMAIL", "demo@example.test")
    module = importlib.import_module("lambda_email")
    ses = Mock()
    ses.send_email.side_effect = [{}, ClientError({"Error": {"Code": "Throttling"}}, "SendEmail")]
    monkeypatch.setattr(module, "ses_client", lambda: ses)
    body = json.dumps({"to_address": "demo@example.test", "subject": "Check-in", "body": "Welcome"})
    event = {"Records": [
        {"messageId": "accepted", "body": body},
        {"messageId": "retry", "body": json.dumps({"Type": "Notification", "Message": body})},
    ]}

    assert module.lambda_handler(event, None) == {"batchItemFailures": [{"itemIdentifier": "retry"}]}
    assert ses.send_email.call_count == 2
