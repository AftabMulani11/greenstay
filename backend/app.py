import csv
import hmac
import io
import os
from datetime import datetime

from flask import Flask, Response, jsonify, request, session, stream_with_context
from flask_cors import CORS
from greenstay_x24205427.carbon_calculator import CarbonCalculator

import Email_templates as email_templates
import db
from queue_service import queue_service


db.initialize()
app = Flask(__name__)
CORS(app)
origin_token = os.getenv("CLOUDFRONT_ORIGIN_TOKEN")
session_key = os.getenv("SESSION_SIGNING_KEY")
if origin_token and not session_key:
    raise RuntimeError("SESSION_SIGNING_KEY is required for hosted deployments")
if session_key:
    app.config.update(
        SECRET_KEY=session_key,
        SESSION_COOKIE_NAME="greenstay_session",
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )


def session_hotel_id():
    return session.get("hotel_id", "") if session_key else None


def hotel_access_error(hotel_id):
    if session_key and not session_hotel_id():
        return jsonify({"error": "Sign in to your hotel first."}), 401
    if session_key and session_hotel_id() != hotel_id:
        return jsonify({"error": "Hotel not found."}), 404


@app.before_request
def check_origin():
    if origin_token and request.path != "/healthz":
        supplied = request.headers.get("X-GreenStay-Origin", "")
        if not hmac.compare_digest(supplied.encode(), origin_token.encode()):
            return jsonify({"error": "Forbidden"}), 403


@app.route("/healthz", methods=["GET"])
@app.route("/api/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"}), 200


@app.route("/api/login", methods=["POST"])
def login():
    try:
        payload = request.json
        if not payload:
            return jsonify({"error": "No data"}), 400

        login_type = payload.get("type")
        if login_type == "hotel":
            result = db.hotel_login_verify(payload.get("id"), payload.get("password"))
            if session_key:
                session.clear()
                if result.get("success"):
                    session["hotel_id"] = result["hotel_id"]
        elif login_type == "customer":
            result = db.guest_login_verify(payload.get("email"), session_hotel_id())
        else:
            return jsonify({"error": "Invalid login type"}), 400
        return jsonify(result), (200 if result.get("success") else 401)
    except Exception:
        app.logger.exception("Login failed")
        return jsonify({"error": "Internal Server Error"}), 500


@app.route("/api/logout", methods=["POST"])
def logout():
    if session_key:
        session.clear()
    return jsonify({"success": True}), 200


@app.route("/api/guest-portal/<booking_id>", methods=["GET"])
def get_guest_portal_data(booking_id):
    try:
        result = db.get_guest_portal(booking_id, session_hotel_id())
        if not result.get("success"):
            return jsonify({"error": result.get("message")}), 404
        return jsonify(result), 200
    except Exception as exc:
        app.logger.exception("Guest portal lookup failed")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/hotel-registration", methods=["POST"])
def hotel_registration_route():
    data = request.json
    hotel_name = data.get("hotel_name")
    hotel_email = data.get("hotel_email")
    password = data.get("password")
    result = db.hotel_registration(hotel_name, hotel_email, password)

    if result.get("success") and hotel_email:
        message = email_templates.HOTEL_REGISTRATION_BODY.format(
            hotel_name=hotel_name, hotel_id=result.get("hotel_id"), hotel_email=hotel_email
        )
        queue_service.push_email_job(
            hotel_email, email_templates.HOTEL_REGISTRATION_SUBJECT, message
        )
    return jsonify(result), (200 if result.get("success") else 400)


def check_in_guest(payload):
    hotel_id = payload.get("hotel_id")
    email = payload.get("email")
    first_stay = email and not db.guest_history(email, session_hotel_id())
    result = db.guest_checkin(
        hotel_id=hotel_id,
        email=email,
        name=payload.get("name"),
        phone=payload.get("phone"),
        room=payload.get("room"),
        checkin_date=payload.get("date"),
        checkout_date=payload.get("checkOutDate"),
    )
    if result.get("success") and email:
        hotel_name = result.get("hotelName", hotel_id)
        subject = email_templates.GUEST_CHECKIN_SUBJECT.format(hotel_name=hotel_name)
        message = email_templates.GUEST_CHECKIN_BODY.format(
            guest_name=payload.get("name"),
            hotel_name=hotel_name,
            room_number=payload.get("room"),
            booking_id=result["bookingId"],
            checkin_time=datetime.now().strftime("%I:%M %p"),
        )
        queue_service.push_email_job(email, subject, message)

        if first_stay:
            welcome = email_templates.NEW_GUEST_WELCOME_BODY.format(guest_name=payload.get("name"))
            queue_service.push_email_job(email, email_templates.NEW_GUEST_WELCOME_SUBJECT, welcome)
    return result


