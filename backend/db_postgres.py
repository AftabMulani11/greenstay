import logging
import os
import uuid
from contextlib import closing, contextmanager
from decimal import Decimal

import psycopg2
from argon2.exceptions import VerificationError
from psycopg2.extras import RealDictCursor

from db_common import generate_hotel_id, hasher


logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS hotels (
    hotel_id text PRIMARY KEY,
    name text NOT NULL,
    email text,
    password_hash text NOT NULL,
    booking_sequence bigint NOT NULL DEFAULT 1000
);
CREATE TABLE IF NOT EXISTS guests (
    guest_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email text UNIQUE
);
CREATE TABLE IF NOT EXISTS bookings (
    booking_id text PRIMARY KEY,
    hotel_id text NOT NULL REFERENCES hotels (hotel_id),
    guest_id bigint NOT NULL REFERENCES guests (guest_id),
    guest_name text,
    phone text,
    room text,
    check_in_date text,
    check_out_date text,
    status text NOT NULL DEFAULT 'checked-in',
    electricity numeric NOT NULL DEFAULT 0,
    water numeric NOT NULL DEFAULT 0,
    laundry numeric NOT NULL DEFAULT 0,
    meals numeric NOT NULL DEFAULT 0,
    co2 numeric NOT NULL DEFAULT 0,
    discount numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actual_checkout timestamptz
);
CREATE INDEX IF NOT EXISTS bookings_hotel_idx ON bookings (hotel_id, created_at);
CREATE INDEX IF NOT EXISTS bookings_guest_idx ON bookings (guest_id, created_at);
"""

BOOKINGS = """
SELECT b.booking_id AS "bookingId", b.hotel_id, h.name AS "hotelName",
       b.guest_name AS name, coalesce(g.email, '') AS email, b.phone, b.room,
       b.check_in_date AS date, b.check_out_date AS "checkOutDate", b.status,
       b.electricity, b.water, b.laundry, b.meals, b.co2, b.discount,
       b.created_at AS timestamp, b.actual_checkout
FROM bookings b
JOIN hotels h USING (hotel_id)
JOIN guests g USING (guest_id)
"""


@contextmanager
def transaction():
    dsn = os.getenv("DATABASE_URL")
    if not dsn and not os.getenv("PGHOST"):
        raise ValueError("DATABASE_URL or PGHOST is required for PostgreSQL")
    with closing(psycopg2.connect(dsn, connect_timeout=5)) as connection:
        with connection, connection.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor


def initialize():
    with transaction() as cursor:
        # Gunicorn workers can initialize the schema concurrently.
        cursor.execute("SELECT pg_advisory_xact_lock(72123816)")
        cursor.execute(SCHEMA)


def hotel_registration(hotel_name, hotel_email, password):
    if not isinstance(hotel_name, str) or not hotel_name.strip() or not password:
        return {"success": False, "status": "Hotel name and password are required"}

    base = generate_hotel_id(hotel_name)
    candidate = base
    password_hash = hasher.hash(password)
    try:
        with transaction() as cursor:
            for _ in range(5):
                cursor.execute(
                    """
                    INSERT INTO hotels (hotel_id, name, email, password_hash)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (hotel_id) DO NOTHING
                    RETURNING hotel_id
                    """,
                    (candidate, hotel_name, hotel_email, password_hash),
                )
                if cursor.fetchone():
                    return {
                        "success": True,
                        "status": "Hotel registered",
                        "hotel_id": candidate,
                    }
                candidate = f"{base[:4]}{uuid.uuid4().hex[:2].upper()}"
    except psycopg2.Error:
        logger.exception("Hotel registration failed")
        return {"success": False, "status": "Database error"}
    return {"success": False, "status": "Could not allocate a hotel ID"}


def hotel_login_verify(hotel_id, password):
    with transaction() as cursor:
        cursor.execute(
            "SELECT name, password_hash FROM hotels WHERE hotel_id = %s",
            (hotel_id,),
        )
        hotel = cursor.fetchone()
    if not hotel:
        return {"success": False, "status": "Hotel ID not found"}
    if not isinstance(password, str):
        return {"success": False, "status": "Invalid password"}
    try:
        hasher.verify(hotel["password_hash"], password)
    except VerificationError:
        return {"success": False, "status": "Invalid password"}
    return {
        "success": True,
        "status": "Login successful",
        "hotel_name": hotel["name"],
        "hotel_id": hotel_id,
    }


def guest_checkin(hotel_id, email, name, phone, room, checkin_date, checkout_date):
    email = (email.strip().lower() or None) if email else None
    with transaction() as cursor:
        cursor.execute(
            """
            UPDATE hotels SET booking_sequence = booking_sequence + 1
            WHERE hotel_id = %s
            RETURNING name, booking_sequence
            """,
            (hotel_id,),
        )
        hotel = cursor.fetchone()
        if not hotel:
            return {"error": "Could not generate Booking ID"}
        booking_id = f"{hotel_id}-{hotel['booking_sequence']}"
        cursor.execute(
            """
            INSERT INTO guests (email) VALUES (%s)
            ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
            RETURNING guest_id
            """,
            (email,),
        )
        guest_id = cursor.fetchone()["guest_id"]
        cursor.execute(
            """
            INSERT INTO bookings (
                booking_id, hotel_id, guest_id, guest_name, phone, room,
                check_in_date, check_out_date
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (booking_id, hotel_id, guest_id, name, phone, room, checkin_date, checkout_date),
        )
    return {"success": True, "bookingId": booking_id, "hotelName": hotel["name"]}


