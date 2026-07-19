from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import db
import io
import csv
from greenstay_x24205427.carbon_calculator import CarbonCalculator
from queue_service import queue_service
import Email_templates as email_templates
from datetime import datetime


app = Flask(__name__)
CORS(app)


@app.route("/api/login", methods=["POST"])
def login():
    try:
        payload = request.json
        if not payload:
            return jsonify({"error": "No data"}), 400

        login_type = payload.get("type")

        if login_type == "hotel":
            hotel_id = payload.get("id")
            pwd = payload.get("password")
            success = db.hotel_login_verify(hotel_id, pwd)
            # return dict from DB and appropriate status
            return jsonify(success), (200 if success.get("success") else 401)

        elif login_type == "customer":
            success = db.guest_login_verify(
                guest_name=payload.get("guest_name"),
                email=payload.get("email"),
                phone_number=payload.get("phone_number"),
            )
            return jsonify(success), (200 if success.get("success") else 401)

        # fallback for unknown login types
        return jsonify({"error": "Invalid login type"}), 400

    except Exception as exc:
        # print for local debugging; in production you'd use logging
        print("login error:", exc)
        return jsonify({"error": "Internal Server Error"}), 500


@app.route("/api/guest-portal/<booking_id>", methods=["GET"])
def get_guest_portal_data(booking_id):
    try:
        # Using the DB helper to validate booking id — it returns a dict with 'success' usually
        check = db.guest_login_verify_by_booking_id(booking_id, "DUMMY", "DUMMY")
        if not check.get("success"):
            return jsonify({"error": check.get("message")}), 404
        return jsonify(check), 200
    except Exception as exc:
        print("guest portal fetch error:", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/hotel-registration", methods=["POST"])
def hotel_registration_route():
    data = request.json
    hotel_name = data.get("hotel_name")
    hotel_email = data.get("hotel_email")
    pwd = data.get("password")

    result = db.hotel_registration(hotel_name, hotel_email, pwd)

    # If registration success and email exists, queue a confirmation email.
    if result.get("success") and hotel_email:
        hotel_id = result.get("hotel_id")
        msg = email_templates.HOTEL_REGISTRATION_BODY.format(
            hotel_name=hotel_name, hotel_id=hotel_id, hotel_email=hotel_email
        )

        queue_service.push_email_job(
            hotel_email, email_templates.HOTEL_REGISTRATION_SUBJECT, msg
        )

    return jsonify(result), (200 if result.get("success") else 400)


@app.route("/api/guests", methods=["POST"])
def handle_guest_entry():
    # This function handles check-in, check-out, and stats update.
    try:
        payload = request.json
        status = payload.get("status")
        hotel_id = payload.get("hotel_id")
        usage = {}
        for key in ["electricity", "water", "laundry", "meals"]:
            usage[key] = payload.get(key, 0)

        # Branch: update stats or checkout path
        if status in ["checked-out", "update-stats"]:
            calc = CarbonCalculator(
                usage["electricity"], usage["water"], usage["meals"], usage["laundry"]
            )
            final_co2 = float(calc.calculate_total_emission())

            co2_saved = max(0.0, 20.0 - final_co2)
            discount = min(13.0, int(co2_saved / 1.5))

            if status == "checked-out":
                guest_record = db.checkout_guest(
                    payload.get("bookingId"), hotel_id, usage, final_co2, discount
                )

                # send email with details if email exists on the guest record
                if guest_record and guest_record.get("email"):
                    # prefer hotel name from DB if available
                    hotel_name_for_email = guest_record.get(
                        "hotelName", "GreenStay Hotel"
                    )

                    checkout_subject = email_templates.GUEST_CHECKOUT_SUBJECT.format(
                        hotel_name=hotel_name_for_email
                    )

                    # Build the email message using data we've got
                    checkout_msg = email_templates.GUEST_CHECKOUT_BODY.format(
                        guest_name=guest_record.get("name"),
                        hotel_name=hotel_name_for_email,
                        booking_id=guest_record.get("bookingId"),
                        elec=usage["electricity"],
                        water=usage["water"],
                        laundry=usage["laundry"],
                        meals=usage["meals"],
                        co2=guest_record.get("co2"),
                        discount=guest_record.get("discount"),
                    )

                    queue_service.push_email_job(
                        guest_record.get("email"), checkout_subject, checkout_msg
                    )

                return jsonify({"status": "Checked out"}), 200
            else:
                # update-stats branch
                db.update_guest_stats(
                    payload.get("bookingId"), hotel_id, usage, final_co2, discount
                )
                return (
                    jsonify(
                        {"status": "Updated", "co2": final_co2, "discount": discount}
                    ),
                    200,
                )

        else:
            guest_email = payload.get("email")
            is_new_user = False
            if guest_email:
                history = db.get_guest_history_across_all_hotels(guest_email)
                # intentionally not using truthiness because history could be None
                if len(history) == 0:
                    is_new_user = True

            # 2) Perform Check-in (delegated to DB layer)
            checkin_result = db.guest_checkin(
                hotel_id=hotel_id,
                email=guest_email,
                name=payload.get("name"),
                phone=payload.get("phone"),
                room=payload.get("room"),
                checkin_date=payload.get("date"),
                checkout_date=payload.get("checkOutDate"),
            )

            if checkin_result.get("success"):
                # Try to send emails if we have a guest email
                if guest_email:
                    current_time_str = datetime.now().strftime("%I:%M %p")

                    # Use the DB's hotelName if available, else fall back to hotel_id
                    hotel_name_for_email = checkin_result.get("hotelName", hotel_id)

                    checkin_subject = email_templates.GUEST_CHECKIN_SUBJECT.format(
                        hotel_name=hotel_name_for_email
                    )
                    checkin_msg = email_templates.GUEST_CHECKIN_BODY.format(
                        guest_name=payload.get("name"),
                        hotel_name=hotel_name_for_email,
                        room_number=payload.get("room"),
                        booking_id=checkin_result["bookingId"],
                        checkin_time=current_time_str,
                    )
                    queue_service.push_email_job(
                        guest_email, checkin_subject, checkin_msg
                    )

                    # send welcome if first time user
                    if is_new_user:
                        welcome_subject = email_templates.NEW_GUEST_WELCOME_SUBJECT
                        welcome_msg = email_templates.NEW_GUEST_WELCOME_BODY.format(
                            guest_name=payload.get("name")
                        )
                        queue_service.push_email_job(
                            guest_email, welcome_subject, welcome_msg
                        )

                return jsonify(checkin_result), 200

            # If DB failed to create checkin, return server error (DB should return message)
            return jsonify(checkin_result), 500

    except Exception as exc:
        # I usually put the variable in the log so I can grep logs later
        print("handle_guest_entry error:", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/guests/<hotel_id>", methods=["GET"])
def get_guests(hotel_id):
    items = db.get_all_guests(hotel_id)

    # sort: checked-in first, then by timestamp — verbose style for clarity
    def sort_key(x):
        # note: != gives True/False; True sorts after False
        primary = x.get("status") != "checked-in"
        secondary = x.get("timestamp", "")
        return (primary, secondary)

    items.sort(key=sort_key)
    # convert decimals like DynamoDB Decimal -> native types
    converted = db.convert_decimals(items)
    return jsonify(converted), 200


@app.route("/calculate", methods=["POST"])
def calculate():
    payload = request.json or {}
    # small quirk: using intermediate variables (humanness)
    elec = payload.get("electricity", 0)
    water = payload.get("water", 0)
    meals = payload.get("meals", 0)
    laundry = payload.get("laundry", 0)

    calc = CarbonCalculator(elec, water, meals, laundry)
    co2_val = calc.calculate_total_emission()
    # coerce to float or str depending on what DB expects — keep original behavior
    return jsonify({"CO2_kg": co2_val}), 200


@app.route("/api/download/hotel/<hotel_id>", methods=["GET"])
def download_hotel_data(hotel_id):
    all_guests = db.get_all_guests(hotel_id)
    if not all_guests:
        return jsonify({"error": "No data"}), 404

    data = db.convert_decimals(all_guests)

    def generate():
        # Using StringIO buffer and flushing it per-row
        output = io.StringIO()
        writer = csv.writer(output)
        # Header row
        writer.writerow(
            ["Booking ID", "Name", "Email", "Room", "Status", "Check In", "CO2 (kg)"]
        )
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Write rows — deliberately not using list comprehensions to keep it 'human'
        for row in data:
            # small redundancy: local vars for clarity
            bid = row.get("bookingId")
            name = row.get("name")
            email = row.get("email")
            room = row.get("room")
            status = row.get("status")
            date = row.get("date")
            co2 = row.get("co2")
            writer.writerow([bid, name, email, room, status, date, co2])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    headers = {"Content-Disposition": f"attachment;filename={hotel_id}_data.csv"}
    return Response(
        stream_with_context(generate()), mimetype="text/csv", headers=headers
    )


@app.route("/api/download/guest", methods=["POST"])
def download_guest_data():
    payload = request.json or {}
    email = payload.get("email")
    if not email:
        return jsonify({"error": "Email required"}), 400

    history = db.get_guest_history_across_all_hotels(email)
    if not history:
        return jsonify({"error": "No history"}), 404

    data = db.convert_decimals(history)

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Hotel", "Date", "CO2 (kg)", "Electricity", "Water"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Again, explicit loop for readability
        for row in data:
            hotel_name = row.get("hotelName")
            date = row.get("date")
            co2 = row.get("co2")
            electricity = row.get("electricity")
            water = row.get("water")
            writer.writerow([hotel_name, date, co2, electricity, water])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    # I sometimes prefer a more descriptive filename; kept simple here
    headers = {"Content-Disposition": "attachment;filename=my_history.csv"}
    return Response(
        stream_with_context(generate()), mimetype="text/csv", headers=headers
    )


if __name__ == "__main__":
    app.run(debug=True)
