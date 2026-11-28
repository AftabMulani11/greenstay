import json
import logging
import os
from functools import lru_cache

import boto3
from botocore.exceptions import BotoCoreError, ClientError


logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def ses_client():
    return boto3.client("ses", region_name=os.getenv("AWS_REGION", "us-east-1"))


def lambda_handler(event, context):
    records = event["Records"]
    sender = os.getenv("SENDER_EMAIL")
    if not sender:
        logger.error("SENDER_EMAIL is required")
        return {
            "batchItemFailures": [{"itemIdentifier": record["messageId"]} for record in records]
        }

    failures = []
    for record in records:
        try:
            payload = json.loads(record["body"])
            if isinstance(payload, dict) and payload.get("Type") == "Notification":
                payload = json.loads(payload["Message"])
            if not isinstance(payload, dict) or not all(
                isinstance(payload.get(field), str) and payload[field].strip()
                for field in ("to_address", "subject", "body")
            ):
                raise ValueError("Invalid email payload")

            ses_client().send_email(
                Source=sender,
                Destination={"ToAddresses": [payload["to_address"]]},
                Message={
                    "Subject": {"Data": payload["subject"], "Charset": "UTF-8"},
                    "Body": {"Text": {"Data": payload["body"], "Charset": "UTF-8"}},
                },
            )
        except (BotoCoreError, ClientError, KeyError, TypeError, ValueError) as error:
            message_id = record["messageId"]
            logger.warning("Email job %s failed (%s)", message_id, type(error).__name__)
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}
