import os
import boto3
from dotenv import load_dotenv

# Load environment variables once at the module level
load_dotenv()


class EmailService:
    def __init__(self):
        """
        Initializes the EmailService with AWS SES credentials.
        """
        # Grabbing AWS credentials from env
        self._aws_key = os.getenv("AWS_ACCESS_KEY_ID")
        self._aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
        self._aws_region = os.getenv("AWS_REGION_NAME")
        self._from_email = os.getenv("AWS_SES_SENDER_EMAIL")

        self.ses_client = None

        # Check for credentials before attempting to create client
        if not self._aws_key or not self._aws_secret:
            print("Heads up: Missing AWS creds. SES client won't be ready.")
        else:
            try:
                self.ses_client = boto3.client(
                    "ses",
                    region_name=self._aws_region,
                    aws_access_key_id=self._aws_key,
                    aws_secret_access_key=self._aws_secret,
                )
            except Exception as e:
                print(f"Failed to initialize boto3 client: {e}")

    def send_email(self, recipient_addr, subject_line, msg_body):
        """
        Sends an email via AWS SES.
        """
        # Quick sanity check
        if not self.ses_client or not self._from_email:
            print("Oops: SES client not initialized or sender email missing.")
            return False

        final_message_body = msg_body

        try:
            send_resp = self.ses_client.send_email(
                Source=self._from_email,
                Destination={"ToAddresses": [recipient_addr]},
                Message={
                    "Subject": {"Data": subject_line, "Charset": "UTF-8"},
                    "Body": {"Text": {"Data": final_message_body, "Charset": "UTF-8"}},
                },
            )

            print("Email dispatch attempt:", send_resp)
            print(f"Email successfully sent to {recipient_addr}!")
            return True

        except Exception as err:
            print(f"Had an issue sending email via SES: {err}")
            return False
