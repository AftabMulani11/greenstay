import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, Button, Input, Select, Label, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Modal, Badge } from "../components/ui";
import { toast } from "sonner";
import { Leaf, LogOut, UserPlus, Hash, User, BedDouble, Save, CheckCircle, Calendar, Mail, Phone, Clock, Activity, Loader2, Download, Lock } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCountries } from "../Hooks/use-countries";

export default function HotelDashboard() {
  const navigate = useNavigate();
  const { state } = useLocation();
  
  // Initialize state from location or localStorage to prevent logout on refresh/back
  const [hotelId] = useState(() => state?.hotel_id || localStorage.getItem("hotel_id"));
  const [hotelName] = useState(() => state?.hotelName || localStorage.getItem("hotel_name") || "Grand Hotel");
  
  const { countries } = useCountries();
  const [guests, setGuests] = useState([]);
  const [activeTab, setActiveTab] = useState("active"); 
  const [isCheckOutOpen, setIsCheckOutOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  // New State for handling table creation wait
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Persist session
  useEffect(() => {
    if (hotelId) {
      localStorage.setItem("hotel_id", hotelId);
      localStorage.setItem("hotel_name", hotelName);
    }
  }, [hotelId, hotelName]);

  const fetchGuests = useCallback(async () => {
    if (!hotelId) return;
    try {
      const res = await fetch(`/api/guests/${hotelId}`);
      
      // Handle "Setting up" state from backend
      if (res.status === 202) {
          setIsSettingUp(true);
          return;
      }

      if (res.ok) {
        const data = await res.json();
        setGuests(data);
        setIsSettingUp(false); // Clear setup state if successful
      }
    } catch (error) {
      console.error("Failed to fetch guests:", error);
      toast.error("Could not load guest data");
    }
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId) {
      toast.error("Session expired. Please login again.");
      navigate("/login/hotel");
    } else {
      fetchGuests();
    }
  }, [fetchGuests, hotelId, navigate]);

  // Calculate Next Booking ID
  const nextBookingId = useMemo(() => {
    if (!hotelId) return "Loading...";
    
    // Default start is 1000, so next is 1001
    let maxSequence = 1000;

    if (guests && guests.length > 0) {
      guests.forEach(g => {
        // Assuming ID format is "HOTELID-SEQUENCE"
        if (g.bookingId && g.bookingId.includes('-')) {
          const parts = g.bookingId.split('-');
          // Use the last part as the sequence number
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq) && seq > maxSequence) {
            maxSequence = seq;
          }
        }
      });
    }

    return `${hotelId}-${maxSequence + 1}`;
  }, [guests, hotelId]);

  // State for New Check-In
  const [checkInForm, setCheckInForm] = useState({ 
    date: new Date().toISOString().split('T')[0],
    name: "", room: "", email: "", countryCode: "+91", phoneNumber: ""
  });

  const [usageForm, setUsageForm] = useState({
    electricity: "", water: "", laundry: "", meals: ""
  });

  const handleCheckIn = async (e) => {
    e.preventDefault();
    
    const fullPhone = checkInForm.phoneNumber ? `${checkInForm.countryCode} ${checkInForm.phoneNumber}` : "";
    const payload = { 
      ...checkInForm, 
      phone: fullPhone, 
      hotel_id: hotelId, // Pass ID to backend
      status: 'checked-in',
    };

    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) throw new Error("Check-in failed");
      
      const generatedId = data.bookingId || data.booking_id;
      toast.success(`Guest Checked In! ID: ${generatedId || nextBookingId}`);

      await fetchGuests(); 
      
      setCheckInForm(prev => ({ ...prev, name: "", room: "", email: "", phoneNumber: "" }));
    } catch (error) {
      console.error(error);
      toast.error("Failed to save check-in");
    }
  };

  const openCheckOut = (e, guest) => {
    e.stopPropagation();
    setSelectedGuest(guest);
    // Pre-fill if data exists
    setUsageForm({ 
        electricity: guest.electricity || "", 
        water: guest.water || "", 
        laundry: guest.laundry || "", 
        meals: guest.meals || "" 
    });
    setIsCheckOutOpen(true);
  };

  // NEW: Calculate and Save (Without Checkout)
  const handleSaveStats = async (e) => {
    e.preventDefault();
    if (selectedGuest.status === 'checked-out') return; // Safety check
    
    try {
      const payload = {
        ...usageForm,
        bookingId: selectedGuest.bookingId,
        hotel_id: hotelId,
        status: 'update-stats' 
      };

      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Update failed");
      const data = await res.json();
      
      await fetchGuests();
      toast.success(`Data Saved! CO₂: ${data.co2}kg`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save data");
    }
  };

  // Final Checkout
  const handleFinalCheckout = async () => {
    if(!window.confirm("Has the guest confirmed the details? This action is final.")) return;
    if (selectedGuest.status === 'checked-out') return; // Safety check

    try {
      const payload = {
        ...usageForm,
        bookingId: selectedGuest.bookingId,
        hotel_id: hotelId,
        status: 'checked-out'
      };

      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Checkout failed");
      
      await fetchGuests();
      setIsCheckOutOpen(false);
      toast.success("Guest successfully checked out!");
    } catch (error) {
      toast.error("Checkout failed");
    }
  };

  // Download Handler for Hotel Data
  const handleDownloadHotelData = async () => {
    try {
        const response = await fetch(`/api/download/hotel/${hotelId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "No data available for export.");
        }
        
        // Use Blob to handle the CSV file download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${hotelId}_guest_data.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Hotel guest data downloaded successfully!");
        
    } catch (error) {
        console.error("Download failed:", error);
        toast.error(error.message || "Could not download hotel data.");
    }
  };

  const activeGuests = guests.filter(g => g.status === 'checked-in');
  const historyGuests = guests.filter(g => g.status === 'checked-out');

  // Map countries with flag images for the dropdown
  const countryOptions = countries.map(c => ({
    value: c.code,
    label: (
      <div className="flex items-center gap-2">
        <img src={c.flagUrl} alt={c.name} className="w-5 h-3.5 object-cover rounded-sm shadow-sm" />
        <span>{c.name} ({c.code})</span>
      </div>
    ),
    shortLabel: (
      <div className="flex items-center gap-2">
        <img src={c.flagUrl} alt={c.name} className="w-5 h-3.5 object-cover rounded-sm shadow-sm" />
        <span>{c.code}</span>
      </div>
    )
  }));

  const isSelectedGuestCheckedOut = selectedGuest?.status === 'checked-out';

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Navigation */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Leaf className="w-6 h-6 text-primary" />
              </div>
              {hotelName}
            </h1>
            <p className="text-slate-500 text-sm ml-12">Hotel ID: <span className="font-mono font-medium text-slate-700">{hotelId}</span></p>
          </div>
          <div className="flex gap-3">
             <div className="hidden md:flex gap-4 mr-6 items-center">
                 <div className="text-center px-4 border-r border-slate-100">
                    <p className="text-2xl font-bold text-primary">{activeGuests.length}</p>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Active</p>
                 </div>
                 <div className="text-center">
                    <p className="text-2xl font-bold text-slate-700">{historyGuests.length}</p>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total</p>
                 </div>
             </div>
             
             {/* Download Button */}
             <Button variant="secondary" onClick={handleDownloadHotelData} className="h-10 gap-2" disabled={isSettingUp || guests.length === 0}>
                <Download className="w-4 h-4"/> Download Data
             </Button>

             <Button variant="secondary" onClick={() => {
                 localStorage.removeItem("hotel_id");
                 localStorage.removeItem("hotel_name");
                 navigate("/");
             }} className="h-10">
                <LogOut className="w-4 h-4 mr-2"/> Sign Out
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Check In Form - Takes up 4 columns on large screens */}
          <div className="lg:col-span-4 space-y-6">
            {/* Removed overflow-hidden to allow dropdown to overflow */}
            <Card className="border-none shadow-lg">
              <div className="bg-primary/5 p-6 border-b border-primary/10 rounded-t-xl">
                <CardTitle className="flex items-center gap-2 text-lg text-primary">
                    <UserPlus className="w-5 h-5"/> New Check-In
                </CardTitle>
                <CardDescription className="text-primary/70">Register guest details below</CardDescription>
              </div>
              <CardContent className="p-6">
                <form onSubmit={handleCheckIn} className="space-y-5">
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Booking ID</Label>
                        <div className="relative">
                           <Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                           <Input 
                              value={nextBookingId} 
                              disabled 
                              className="pl-9 bg-slate-50 text-slate-500 font-semibold" 
                           />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Date</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input 
                                type="date" 
                                value={checkInForm.date} 
                                onChange={e => setCheckInForm({...checkInForm, date: e.target.value})} 
                                className="pl-9"
                                required 
                            />
                        </div>
                      </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Guest Name</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                            placeholder="e.g. Jane Doe"
                            value={checkInForm.name} 
                            onChange={e => setCheckInForm({...checkInForm, name: e.target.value})} 
                            className="pl-9"
                            required 
                        />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Room No</Label>
                      <div className="relative">
                          <BedDouble className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder="101"
                            value={checkInForm.room} 
                            onChange={e => setCheckInForm({...checkInForm, room: e.target.value})} 
                            className="pl-9"
                            required 
                          />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Email</Label>
                      <div className="relative">
                          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input 
                            type="email" 
                            placeholder="guest@mail.com"
                            value={checkInForm.email} 
                            onChange={e => setCheckInForm({...checkInForm, email: e.target.value})} 
                            className="pl-9"
                            required 
                          />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Phone Number</Label>
                    <div className="flex gap-2">
                      <div className="w-[140px]">
                        <Select 
                          value={checkInForm.countryCode} 
                          onChange={val => setCheckInForm({...checkInForm, countryCode: val})} 
                          options={countryOptions} 
                        />
                      </div>
                      <div className="relative flex-1">
                          <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input 
                            type="tel" 
                            placeholder="9876543210"
                            value={checkInForm.phoneNumber} 
                            onChange={e => /^\d*$/.test(e.target.value) && setCheckInForm({...checkInForm, phoneNumber: e.target.value})} 
                            className="pl-9"
                          />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-2 bg-primary hover:bg-primary/90 h-11 text-base shadow-md shadow-primary/20">
                    Check In Guest
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Guest List - Takes up 8 columns */}
          <Card className="lg:col-span-8 border-none shadow-lg flex flex-col h-full min-h-[600px]">
            <div className="flex items-center justify-between p-2 border-b border-slate-100 bg-white rounded-t-xl">
              <div className="flex gap-1 bg-slate-100/80 p-1 rounded-lg">
                  <button 
                    onClick={() => setActiveTab("active")} 
                    className={`px-6 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${activeTab === 'active' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Active Stays
                  </button>
                  <button 
                    onClick={() => setActiveTab("history")} 
                    className={`px-6 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    History
                  </button>
              </div>
              <div className="pr-4 text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last updated: {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-white">
              {isSettingUp ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                      <p className="text-lg font-semibold text-slate-700">Setting up the dashboard...</p>
                      <p className="text-sm">Please refresh in a few moments.</p>
                  </div>
              ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[120px] bg-slate-50 text-slate-600 font-bold">Booking ID</TableHead>
                        <TableHead className="bg-slate-50 text-slate-600 font-bold">Guest</TableHead>
                        <TableHead className="bg-slate-50 text-slate-600 font-bold">Room</TableHead>
                        <TableHead className="bg-slate-50 text-slate-600 font-bold">Check-In</TableHead>
                        {activeTab === 'history' && <TableHead className="bg-slate-50 text-slate-600 font-bold">CO₂</TableHead>}
                        <TableHead className="text-right bg-slate-50 text-slate-600 font-bold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activeTab === 'active' ? activeGuests : historyGuests).map((g) => (
                        <TableRow key={g.bookingId} onClick={() => navigate(`/guest/${g.bookingId}`, { state: { guest: g } })} className="cursor-pointer hover:bg-slate-50 group transition-colors">
                          <TableCell className="font-mono text-xs font-medium text-primary group-hover:underline">{g.bookingId}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                    <User className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900">{g.name}</div>
                                    <div className="text-xs text-slate-500">{g.email}</div>
                                </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-white">{g.room}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">{g.date || g.checkInDate}</TableCell>
                          {activeTab === 'history' && <TableCell className="font-medium text-slate-700">{g.co2} kg</TableCell>}
                          <TableCell className="text-right">
                            {activeTab === 'active' ? (
                                <Button size="sm" variant="outline" onClick={(e) => openCheckOut(e, g)} className="border-primary/20 text-primary hover:bg-primary/5">
                                    Manage
                                </Button>
                            ) : (
                                <Badge variant="success" className="bg-emerald-50 text-emerald-600 border-emerald-100">Completed</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(activeTab === 'active' ? activeGuests : historyGuests).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-64 text-center">
                            <div className="flex flex-col items-center justify-center text-slate-400">
                                <div className="bg-slate-50 p-4 rounded-full mb-3">
                                    <Activity className="w-8 h-8 opacity-50" />
                                </div>
                                <p>No {activeTab} guests found.</p>
                            </div> 
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Management Modal */}
      <Modal isOpen={isCheckOutOpen} onClose={() => setIsCheckOutOpen(false)} title={`Manage Stay: ${selectedGuest?.name}`}>
        {isSelectedGuestCheckedOut ? (
            <div className="p-6 bg-slate-100 border border-slate-300 rounded-xl text-center">
                <Lock className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                <p className="text-lg font-bold text-slate-700">Record Finalized</p>
                <p className="text-sm text-slate-500">This guest has already checked out and this record is not editable.</p>
            </div>
        ) : (
            <form className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm flex gap-3 items-start">
                <div className="mt-0.5 bg-blue-100 p-1 rounded-full"><Activity className="w-3 h-3" /></div>
                <div>
                    <p className="font-semibold mb-1">Live Data Management</p>
                    Update usage data so the guest can view it on their portal immediately. Only click "Final Checkout" when the guest is leaving.
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Electricity (kWh)</Label>
                    <Input type="number" min="0" value={usageForm.electricity} onChange={e => setUsageForm({...usageForm, electricity: e.target.value})} className="bg-slate-50"/>
                </div>
                <div className="space-y-2">
                    <Label>Water (L)</Label>
                    <Input type="number" min="0" value={usageForm.water} onChange={e => setUsageForm({...usageForm, water: e.target.value})} className="bg-slate-50"/>
                </div>
                <div className="space-y-2">
                    <Label>Laundry (kg)</Label>
                    <Input type="number" min="0" value={usageForm.laundry} onChange={e => setUsageForm({...usageForm, laundry: e.target.value})} className="bg-slate-50"/>
                </div>
                <div className="space-y-2">
                    <Label>Meals (count)</Label>
                    <Input type="number" min="0" value={usageForm.meals} onChange={e => setUsageForm({...usageForm, meals: e.target.value})} className="bg-slate-50"/>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={handleSaveStats} className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5 h-11">
                <Save className="w-4 h-4" /> Calculate & Save
                </Button>
                <Button type="button" onClick={handleFinalCheckout} className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white h-11 shadow-red-100 shadow-lg">
                <CheckCircle className="w-4 h-4" /> Final Checkout
                </Button>
            </div>
            </form>
        )}
      </Modal>
    </div>
  );
}