def update_booking(cursor, hotel_id, booking_id, usage_data, co2, discount, checkout):
    values = [
        Decimal(str(usage_data.get(key, 0)))
        for key in ("electricity", "water", "laundry", "meals")
    ]
    cursor.execute(
        """
        UPDATE bookings
        SET electricity = %s, water = %s, laundry = %s, meals = %s, co2 = %s, discount = %s,
            status = CASE WHEN %s THEN 'checked-out' ELSE status END,
            actual_checkout = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE actual_checkout END
        WHERE hotel_id = %s AND booking_id = %s AND (NOT %s OR status = 'checked-in')
        """,
        (
            *values,
            Decimal(str(co2)),
            Decimal(str(discount)),
            checkout,
            checkout,
            hotel_id,
            booking_id,
            checkout,
        ),
    )
    return cursor.rowcount == 1


def update_guest_stats(booking_id, hotel_id, usage_data, co2, discount):
    with transaction() as cursor:
        return update_booking(
            cursor, hotel_id, booking_id, usage_data, co2, discount, checkout=False
        )


def checkout_guest(booking_id, hotel_id, usage_data, co2, discount):
    with transaction() as cursor:
        if not update_booking(cursor, hotel_id, booking_id, usage_data, co2, discount, checkout=True):
            return None
        return find_booking(cursor, hotel_id, booking_id)


def booking_record(row):
    record = dict(row)
    record["timestamp"] = record["timestamp"].isoformat()
    checkout_time = record.pop("actual_checkout")
    if checkout_time is not None:
        record["actual_checkout"] = checkout_time.isoformat()
    return record


def find_booking(cursor, hotel_id, booking_id):
    cursor.execute(
        BOOKINGS + " WHERE b.hotel_id = %s AND b.booking_id = %s",
        (hotel_id, booking_id),
    )
    row = cursor.fetchone()
    return booking_record(row) if row else None


def get_booking(hotel_id, booking_id):
    with transaction() as cursor:
        return find_booking(cursor, hotel_id, booking_id)


def get_all_guests(hotel_id):
    with transaction() as cursor:
        cursor.execute(BOOKINGS + " WHERE b.hotel_id = %s ORDER BY b.created_at", (hotel_id,))
        return [booking_record(row) for row in cursor.fetchall()]


def get_guest_history_across_all_hotels(email):
    if not email:
        return []
    with transaction() as cursor:
        cursor.execute(
            BOOKINGS + " WHERE g.email = %s ORDER BY b.created_at",
            (email.strip().lower(),),
        )
        return [booking_record(row) for row in cursor.fetchall()]
