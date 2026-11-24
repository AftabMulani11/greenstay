import os
import uuid
import datetime
import boto3
from decimal import Decimal
from db_common import generate_hotel_id, hasher
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key


Acc_key = os.getenv("AWS_ACCESS_KEY_ID")
Sec_key = os.getenv("AWS_SECRET_ACCESS_KEY")
region = os.getenv("AWS_REGION_NAME", "eu-west-1")
tbl_NAME = "Greenstay_app"


if not Acc_key or not Sec_key:
    print("WARNING: AWS Credentials not found. DB may fail to initiate")
    dynamodb_res = None
else:
    dynamodb_res = boto3.resource(
        "dynamodb",
        region_name=region.strip(),
        aws_access_key_id=Acc_key.strip(),
        aws_secret_access_key=Sec_key.strip(),
    )


def get_table(tbl_name=tbl_NAME):
    if not dynamodb_res:
        return None
    tbl = dynamodb_res.Table(tbl_name)

    try:
        tbl.load()
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            print(f"Creating table {tbl_NAME} because it wasn't there...")
            try:
                tbl = dynamodb_res.create_table(
                    TableName=tbl_NAME,
                    KeySchema=[
                        {"AttributeName": "PK", "KeyType": "HASH"},
                        {"AttributeName": "SK", "KeyType": "RANGE"},
                    ],
                    AttributeDefinitions=[
                        {"AttributeName": "PK", "AttributeType": "S"},
                        {"AttributeName": "SK", "AttributeType": "S"},
                        {"AttributeName": "email", "AttributeType": "S"},
                        {"AttributeName": "timestamp", "AttributeType": "S"},
                    ],
                    GlobalSecondaryIndexes=[
                        {
                            "IndexName": "GSI_Email",
                            "KeySchema": [
                                {"AttributeName": "email", "KeyType": "HASH"},
                                {"AttributeName": "timestamp", "KeyType": "RANGE"},
                            ],
                            "Projection": {"ProjectionType": "ALL"},
                        }
                    ],
                    BillingMode="PAY_PER_REQUEST",
                )
                tbl.meta.client.get_waiter("table_exists").wait(TableName=tbl_NAME)
                print("Table created.")
            except Exception as e2:
                print("Failed to create table:", e2)
                return None
        else:
            print("DynamoDB load error:", err)
            return None

    return tbl


def hotel_registration(hotel_name, hotel_email, password):
    tbl = get_table()
    if not tbl:
        return {"error": "Database error"}

    base = generate_hotel_id(hotel_name)
    hid = base
    for attempt in range(5):
        resp = tbl.get_item(Key={"PK": f"HOTEL#{base}", "SK": "METADATA"})
        if "Item" not in resp:
            break
        else:
            suf = str(uuid.uuid4())[:2].upper()
            hid = f"{base[:4]}{suf}"

    hashed_pw = hasher.hash(password)

    item = {
        "PK": f"HOTEL#{hid}",
        "SK": "METADATA",
        "hotel_id": hid,
        "hotel_name": hotel_name,
        "hotel_email": hotel_email,
        "password": hashed_pw,
        "booking_sequence": 1000,
        "type": "HOTEL",
    }

    try:
        tbl.put_item(Item=item)
        return {"success": True, "status": "Hotel registered", "hotel_id": hid}
    except Exception as e:
        print("Registration Error:", e)
        return {"success": False, "status": str(e)}


def hotel_login_verify(hotel_id, password):
    tbl = get_table()
    if not tbl:
        return {"error": "Database error"}

    try:
        resp = tbl.get_item(Key={"PK": f"HOTEL#{hotel_id}", "SK": "METADATA"})
    except Exception as e:
        print("Dynamo read failed:", e)
        return {"status": "Database read error", "success": False}

    if "Item" not in resp:
        return {"status": "Hotel ID not found", "success": False}

    item = resp["Item"]
    try:
        if hasher.verify(item["password"], password):
            return {
                "success": True,
                "status": "Login successful",
                "hotel_name": item.get("hotel_name"),
                "hotel_id": item.get("hotel_id"),
            }
    except Exception:
        pass

    return {"status": "Invalid password", "success": False}


def get_next_booking_id(hotel_id):
    tbl = get_table()
    if not tbl:
        return None
    try:
        resp = tbl.update_item(
            Key={"PK": f"HOTEL#{hotel_id}", "SK": "METADATA"},
            UpdateExpression="set booking_sequence = booking_sequence + :input",
            ExpressionAttributeValues={":input": 1},
            ReturnValues="UPDATED_NEW",
        )
        attrs = resp.get("Attributes", {})
        seq = int(attrs.get("booking_sequence", 0))
        booking_id = f"{hotel_id}-{seq}"
        return booking_id
    except Exception as e:
        print("Sequence Error:", e)
        return None


