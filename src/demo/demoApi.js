/* eslint-disable */
/**
 * GreenStay — Demo Mode
 *
 * Free, static demo for GitHub Pages: intercepts the app's /api/* calls and
 * serves them from an in-browser mock store (persisted to localStorage).
 * No backend, no AWS, no real data. Enabled only when REACT_APP_DEMO=true.
 *
 * Demo credentials shown in the banner:
 *   Hotel  → ID: DEMO01  ·  password: demo123
 *   Guest  → email: guest@demo.com (any name/phone)
 */

const LS_KEY = "greenstay_demo_v1";

// Representative emission factors (demo only — the real app uses the
// greenstay carbon-calculator package on the backend).
function calcCO2({ electricity = 0, water = 0, meals = 0, laundry = 0 }) {
  const co2 =
    Number(electricity) * 0.82 + // kWh
    Number(water) * 0.004 + // litres
    Number(meals) * 2.1 + // meals
    Number(laundry) * 0.6; // kg
  return Math.round(co2 * 100) / 100;
}

function discountFor(co2) {
  const saved = Math.max(0, 20 - co2);
  return Math.min(13, Math.floor(saved / 1.5));
}

function seedStore() {
  const today = new Date();
  const day = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return d.toISOString().split("T")[0];
  };
  const mk = (seq, name, email, room, status, dayOff, usage, phone) => {
    const co2 = calcCO2(usage);
    return {
      bookingId: `DEMO01-${seq}`,
      hotel_id: "DEMO01",
      hotelName: "GreenStay Demo Hotel",
      name,
      email,
      phone: phone || "+91 90000 00000",
      room,
      status,
      date: day(dayOff),
      checkOutDate: status === "checked-in" ? day(-2) : day(dayOff - 2),
      timestamp: String(Date.now() - dayOff * 86400000),
      ...usage,
      co2,
      discount: discountFor(co2),
    };
  };
  return {
    hotels: {
      DEMO01: {
        hotel_id: "DEMO01",
        hotel_name: "GreenStay Demo Hotel",
        password: "demo123",
        email: "hotel@demo.com",
      },
    },
    guests: [
      mk(1001, "Asha Verma", "guest@demo.com", "204", "checked-out", 21, { electricity: 9, water: 620, meals: 4, laundry: 3 }),
      mk(1002, "Rohan Iyer", "rohan@demo.com", "310", "checked-out", 14, { electricity: 14, water: 940, meals: 6, laundry: 5 }),
      mk(1003, "Meera Nair", "meera@demo.com", "118", "checked-out", 8, { electricity: 6, water: 410, meals: 3, laundry: 2 }),
      mk(1004, "Asha Verma", "guest@demo.com", "402", "checked-in", 1, { electricity: 3, water: 180, meals: 2, laundry: 1 }),
      mk(1005, "Dev Patel", "dev@demo.com", "215", "checked-in", 0, { electricity: 1, water: 90, meals: 1, laundry: 0 }),
    ],
    nextSeq: 1006,
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const s = seedStore();
  saveStore(s);
  return s;
}

