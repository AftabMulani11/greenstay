import json
import boto3
import os

# Initialize SES client (pulls credentials from Lambda Execution Role automatically)
ses = boto3.client("ses", region_name=os.environ.get("AWS_REGION", "eu-west-1"))
SENDER_EMAIL = os.environ.get("SENDER_EMAIL")


def lambda_handler(event, context):
    """
    AWS Lambda handler function.
    Triggered by SQS Event.
    """
    if not SENDER_EMAIL:
        print("CRITICAL: SENDER_EMAIL environment variable not set.")
        return {"statusCode": 500, "body": "Configuration Error"}

    print(f"Received batch of {len(event['Records'])} messages.")

    for record in event["Records"]:
        try:
            # 1. Parse the SQS message body
            payload = json.loads(record["body"])

            to_address = payload.get("to_address")
            subject = payload.get("subject")
            body_text = payload.get("body")

            if not to_address or not body_text:
                print("Skipping invalid message payload.")
                continue

            print(f"Sending email to: {to_address}")

            # 2. Send Email via SES
            ses.send_email(
                Source=SENDER_EMAIL,
                Destination={"ToAddresses": [to_address]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
                },
            )
            print(f"SUCCESS: Email sent to {to_address}")

        except Exception as e:
            # Log error but don't crash the whole batch
            print(f"ERROR processing message {record['messageId']}: {str(e)}")
            # Optional: Raise exception to trigger SQS Retry for this specific batch
            # raise e

    return {"statusCode": 200, "body": json.dumps("Batch processing complete")}
