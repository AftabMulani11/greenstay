import boto3
import json
import os
from dotenv import load_dotenv

load_dotenv()


class QueueService:
    def __init__(self):
        """
        Initializes the QueueService with AWS SQS credentials.
        """
        # Setting up SQS
        region_name = os.getenv("AWS_REGION_NAME", "eu-west-1")
        access_key = os.getenv("AWS_ACCESS_KEY_ID")
        secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

        # I sometimes mix up whether the queue url is the ARN or URL... leaving a reminder here.
        self.queue_url = os.getenv("SQS_QUEUE_URL")

        try:
            # Creating the SQS client
            self.sqs_client = boto3.client(
                "sqs",
                region_name=region_name,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
            )
        except Exception as e:
            print(f"Failed to initialize SQS client: {e}")
            self.sqs_client = None

    def push_email_job(self, receiver_email, mail_subject, message_body):
        """
        Sends an email job into SQS.
        """
        # Safety check if client failed to init
        if not getattr(self, "sqs_client", None) or not self.queue_url:
            print("Configuration issue: SQS client not ready or missing SQS_QUEUE_URL.")
            return False

        payload_dict = {
            "to_address": receiver_email,
            "subject": mail_subject,
            "body": message_body,
        }

        stringified_payload = json.dumps(payload_dict)

        try:
            resp = self.sqs_client.send_message(
                QueueUrl=self.queue_url, MessageBody=stringified_payload
            )

            print("Raw SQS response:", resp)
            print(f"[SQS] Queued email job for {receiver_email}")
            return True

        except Exception as err:
            print(f"[SQS] Couldn't push message to queue: {err}")
            return False


# Instantiate the service
queue_service = QueueService()
