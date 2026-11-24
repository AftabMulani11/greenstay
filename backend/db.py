import logging
import os

from dotenv import load_dotenv

from db_common import convert_decimals


load_dotenv()
logger = logging.getLogger(__name__)

driver = os.getenv("DB_BACKEND", "dynamodb").strip().lower()
if driver == "postgres":
    import db_postgres as storage
elif driver == "dynamodb":
    import db_dynamodb as storage
else:
    raise ValueError("DB_BACKEND must be postgres or dynamodb")


def initialize():
    if driver == "postgres":
        storage.initialize()


hotel_registration = storage.hotel_registration
hotel_login_verify = storage.hotel_login_verify
guest_checkin = storage.guest_checkin
update_guest_stats = storage.update_guest_stats
checkout_guest = storage.checkout_guest
get_all_guests = storage.get_all_guests
get_guest_history_across_all_hotels = storage.get_guest_history_across_all_hotels


def order_guest_history(stays):
    return sorted(stays, key=lambda stay: str(stay.get("timestamp") or ""), reverse=True)


def guest_co2(stay):
    try:
        return float(stay.get("co2", 0))
    except (TypeError, ValueError):
        return 0.0


def guest_summary(record, history, message):
    return {
        "success": True,
        "message": message,
        "hotel_id": record.get("hotel_id"),
        "guest_data": convert_decimals({
            **record, "is_active": record.get("status") == "checked-in"
        }),
        "stats": {
            "total_visits": len(history),
            "total_co2": sum((guest_co2(stay) for stay in history), 0.0),
            "last_visit_co2": guest_co2(record),
            "history": convert_decimals(history),
        },
    }


def guest_history(email, hotel_id=None):
    if hotel_id is None:
        return get_guest_history_across_all_hotels(email)
    return [stay for stay in get_all_guests(hotel_id) if stay.get("email") == email]


def guest_login_verify(email, hotel_id=None):
    if not email:
        return {"success": False, "message": "Email is required"}

    history = order_guest_history(guest_history(email, hotel_id))
    if not history:
        return {"success": False, "message": "No booking found matching credentials."}

    return guest_summary(history[0], history, "Login successful")


def get_guest_portal(booking_id, scoped_hotel_id=None):
    if not booking_id or "-" not in booking_id:
        return {"success": False, "message": "Invalid Booking ID"}

    try:
        hotel_id = booking_id.split("-", 1)[0]
        if scoped_hotel_id is not None and hotel_id != scoped_hotel_id:
            return {"success": False, "message": "Booking not found"}
        record = storage.get_booking(hotel_id, booking_id)
        if record is None:
            return {"success": False, "message": "Booking not found"}

        history = order_guest_history(guest_history(record.get("email", ""), scoped_hotel_id))
        return guest_summary({**record, "hotel_id": hotel_id}, history, "Refresh successful")
    except Exception:
        logger.exception("Booking lookup failed")
        return {"success": False, "message": "System Error"}
