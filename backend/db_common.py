import re
from decimal import Decimal

from argon2 import PasswordHasher


hasher = PasswordHasher()


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