def guest_checkin(hotel_id, email, name, phone, room, checkin_date, checkout_date):
    tbl = get_table()
    if not tbl:
        return {"error": "Table error"}

    booking_id = get_next_booking_id(hotel_id)
    if not booking_id:
        return {"error": "Could not generate Booking ID"}

    try:
        hresp = tbl.get_item(Key={"PK": f"HOTEL#{hotel_id}", "SK": "METADATA"})
        hotel_name = hresp.get("Item", {}).get("hotel_name", "Unknown Hotel")
    except Exception as e:
        print("Could not fetch hotel metadata:", e)
        hotel_name = "Unknown Hotel"

    normalized_email = email.strip().lower() if email else ""

    item = {
        "PK": f"HOTEL#{hotel_id}",
        "SK": f"BOOKING#{booking_id}",
        "bookingId": booking_id,
        "hotel_id": hotel_id,
        "hotelName": hotel_name,
        "name": name,
        "email": normalized_email,
        "phone": phone,
        "room": room,
        "status": "checked-in",
        "date": checkin_date,
        "checkOutDate": checkout_date,
        "electricity": Decimal("0"),
        "water": Decimal("0"),
        "laundry": Decimal("0"),
        "meals": Decimal("0"),
        "co2": Decimal("0"),
        "discount": Decimal("0"),
        "timestamp": datetime.datetime.now().isoformat(),
        "type": "BOOKING",
    }

    try:
        tbl.put_item(Item=item)
        return {"success": True, "bookingId": booking_id, "hotelName": hotel_name}
    except Exception as e:
        print("Checkin Error:", e)
        return {"error": str(e)}


def update_guest_stats(booking_id, hotel_id, usage_data, co2, discount):
    tbl = get_table()
    if not tbl:
        return False

    try:
        e_val = Decimal(str(usage_data.get("electricity", 0)))
        w_val = Decimal(str(usage_data.get("water", 0)))
        l_val = Decimal(str(usage_data.get("laundry", 0)))
        m_val = Decimal(str(usage_data.get("meals", 0)))
        c_val = Decimal(str(co2))
        d_val = Decimal(str(discount))

        tbl.update_item(
            Key={"PK": f"HOTEL#{hotel_id}", "SK": f"BOOKING#{booking_id}"},
            UpdateExpression="set electricity=:e, water=:w, laundry=:l, meals=:highest, co2=:c, discount=:d",
            ExpressionAttributeValues={
                ":e": e_val,
                ":w": w_val,
                ":l": l_val,
                ":highest": m_val,
                ":c": c_val,
                ":d": d_val,
            },
        )
        return True
    except Exception as e:
        print("Update Stats Error:", e)
        return False


def checkout_guest(booking_id, hotel_id, usage_data, co2, discount):
    tbl = get_table()
    if not tbl:
        return None

    try:
        e_val = Decimal(str(usage_data.get("electricity", 0)))
        w_val = Decimal(str(usage_data.get("water", 0)))
        l_val = Decimal(str(usage_data.get("laundry", 0)))
        m_val = Decimal(str(usage_data.get("meals", 0)))
        c_val = Decimal(str(co2))
        d_val = Decimal(str(discount))
        actual_out = datetime.datetime.now().isoformat()

        resp = tbl.update_item(
            Key={"PK": f"HOTEL#{hotel_id}", "SK": f"BOOKING#{booking_id}"},
            UpdateExpression="set #status=:status, electricity=:e, water=:w, laundry=:l, meals=:highest, co2=:c, discount=:d, actual_checkout=:ad",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": "checked-out",
                ":e": e_val,
                ":w": w_val,
                ":l": l_val,
                ":highest": m_val,
                ":c": c_val,
                ":d": d_val,
                ":ad": actual_out,
            },
            ReturnValues="ALL_NEW",
        )
        return resp.get("Attributes")
    except Exception as e:
        print("Checkout Error:", e)
        return None


def get_all_guests(hotel_id):
    tbl = get_table()
    if not tbl:
        return []
    try:
        response = tbl.query(
            KeyConditionExpression=Key("PK").eq(f"HOTEL#{hotel_id}")
            & Key("SK").begins_with("BOOKING#")
        )
        return response.get("Items", [])
    except Exception as e:
        print("Fetch Guests Error:", e)
        return []


def get_guest_history_across_all_hotels(email):
    tbl = get_table()
    if not tbl or not email:
        return []

    norm = email.strip().lower()

    try:
        answer = tbl.query(
            IndexName="GSI_Email", KeyConditionExpression=Key("email").eq(norm)
        )
        return answer.get("Items", [])
    except Exception as e:
        print("GSI Query Error:", e)
        return []


def get_booking(hotel_id, booking_id):
    table = get_table()
    if table is None:
        raise RuntimeError("Database unavailable")
    return table.get_item(
        Key={"PK": f"HOTEL#{hotel_id}", "SK": f"BOOKING#{booking_id}"}
    ).get("Item")
