import json
import logging
import os
import smtplib
from email.message import EmailMessage
from functools import cached_property

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv


load_dotenv()
logger = logging.getLogger(__name__)


class QueueService:
    def __init__(self):
        self.transport = os.getenv("EMAIL_TRANSPORT", "sqs").strip().lower()
        if self.transport not in {"sns", "sqs", "smtp"}:
            raise ValueError("EMAIL_TRANSPORT must be sns, sqs, or smtp")

    @cached_property
    def aws_client(self):
        region = os.getenv("AWS_REGION_NAME") or os.getenv("AWS_REGION") or "us-east-1"
        return boto3.client(self.transport, region_name=region)

    def push_email_job(self, receiver_email, mail_subject, message_body):
        payload = {
            "to_address": receiver_email,
            "subject": mail_subject,
            "body": message_body,
        }
        try:
            if self.transport == "smtp":
                self.send_smtp(payload)
            else:
                self.publish(json.dumps(payload))
        except (BotoCoreError, ClientError, KeyError, OSError, ValueError):
            logger.exception("Email delivery via %s failed", self.transport)
            return False
        return True

    def publish(self, message):
        if self.transport == "sns":
            topic = os.environ["SNS_TOPIC_ARN"]
            self.aws_client.publish(TopicArn=topic, Message=message)
        else:
            queue_url = os.environ["SQS_QUEUE_URL"]
            self.aws_client.send_message(QueueUrl=queue_url, MessageBody=message)

    def send_smtp(self, payload):
        message = EmailMessage()
        message["From"] = os.getenv("SMTP_FROM", "greenstay@example.test")
        message["To"] = payload["to_address"]
        message["Subject"] = payload["subject"]
        message.set_content(payload["body"])
        host = os.getenv("SMTP_HOST", "localhost")
        port = int(os.getenv("SMTP_PORT", "1025"))
        with smtplib.SMTP(host, port, timeout=5) as client:
            client.send_message(message)


queue_service = QueueService()
