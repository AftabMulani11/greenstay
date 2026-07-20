"""
In-cluster SQS email worker — the Kubernetes counterpart of lambda_email.py.

Long-polls the GreenStay email queue and dispatches messages through SES.
Used by k8s/worker.yaml when email draining runs as a pod instead of Lambda.
"""

import json
import os
import time

import boto3
from dotenv import load_dotenv

load_dotenv()

REGION = os.getenv("AWS_REGION_NAME", "eu-west-1")
QUEUE_URL = os.getenv("SQS_QUEUE_URL")
SENDER_EMAIL = os.getenv("AWS_SES_SENDER_EMAIL")

sqs = boto3.client("sqs", region_name=REGION)
ses = boto3.client("ses", region_name=REGION)


def process_message(message):
    payload = json.loads(message["Body"])

    to_address = payload.get("to_address")
    subject = payload.get("subject")
    body_text = payload.get("body")

    if not to_address or not body_text:
        print("Skipping invalid message payload.")
        return

    ses.send_email(
        Source=SENDER_EMAIL,
        Destination={"ToAddresses": [to_address]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
        },
    )
    print(f"SUCCESS: Email sent to {to_address}")


def main():
    if not QUEUE_URL or not SENDER_EMAIL:
        raise SystemExit("SQS_QUEUE_URL and AWS_SES_SENDER_EMAIL must be set.")

    print(f"Worker started. Polling {QUEUE_URL}")
    while True:
        try:
            resp = sqs.receive_message(
                QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,  # long poll — cheap and low-latency
            )
            for message in resp.get("Messages", []):
                try:
                    process_message(message)
                    sqs.delete_message(
                        QueueUrl=QUEUE_URL,
                        ReceiptHandle=message["ReceiptHandle"],
                    )
                except Exception as exc:  # keep the batch going; SQS will retry
                    print(f"ERROR processing {message.get('MessageId')}: {exc}")
        except Exception as exc:
            # transient AWS/network failure — back off briefly, keep the pod alive
            print(f"ERROR polling queue: {exc}")
            time.sleep(5)


if __name__ == "__main__":
    main()
