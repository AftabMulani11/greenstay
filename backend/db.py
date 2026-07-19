import os
import re
import uuid
import datetime
import boto3
import argon2
from decimal import Decimal
from dotenv import load_dotenv
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key


load_dotenv()


hasher = argon2.PasswordHasher()


Acc_key = os.getenv("AWS_ACCESS_KEY_ID")
Sec_key = os.getenv("AWS_SECRET_ACCESS_KEY")
region = os.getenv("AWS_REGION_NAME", "eu-west-1")


if not Acc_key or not Sec_key:
    print("WARNING: AWS Credentials not found. DB may fail to initiate")
    dynamodb_res = None
    tbl_NAME = "Greenstay_app"
else:
    dynamodb_res = boto3.resource(
        "dynamodb",
        region_name=region.strip(),
        aws_access_key_id=Acc_key.strip(),
        aws_secret_access_key=Sec_key.strip(),
    )
tbl_NAME = "Greenstay_app"


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


def convert_decimals(obj):
    if isinstance(obj, list):
        out = []
        for pos in obj:
            out.append(convert_decimals(pos))
        return out
    if isinstance(obj, dict):
        newd = {}
        for row, v in obj.items():
            newd[row] = convert_decimals(v)
        return newd

    if isinstance(obj, Decimal):
        try:
            remainder = obj % 1
            if remainder == 0:
                return int(obj)
            else:
                return float(obj)
        except Exception:
            return float(obj)
    return obj


def generate_hotel_id(hotel_name):
    cleaned = re.sub(r"[^A-Za-z]", "", hotel_name.upper())
    parts = hotel_name.strip().split()
    if len(parts) >= 2:
        p1 = re.sub(r"[^A-Za-z]", "", parts[0].upper())[:3]
        p2 = re.sub(r"[^A-Za-z]", "", parts[1].upper())[:3]
        code = p1 + p2
    else:
        code = cleaned[:6]

    return code.ljust(6, "X")


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


def guest_login_verify(guest_name, email, phone_number):
    if not email:
        return {"success": False, "message": "Email is required"}

    matches = get_guest_history_across_all_hotels(email)
    if not matches:
        return {"success": False, "message": "No booking found matching credentials."}

    try:
        matches.sort(key=lambda value: value.get("timestamp", "0"), reverse=True)
    except Exception:
        pass

    latest = matches[0]

    total_visits = 0
    total_co2 = 0.0
    for s in matches:
        total_visits += 1
        try:
            total_co2 += float(s.get("co2", 0))
        except Exception:
            pass

    stats = {
        "total_visits": total_visits,
        "total_co2": total_co2,
        "last_visit_co2": float(latest.get("co2", 0)),
        "history": convert_decimals(matches),
    }

    latest["is_active"] = latest.get("status") == "checked-in"

    return {
        "success": True,
        "message": "Login successful",
        "hotel_id": latest.get("hotel_id"),
        "guest_data": convert_decimals(latest),
        "stats": stats,
    }


def guest_login_verify_by_booking_id(booking_id, guest_name, hotel_name):
    if not booking_id or "-" not in booking_id:
        return {"success": False, "message": "Invalid Booking ID"}
    try:
        hotel_id = booking_id.split("-")[0]
        tbl = get_table()
        if not tbl:
            return {"success": False, "message": "Database error"}

        resp = tbl.get_item(
            Key={"PK": f"HOTEL#{hotel_id}", "SK": f"BOOKING#{booking_id}"}
        )
        if "Item" not in resp:
            return {"success": False, "message": "Booking not found"}

        record = resp["Item"]

        all_stays = get_guest_history_across_all_hotels(record.get("email", ""))
        try:
            all_stays.sort(key=lambda value: value.get("timestamp", "0"), reverse=True)
        except Exception:
            pass

        visits = 0
        co2sum = 0.0
        for s in all_stays:
            visits += 1
            try:
                co2sum += float(s.get("co2", 0))
            except Exception:
                pass

        stats = {
            "total_visits": visits,
            "total_co2": co2sum,
            "last_visit_co2": float(record.get("co2", 0)),
            "history": convert_decimals(all_stays),
        }

        record["is_active"] = record.get("status") == "checked-in"

        return {
            "success": True,
            "message": "Refresh successful",
            "hotel_id": hotel_id,
            "guest_data": convert_decimals(record),
            "stats": stats,
        }

    except Exception as e:
        print("Guest Login Error:", e)
        return {"success": False, "message": "System Error"}
