# --- Hotel Registration Template ---
HOTEL_REGISTRATION_SUBJECT = "Welcome to GreenStay! 🌿 Registration Successful"

HOTEL_REGISTRATION_BODY = """Dear {hotel_name} Team,

Welcome to the GreenStay family! We are thrilled to have you onboard as a partner in our mission to promote sustainable hospitality.

Your registration is now complete. Below are your credentials to access the Hotel Dashboard:

--------------------------------------------------
🏨 Hotel ID: {hotel_id}
📧 Registered Email: {hotel_email}
--------------------------------------------------

HOW TO GET STARTED:
1. Log In: Use the Hotel ID above and the password you set during registration.
2. Manage Guests: Start checking in guests to track resource usage.
3. Monitor Impact: View your real-time carbon footprint reduction on your dashboard.

Thank you for committing to a greener future!

Warm regards,

The GreenStay Team
"""

# --- Guest Check-In Template ---
GUEST_CHECKIN_SUBJECT = "Welcome to {hotel_name} - Your GreenStay Journey Begins"

GUEST_CHECKIN_BODY = """Welcome, {guest_name}!

You have successfully checked in. We are tracking your sustainable choices during your stay.

--------------------------------------------------
🏨 Hotel: {hotel_name}
🛏️ Room: {room_number}
📅 Booking ID: {booking_id}
⏰ Check-in Time: {checkin_time}
--------------------------------------------------

You can track your carbon footprint and view your eco-score on the GreenStay Guest Portal using the Booking ID above.

Have a wonderful and sustainable stay!

Warm regards,

The GreenStay Team
"""

# --- New User Welcome Template ---
NEW_GUEST_WELCOME_SUBJECT = "Welcome to the GreenStay Community! 🌍"

NEW_GUEST_WELCOME_BODY = """Hello {guest_name},

Welcome to the GreenStay community! We are excited to have you join a growing movement of eco-conscious travelers.

By staying with our partner hotels, you are actively helping to reduce carbon emissions and conserve resources.

WHAT YOU CAN DO:
1. Track Your Impact: See exactly how much CO2, water, and energy you save during your trips.
2. Earn Rewards: Sustainable choices can earn you discounts at participating hotels.
3. Travel Greener: Access your history across all GreenStay partners in one place.

Thank you for traveling responsibly.

Warm regards,

The GreenStay Team
"""

# --- Guest Check-Out Template (Detailed) ---
GUEST_CHECKOUT_SUBJECT = "Thank You for Staying with {hotel_name} 🌿"

GUEST_CHECKOUT_BODY = """Dear {guest_name},

Thank you for choosing {hotel_name} for your stay. We hope you had a comfortable and sustainable visit.

Here is the detailed environmental impact of your stay:

--------------------------------------------------
🏨 Hotel: {hotel_name}
📅 Booking ID: {booking_id}

📊 Resource Usage:
⚡ Electricity: {elec} kWh
💧 Water: {water} L
🧺 Laundry: {laundry} kg
🍽️ Meals: {meals}

🌱 Total CO2 Footprint: {co2} kg
🎁 Discount Earned: {discount}%
--------------------------------------------------

We appreciate your efforts in conserving resources. Your choices have made a real difference!

Safe travels, and we look forward to welcoming you back soon.

Warm regards,

The GreenStay Team
"""