def send_checkout_email(guest, usage):
    if not guest or not guest.get("email"):
        return
    hotel_name = guest.get("hotelName", "GreenStay Hotel")
    subject = email_templates.GUEST_CHECKOUT_SUBJECT.format(hotel_name=hotel_name)
    message = email_templates.GUEST_CHECKOUT_BODY.format(
        guest_name=guest.get("name"),
        hotel_name=hotel_name,
        booking_id=guest.get("bookingId"),
        elec=usage["electricity"],
        water=usage["water"],
        laundry=usage["laundry"],
        meals=usage["meals"],
        co2=guest.get("co2"),
        discount=guest.get("discount"),
    )
    queue_service.push_email_job(guest["email"], subject, message)


@app.route("/api/guests", methods=["POST"])
def handle_guest_entry():
    try:
        payload = request.json
        hotel_id = payload.get("hotel_id")
        if error := hotel_access_error(hotel_id):
            return error
        status = payload.get("status")
        if status not in ("checked-out", "update-stats"):
            result = check_in_guest(payload)
            return jsonify(result), (200 if result.get("success") else 500)

        booking_id = payload.get("bookingId")
        usage = {key: payload.get(key, 0) for key in ("electricity", "water", "laundry", "meals")}
        calculator = CarbonCalculator(
            usage["electricity"], usage["water"], usage["laundry"], usage["meals"]
        )
        co2 = float(calculator.calculate_total_emission())
        discount = min(13.0, int(max(0.0, 20.0 - co2) / 1.5))

        if status == "checked-out":
            guest = db.checkout_guest(booking_id, hotel_id, usage, co2, discount)
            if session_key and not guest:
                return jsonify({"error": "Active booking not found."}), 404
            send_checkout_email(guest, usage)
            return jsonify({"status": "Checked out"}), 200

        updated = db.update_guest_stats(booking_id, hotel_id, usage, co2, discount)
        if session_key and updated is False:
            return jsonify({"error": "Booking not found."}), 404
        return jsonify({"status": "Updated", "co2": co2, "discount": discount}), 200
    except Exception as exc:
        app.logger.exception("Guest entry failed")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/guests/<hotel_id>", methods=["GET"])
def get_guests(hotel_id):
    if error := hotel_access_error(hotel_id):
        return error
    items = db.get_all_guests(hotel_id)
    items.sort(key=lambda item: (item.get("status") != "checked-in", item.get("timestamp", "")))
    return jsonify(db.convert_decimals(items)), 200


@app.route("/calculate", methods=["POST"])
def calculate():
    usage = request.json or {}
    calculator = CarbonCalculator(
        usage.get("electricity", 0),
        usage.get("water", 0),
        usage.get("meals", 0),
        usage.get("laundry", 0),
    )
    return jsonify({"CO2_kg": calculator.calculate_total_emission()}), 200


def csv_response(records, columns, filename):
    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([label for label, _ in columns])
        yield output.getvalue()

        for record in records:
            output.seek(0)
            output.truncate(0)
            writer.writerow([record.get(key) for _, key in columns])
            yield output.getvalue()

    return Response(
        stream_with_context(generate()),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"},
    )


@app.route("/api/download/hotel/<hotel_id>", methods=["GET"])
def download_hotel_data(hotel_id):
    if error := hotel_access_error(hotel_id):
        return error
    guests = db.get_all_guests(hotel_id)
    if not guests:
        return jsonify({"error": "No data"}), 404

    columns = (
        ("Booking ID", "bookingId"), ("Name", "name"), ("Email", "email"),
        ("Room", "room"), ("Status", "status"), ("Check In", "date"), ("CO2 (kg)", "co2"),
    )
    return csv_response(db.convert_decimals(guests), columns, f"{hotel_id}_data.csv")


@app.route("/api/download/guest", methods=["POST"])
def download_guest_data():
    email = (request.json or {}).get("email")
    if not email:
        return jsonify({"error": "Email required"}), 400
    history = db.guest_history(email, session_hotel_id())
    if not history:
        return jsonify({"error": "No history"}), 404

    columns = (
        ("Hotel", "hotelName"), ("Date", "date"), ("CO2 (kg)", "co2"),
        ("Electricity", "electricity"), ("Water", "water"),
    )
    return csv_response(db.convert_decimals(history), columns, "my_history.csv")


if __name__ == "__main__":
    app.run(debug=True)