function saveStore(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (e) {}
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const csvResponse = (rows, filename) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return new Response(new Blob([csv], { type: "text/csv" }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment;filename=${filename}`,
    },
  });
};

function guestStats(store, email) {
  const matches = store.guests
    .filter((g) => g.email === email)
    .sort((a, b) => (b.timestamp || "0").localeCompare(a.timestamp || "0"));
  if (!matches.length) return null;
  const latest = { ...matches[0], is_active: matches[0].status === "checked-in" };
  return {
    latest,
    stats: {
      total_visits: matches.length,
      total_co2: Math.round(matches.reduce((s, g) => s + (Number(g.co2) || 0), 0) * 100) / 100,
      last_visit_co2: Number(latest.co2) || 0,
      history: matches,
    },
  };
}

async function handle(url, opts) {
  const store = loadStore();
  const method = (opts?.method || "GET").toUpperCase();
  const body = opts?.body ? JSON.parse(opts.body) : {};
  const path = url.replace(/^.*?\/api\//, "/api/").split("?")[0];
  // simulate network latency so spinners render naturally
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));

  // ---- LOGIN ----
  if (path === "/api/login" && method === "POST") {
    if (body.type === "hotel") {
      const h = store.hotels[String(body.id || "").toUpperCase()];
      if (h && h.password === body.password) {
        return json({ success: true, status: "ok", hotel_id: h.hotel_id, hotel_name: h.hotel_name });
      }
      return json({ success: false, status: h ? "Invalid password" : "Hotel ID not found" }, 401);
    }
    if (body.type === "customer") {
      const res = guestStats(store, body.email);
      if (!res) return json({ success: false, message: "No booking found matching credentials." }, 401);
      return json({
        success: true,
        message: "Login successful",
        hotel_id: res.latest.hotel_id,
        guest_data: res.latest,
        stats: res.stats,
      });
    }
    return json({ error: "Invalid login type" }, 400);
  }

  // ---- HOTEL REGISTRATION ----
  if (path === "/api/hotel-registration" && method === "POST") {
    const code = (String(body.hotel_name || "DEMO").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() + "XXXX").slice(0, 4) + String(10 + Math.floor(Math.random() * 89));
    store.hotels[code] = {
      hotel_id: code,
      hotel_name: body.hotel_name,
      password: body.password,
      email: body.hotel_email,
    };
    saveStore(store);
    return json({ success: true, status: "Hotel registered", hotel_id: code });
  }

  // ---- GUEST LIST ----
  const guestsMatch = path.match(/^\/api\/guests\/([^/]+)$/);
  if (guestsMatch && method === "GET") {
    const hid = guestsMatch[1];
    const items = store.guests
      .filter((g) => g.hotel_id === hid)
      .sort((a, b) => {
        const p = (a.status !== "checked-in") - (b.status !== "checked-in");
        return p !== 0 ? p : (a.timestamp || "").localeCompare(b.timestamp || "");
      });
    return json(items);
  }

  // ---- CHECK-IN / UPDATE-STATS / CHECK-OUT ----
  if (path === "/api/guests" && method === "POST") {
    if (body.status === "update-stats" || body.status === "checked-out") {
      const g = store.guests.find((x) => x.bookingId === body.bookingId);
      if (!g) return json({ error: "Booking not found" }, 404);
      const usage = {
        electricity: Number(body.electricity) || 0,
        water: Number(body.water) || 0,
        laundry: Number(body.laundry) || 0,
        meals: Number(body.meals) || 0,
      };
      const co2 = calcCO2(usage);
      Object.assign(g, usage, { co2, discount: discountFor(co2) });
      if (body.status === "checked-out") {
        g.status = "checked-out";
        saveStore(store);
        return json({ status: "Checked out" });
      }
      saveStore(store);
      return json({ status: "Updated", co2, discount: g.discount });
    }
    // check-in
    const bookingId = `DEMO01-${store.nextSeq}`;
    store.nextSeq += 1;
    store.guests.push({
      bookingId,
      hotel_id: body.hotel_id,
      hotelName: store.hotels[body.hotel_id]?.hotel_name || "GreenStay Demo Hotel",
      name: body.name,
      email: body.email,
      phone: body.phone,
      room: body.room,
      status: "checked-in",
      date: body.date,
      checkOutDate: body.checkOutDate || "",
      timestamp: String(Date.now()),
      electricity: 0,
      water: 0,
      laundry: 0,
      meals: 0,
      co2: 0,
      discount: 0,
    });
    saveStore(store);
    return json({ success: true, bookingId, hotelName: store.hotels[body.hotel_id]?.hotel_name });
  }

  // ---- GUEST PORTAL ----
  const portalMatch = path.match(/^\/api\/guest-portal\/([^/]+)$/);
  if (portalMatch && method === "GET") {
    const g = store.guests.find((x) => x.bookingId === portalMatch[1]);
    if (!g) return json({ error: "Booking not found" }, 404);
    const res = guestStats(store, g.email);
    return json({ success: true, guest_data: { ...g, is_active: g.status === "checked-in" }, stats: res.stats });
  }

  // ---- CSV DOWNLOADS ----
  const dlHotel = path.match(/^\/api\/download\/hotel\/([^/]+)$/);
  if (dlHotel && method === "GET") {
    const items = store.guests.filter((g) => g.hotel_id === dlHotel[1]);
    if (!items.length) return json({ error: "No data" }, 404);
    return csvResponse(
      [["Booking ID", "Name", "Email", "Room", "Status", "Check In", "CO2 (kg)"]].concat(
        items.map((g) => [g.bookingId, g.name, g.email, g.room, g.status, g.date, g.co2])
      ),
      `${dlHotel[1]}_data.csv`
    );
  }
  if (path === "/api/download/guest" && method === "POST") {
    const items = store.guests.filter((g) => g.email === body.email);
    if (!items.length) return json({ error: "No history" }, 404);
    return csvResponse(
      [["Hotel", "Date", "CO2 (kg)", "Electricity", "Water"]].concat(
        items.map((g) => [g.hotelName, g.date, g.co2, g.electricity, g.water])
      ),
      "my_history.csv"
    );
  }

  return json({ error: "Not found (demo)" }, 404);
}

export function installDemoApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, opts) => {
    const url = typeof input === "string" ? input : input.url;
    if (url && (url.startsWith("/api/") || url.includes("/api/"))) {
      return handle(url, opts);
    }
    return realFetch(input, opts);
  };

  // Demo banner with credentials + reset
  const banner = document.createElement("div");
  banner.setAttribute("style", [
    "position:fixed", "bottom:0", "left:0", "right:0", "z-index:99999",
    "background:#064e3b", "color:#d1fae5", "font:12px/1.6 system-ui,sans-serif",
    "padding:6px 12px", "text-align:center",
  ].join(";"));
  banner.innerHTML =
    '🌿 <b>Demo mode</b> — sample data only, stored in your browser. ' +
    'Hotel login: <b>DEMO01</b> / <b>demo123</b> · Guest login: <b>guest@demo.com</b> ' +
    '<button id="gs-demo-reset" style="margin-left:8px;background:#10b981;color:#022c22;border:0;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:600">Reset data</button>';
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(banner));
  if (document.body) document.body.appendChild(banner);
  banner.addEventListener("click", (e) => {
    if (e.target && e.target.id === "gs-demo-reset") {
      localStorage.removeItem(LS_KEY);
      window.location.reload();
    }
  });
}
